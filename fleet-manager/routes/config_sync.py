"""
Config Sync Routes
API endpoints for managing printer configuration templates and syncing to printers
"""
import base64
import hashlib
import json
import logging
import os
import re
import secrets
from datetime import datetime
from pathlib import Path

from aiohttp import web

from models.config_template import ConfigTemplateModel, ConfigTemplate, PrinterConfigStatusModel, PrinterConfigStatus
from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)

SYNTH_OUTPUT_ROOT = Path(os.environ.get('BFP_SYNTH_OUTPUT_DIR', 'version_controlled_configs'))
SYNTH_TARGET_FILES = {'printer.cfg', 'mainsail-idex.cfg'}
PASSTHROUGH_SYNTH_TARGET_FILES = {'mainsail-idex.cfg'}

PIN_PARAMETERS = {
    'step_pin', 'dir_pin', 'enable_pin', 'endstop_pin',
    'heater_pin', 'sensor_pin', 'cs_pin', 'uart_pin',
    'diag_pin', 'diag0_pin', 'diag1_pin',
    'tx_pin', 'rx_pin', 'spi_bus', 'i2c_bus', 'i2c_mcu',
    'spi_software_mosi_pin', 'spi_software_miso_pin', 'spi_software_sclk_pin',
    'canbus_uuid', 'canbus_interface'
}

POSITIONAL_PARAMETERS = {
    'position_endstop', 'position_min', 'position_max',
    'x_offset', 'y_offset', 'z_offset',
    'home_xy_position', 'mesh_min', 'mesh_max',
    'horizontal_move_z', 'safe_distance', 'endstop_align_zero'
}

MIGRATABLE_PARAMETERS = PIN_PARAMETERS | POSITIONAL_PARAMETERS


def normalize_config_path(path: str) -> str:
    return (path or '').replace('\\', '/').lstrip('/').strip()


def basename(path: str) -> str:
    normalized = normalize_config_path(path)
    return normalized.rsplit('/', 1)[-1] if normalized else ''


def is_passthrough_synth_template(template: ConfigTemplate) -> bool:
    return (
        basename(template.filename) in PASSTHROUGH_SYNTH_TARGET_FILES
        or basename(template.name) in PASSTHROUGH_SYNTH_TARGET_FILES
    )


def is_printer_cfg_template(template: ConfigTemplate) -> bool:
    return basename(template.filename) == 'printer.cfg' or basename(template.name) == 'printer.cfg'


def resolve_template_target_path(template: ConfigTemplate) -> str:
    """
    Resolve the runtime destination path used for config_sync writes.

    Preference order:
    1) explicit source_path binding
    2) logical template name (canonical file name in this schema)
    3) uploaded filename fallback
    """
    for raw in [getattr(template, 'source_path', ''), template.name, template.filename]:
        normalized = normalize_config_path(raw)
        if normalized:
            return normalized
    return normalize_config_path(template.filename or 'config.cfg') or 'config.cfg'


def select_templates_for_sync(templates: list[ConfigTemplate], template_ids: set[str] | None = None) -> list[ConfigTemplate]:
    templates_by_target = {}

    for template in templates:
        if template_ids is not None and template.id not in template_ids:
            continue

        target_path = resolve_template_target_path(template)
        existing = templates_by_target.get(target_path)
        if not existing or (template.updated_at or '') > (existing.updated_at or ''):
            templates_by_target[target_path] = template

    selected_templates = list(templates_by_target.values())
    selected_templates.sort(
        key=lambda tpl: (
            0 if basename(resolve_template_target_path(tpl)) in SYNTH_TARGET_FILES else 1,
            basename(resolve_template_target_path(tpl))
        )
    )
    return selected_templates


def compose_printer_object_source(source_entry: dict, source_files: list[dict]) -> dict:
    """
    Build a merged source stream for printer.cfg migration from all object cfg files.

    Legacy schemas may spread physical sections across separate files (for example
    hermit-crab board cfgs and IDEX cfg). We keep printer.cfg first and append
    other object cfg files, while excluding mainsail-idex.cfg because that file
    is macro-oriented in the new schema.
    """
    primary_path = normalize_config_path((source_entry or {}).get('path', ''))
    primary_content = (source_entry or {}).get('content') or ''
    origin = (source_entry or {}).get('origin')

    merged_items: list[dict] = []
    seen_paths = set()

    if primary_path and isinstance(primary_content, str) and primary_content != '':
        merged_items.append({'path': primary_path, 'content': primary_content})
        seen_paths.add(primary_path)

    extras = []
    for file_item in source_files or []:
        path = normalize_config_path((file_item or {}).get('path', ''))
        content = (file_item or {}).get('content')
        if not path or not isinstance(content, str) or content == '':
            continue
        if path in seen_paths:
            continue

        base = basename(path).lower()
        if not base.endswith('.cfg'):
            continue
        if base == 'mainsail-idex.cfg':
            continue

        extras.append({'path': path, 'content': content})

    extras.sort(key=lambda item: item['path'])
    merged_items.extend(extras)

    merged_content = '\n\n'.join(item['content'] for item in merged_items)
    merged_paths = [item['path'] for item in merged_items]

    return {
        'path': primary_path,
        'content': merged_content,
        'origin': origin,
        'mergedPaths': merged_paths,
    }


def extract_section_values(section_content: str) -> dict:
    values = {}
    for raw_line in section_content.split('\n'):
        line = raw_line.strip()
        if not line or line.startswith('#') or line.startswith('['):
            continue

        for param in MIGRATABLE_PARAMETERS:
            if line.startswith(f'{param}:') or line.startswith(f'{param}='):
                if ':' in line:
                    value = line.split(':', 1)[1].strip()
                else:
                    value = line.split('=', 1)[1].strip()

                if '#' in value:
                    value = value.split('#', 1)[0].strip()

                if value:
                    values[param] = value
                break

    return values


def extract_config_values(content: str) -> dict:
    extracted = {}
    section_pattern = re.compile(r'^\[(?P<name>[^\]]+)\][\s\S]*?(?=^\[|\Z)', re.MULTILINE)

    for section_match in section_pattern.finditer(content or ''):
        section_name = section_match.group('name')
        section_values = extract_section_values(section_match.group(0))
        if section_values:
            extracted[section_name] = section_values

    return extracted


def _parameter_category(param: str) -> str:
    if param in PIN_PARAMETERS:
        return 'pin'
    if param in POSITIONAL_PARAMETERS:
        return 'position'
    return 'other'


def build_verification_summary(source_content: str, candidate_content: str) -> dict:
    source_values = extract_config_values(source_content)
    candidate_values = extract_config_values(candidate_content)

    issues = []
    mappings = []
    pin_total = 0
    pin_matched = 0
    position_total = 0
    position_matched = 0

    for section_name, section_params in source_values.items():
        candidate_section = candidate_values.get(section_name, {})

        for param, expected_value in section_params.items():
            category = _parameter_category(param)
            if category == 'pin':
                pin_total += 1
            elif category == 'position':
                position_total += 1

            if param not in candidate_section:
                issues.append({
                    'type': 'missing',
                    'section': section_name,
                    'parameter': param,
                    'expected': expected_value,
                    'actual': None,
                    'category': category,
                })
                mappings.append({
                    'section': section_name,
                    'parameter': param,
                    'sourceValue': expected_value,
                    'newValue': None,
                    'status': 'missing',
                    'category': category,
                })
                continue

            actual_value = candidate_section[param]
            if actual_value != expected_value:
                issues.append({
                    'type': 'mismatch',
                    'section': section_name,
                    'parameter': param,
                    'expected': expected_value,
                    'actual': actual_value,
                    'category': category,
                })
                mappings.append({
                    'section': section_name,
                    'parameter': param,
                    'sourceValue': expected_value,
                    'newValue': actual_value,
                    'status': 'mismatch',
                    'category': category,
                })
                continue

            if category == 'pin':
                pin_matched += 1
            elif category == 'position':
                position_matched += 1

            mappings.append({
                'section': section_name,
                'parameter': param,
                'sourceValue': expected_value,
                'newValue': actual_value,
                'status': 'matched',
                'category': category,
            })

    total_checks = pin_total + position_total
    matched_checks = pin_matched + position_matched

    return {
        'totalChecks': total_checks,
        'matchedChecks': matched_checks,
        'missingChecks': sum(1 for issue in issues if issue['type'] == 'missing'),
        'mismatchedChecks': sum(1 for issue in issues if issue['type'] == 'mismatch'),
        'pinChecks': pin_total,
        'pinMatched': pin_matched,
        'positionChecks': position_total,
        'positionMatched': position_matched,
        'issues': issues,
        'mappings': mappings,
    }


def apply_values_to_section(section_content: str, values: dict) -> str:
    if not values:
        return section_content

    result = section_content
    for param, value in values.items():
        pattern = rf'^({re.escape(param)}[=:]\s*)[^\n#]*(#.*)?$'

        def replacement(match):
            prefix = match.group(1)
            comment = match.group(2)
            if comment:
                return f"{prefix}{value}  {comment}"
            return f"{prefix}{value}"

        result = re.sub(pattern, replacement, result, flags=re.MULTILINE)

    return result


def migrate_template_with_source(template_content: str, source_content: str) -> str:
    result = template_content
    source_section_pattern = re.compile(r'^\[(?P<name>[^\]]+)\][\s\S]*?(?=^\[|\Z)', re.MULTILINE)

    for source_section_match in source_section_pattern.finditer(source_content):
        section_name = source_section_match.group('name')
        source_section = source_section_match.group(0)
        source_values = extract_section_values(source_section)
        if not source_values:
            continue

        template_section_pattern = re.compile(
            rf'^\[{re.escape(section_name)}\][\s\S]*?(?=^\[|\Z)',
            re.MULTILINE
        )
        template_match = template_section_pattern.search(result)
        if not template_match:
            continue

        template_section = template_match.group(0)
        updated_section = apply_values_to_section(template_section, source_values)
        if updated_section == template_section:
            continue

        result = result[:template_match.start()] + updated_section + result[template_match.end():]

    return result


def bump_version(version: str) -> str:
    cleaned = (version or '').strip()
    parts = cleaned.split('.')
    if len(parts) >= 1 and all(part.isdigit() for part in parts):
        values = [int(part) for part in parts]
        values[-1] += 1
        return '.'.join(str(v) for v in values)
    if cleaned:
        return f'{cleaned}.1'
    return '1.0'


def _candidate_template_paths(template: ConfigTemplate) -> list:
    candidates = []
    seen = set()

    for raw in [template.filename, template.name]:
        normalized = normalize_config_path(raw)
        if not normalized or normalized in seen:
            continue
        candidates.append(normalized)
        seen.add(normalized)

    return candidates


def find_source_file_for_template(template: ConfigTemplate, files_by_path: dict, files_by_basename: dict):
    bound_path = normalize_config_path(template.source_path or '')
    if bound_path:
        bound_entry = files_by_path.get(bound_path)
        if bound_entry:
            return bound_entry, {
                'matchType': 'bound_path',
                'boundPath': bound_path,
                'ambiguous': False,
                'candidateCount': 1,
            }, None

        return None, None, f'Bound source path "{bound_path}" was not present in running config files'

    template_paths = _candidate_template_paths(template)

    for candidate_path in template_paths:
        exact = files_by_path.get(candidate_path)
        if exact:
            return exact, {
                'matchType': 'exact_path',
                'boundPath': None,
                'ambiguous': False,
                'candidateCount': 1,
            }, None

    for candidate_path in template_paths:
        candidate_basename = basename(candidate_path)
        if not candidate_basename:
            continue

        basename_candidates = files_by_basename.get(candidate_basename) or []
        if not basename_candidates:
            continue

        sorted_candidates = sorted(
            basename_candidates,
            key=lambda entry: normalize_config_path(entry.get('path', '')),
        )
        selected = sorted_candidates[0]
        return selected, {
            'matchType': 'basename',
            'boundPath': None,
            'ambiguous': len(sorted_candidates) > 1,
            'candidateCount': len(sorted_candidates),
        }, None

    return None, None, 'No matching running config file found'


def compute_content_hash(content: str) -> str:
    """Compute SHA-256 hash of content"""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def _candidate_printer_dirs(printer) -> list[Path]:
    values = [
        normalize_config_path(getattr(printer, 'printer_id', '') or ''),
        normalize_config_path(getattr(printer, 'name', '') or ''),
        normalize_config_path(getattr(printer, 'host', '') or ''),
    ]

    candidates = []
    seen = set()
    for value in values:
        if not value:
            continue

        leaf = basename(value).replace('.local', '')
        if not leaf or leaf in seen:
            continue

        seen.add(leaf)
        candidates.append(SYNTH_OUTPUT_ROOT / leaf)

    return candidates


def _load_synthesized_files_for_printer(printer) -> list[dict]:
    loaded = []

    for printer_dir in _candidate_printer_dirs(printer):
        if not printer_dir.exists() or not printer_dir.is_dir():
            continue

        for filename in sorted(SYNTH_TARGET_FILES):
            path = printer_dir / filename
            if not path.exists() or not path.is_file():
                continue

            try:
                content = path.read_text(encoding='utf-8')
            except Exception:
                continue

            loaded.append({
                'path': filename,
                'basename': filename,
                'content': content,
                'origin': 'synthesized',
                'diskPath': str(path),
            })

        if loaded:
            break

    return loaded


def _build_files_maps(files: list[dict]) -> tuple[dict, dict]:
    files_by_path = {}
    files_by_basename = {}

    for entry in files:
        file_path = normalize_config_path((entry or {}).get('path', ''))
        content = (entry or {}).get('content')
        if not file_path or not isinstance(content, str) or content == '':
            continue

        normalized_entry = {
            'path': file_path,
            'basename': basename(file_path),
            'content': content,
            'origin': (entry or {}).get('origin'),
        }
        files_by_path[file_path] = normalized_entry
        files_by_basename.setdefault(normalized_entry['basename'], []).append(normalized_entry)

    return files_by_path, files_by_basename


@require_auth
async def list_config_templates(request: web.Request):
    """List all config templates"""
    db: DatabaseService = request.app['db']
    
    try:
        templates = db.get_config_templates()
        return web.json_response({
            'templates': [t.to_dict() for t in templates]
        })
    except Exception as e:
        logger.error(f"Error listing config templates: {e}")
        return web.json_response({'error': 'Failed to load templates'}, status=500)


@require_auth
async def get_config_template(request: web.Request):
    """Get a single config template by ID (includes content)"""
    template_id = request.match_info.get('id')
    db: DatabaseService = request.app['db']
    
    try:
        template = db.get_config_template_by_id(template_id)
        if not template:
            return web.json_response({'error': 'Template not found'}, status=404)
        
        return web.json_response({
            'template': template.to_dict(include_content=True)
        })
    except Exception as e:
        logger.error(f"Error getting config template: {e}")
        return web.json_response({'error': 'Failed to load template'}, status=500)


@require_auth
async def create_config_template(request: web.Request):
    """Create a new config template"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
        
        name = data.get('name', '').strip()
        filename = data.get('filename', '').strip()
        content = data.get('content', '')
        version = data.get('version', '1.0').strip()
        description = data.get('description', '').strip() or None
        
        if not name:
            return web.json_response({'error': 'Name is required'}, status=400)
        if not filename:
            return web.json_response({'error': 'Filename is required'}, status=400)
        if not content:
            return web.json_response({'error': 'Content is required'}, status=400)
        
        # Compute content hash
        content_hash = compute_content_hash(content)
        
        # Generate ID
        template_id = secrets.token_hex(16)
        
        template = db.create_config_template(
            template_id=template_id,
            name=name,
            filename=filename,
            content=content,
            content_hash=content_hash,
            version=version,
            description=description,
            created_by=user_id,
            source_path=normalize_config_path(data.get('sourcePath')),
        )
        
        return web.json_response({
            'template': template.to_dict(),
            'message': 'Template created successfully'
        }, status=201)
        
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error creating config template: {e}")
        return web.json_response({'error': 'Failed to create template'}, status=500)


@require_auth
async def update_config_template(request: web.Request):
    """Update an existing config template"""
    template_id = request.match_info.get('id')
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
        
        # Get existing template
        existing = db.get_config_template_by_id(template_id)
        if not existing:
            return web.json_response({'error': 'Template not found'}, status=404)
        
        name = data.get('name', existing.name).strip()
        filename = data.get('filename', existing.filename).strip()
        content = data.get('content', existing.content)
        version = data.get('version', existing.version).strip()
        description = data.get('description', existing.description)
        if description:
            description = description.strip() or None
        
        # Compute content hash
        content_hash = compute_content_hash(content)
        
        template = db.update_config_template(
            template_id=template_id,
            name=name,
            filename=filename,
            content=content,
            content_hash=content_hash,
            version=version,
            description=description,
            source_path=normalize_config_path(data.get('sourcePath', existing.source_path)),
        )
        
        return web.json_response({
            'template': template.to_dict(),
            'message': 'Template updated successfully'
        })
        
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error updating config template: {e}")
        return web.json_response({'error': 'Failed to update template'}, status=500)


@require_auth
async def delete_config_template(request: web.Request):
    """Delete a config template"""
    template_id = request.match_info.get('id')
    db: DatabaseService = request.app['db']
    
    try:
        existing = db.get_config_template_by_id(template_id)
        if not existing:
            return web.json_response({'error': 'Template not found'}, status=404)
        
        db.delete_config_template(template_id)
        
        return web.json_response({
            'message': 'Template deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting config template: {e}")
        return web.json_response({'error': 'Failed to delete template'}, status=500)


@require_auth
async def get_sync_status(request: web.Request):
    """Get config sync status for all printers"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    try:
        # Get all templates
        templates = db.get_config_templates()
        
        # Get all accessible printers
        printers = db.get_user_accessible_printers(user_id)
        
        # Get all sync statuses
        sync_statuses = db.get_all_printer_config_statuses()
        
        # Build status map: printer_id -> template_id -> status
        status_map = {}
        for status in sync_statuses:
            if status.printer_id not in status_map:
                status_map[status.printer_id] = {}
            status_map[status.printer_id][status.template_id] = status
        
        # Build result: for each printer, show status for each template
        printer_statuses = []
        for printer in printers:
            is_online = fleet_manager and printer.printer_id in fleet_manager.connected_printers
            
            template_statuses = []
            for template in templates:
                sync_info = status_map.get(printer.printer_id, {}).get(template.id)
                
                if not sync_info:
                    # Never synced
                    status = 'missing'
                    synced_version = None
                    synced_at = None
                elif sync_info.synced_hash != template.content_hash:
                    # Content has changed
                    status = 'outdated'
                    synced_version = sync_info.synced_version
                    synced_at = sync_info.synced_at
                else:
                    # Up to date
                    status = 'synced'
                    synced_version = sync_info.synced_version
                    synced_at = sync_info.synced_at
                
                template_statuses.append({
                    'templateId': template.id,
                    'templateName': template.name,
                    'filename': template.filename,
                    'sourcePath': template.source_path,
                    'currentVersion': template.version,
                    'syncedVersion': synced_version,
                    'syncedAt': synced_at,
                    'status': status,
                })
            
            printer_statuses.append({
                'printerId': printer.printer_id,
                'printerName': printer.name,
                'isOnline': is_online,
                'templates': template_statuses,
            })
        
        return web.json_response({
            'printers': printer_statuses,
            'templates': [t.to_dict() for t in templates]
        })
        
    except Exception as e:
        logger.error(f"Error getting sync status: {e}")
        return web.json_response({'error': 'Failed to get sync status'}, status=500)


@require_auth
async def push_config_to_printer(request: web.Request):
    """Push a config template to a specific printer"""
    user_id = request['user']['sub']
    printer_id = request.match_info.get('printerId')
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    try:
        data = await request.json()
        template_id = data.get('templateId')
        
        if not template_id:
            return web.json_response({'error': 'Template ID is required'}, status=400)
        
        # Get template
        template = db.get_config_template_by_id(template_id)
        if not template:
            return web.json_response({'error': 'Template not found'}, status=404)
        
        # Check printer exists
        printer = db.get_accessible_printer_by_id(printer_id, user_id)
        if not printer:
            return web.json_response({'error': 'Printer not found'}, status=404)
        
        # Check printer is online
        if not fleet_manager or printer_id not in fleet_manager.connected_printers:
            return web.json_response({'error': 'Printer is offline'}, status=400)
        
        # Send config to printer via WebSocket
        ws = fleet_manager.connected_printers[printer_id]
        
        # Encode content as base64 for safe transmission
        content_b64 = base64.b64encode(template.content.encode('utf-8')).decode('utf-8')
        target_path = resolve_template_target_path(template)
        
        message = {
            'type': 'config_sync',
            'templateId': template.id,
            'filename': target_path,
            'content': content_b64,
            'version': template.version,
            'contentHash': template.content_hash,
        }
        
        await ws.send(json.dumps(message))
        
        # Record the sync status (will be confirmed by printer, but record intent)
        db.update_printer_config_status(
            printer_id=printer_id,
            template_id=template.id,
            synced_version=template.version,
            synced_hash=template.content_hash
        )
        
        logger.info(
            "Pushed config '%s' to printer %s target=%s",
            template.name,
            printer_id,
            target_path,
        )
        
        return web.json_response({
            'message': f'Config "{template.name}" sent to printer successfully',
            'templateId': template.id,
            'printerId': printer_id,
        })
        
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error pushing config to printer: {e}")
        return web.json_response({'error': 'Failed to push config to printer'}, status=500)


@require_auth
async def push_all_configs_to_printer(request: web.Request):
    """Push all config templates to a specific printer"""
    user_id = request['user']['sub']
    printer_id = request.match_info.get('printerId')
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    try:
        payload = {}
        if request.can_read_body:
            try:
                payload = await request.json()
            except json.JSONDecodeError:
                return web.json_response({'error': 'Invalid JSON'}, status=400)

        template_ids_raw = payload.get('templateIds') if isinstance(payload, dict) else None
        template_ids: set[str] | None = None
        if template_ids_raw is not None:
            if not isinstance(template_ids_raw, list) or not template_ids_raw:
                return web.json_response({'error': 'templateIds must be a non-empty array when provided'}, status=400)
            template_ids = {str(template_id).strip() for template_id in template_ids_raw if str(template_id).strip()}
            if not template_ids:
                return web.json_response({'error': 'templateIds must contain valid template ids'}, status=400)

        # Check printer exists
        printer = db.get_accessible_printer_by_id(printer_id, user_id)
        if not printer:
            return web.json_response({'error': 'Printer not found'}, status=404)
        
        # Check printer is online
        if not fleet_manager or printer_id not in fleet_manager.connected_printers:
            return web.json_response({'error': 'Printer is offline'}, status=400)
        
        # Get all templates and collapse to one template per destination path.
        # This ensures schema files like printer.cfg and mainsail-idex.cfg are
        # pushed explicitly as separate runtime files even when upload filenames
        # are versioned.
        templates = db.get_config_templates()
        if not templates:
            return web.json_response({'error': 'No templates found'}, status=404)

        selected_templates = select_templates_for_sync(templates, template_ids)
        if not selected_templates:
            return web.json_response({'error': 'No matching templates found for selected templateIds'}, status=404)
        
        ws = fleet_manager.connected_printers[printer_id]
        synced_count = 0
        
        for template in selected_templates:
            # Encode content as base64 for safe transmission
            content_b64 = base64.b64encode(template.content.encode('utf-8')).decode('utf-8')
            target_path = resolve_template_target_path(template)
            
            message = {
                'type': 'config_sync',
                'templateId': template.id,
                'filename': target_path,
                'content': content_b64,
                'version': template.version,
                'contentHash': template.content_hash,
            }
            
            await ws.send(json.dumps(message))
            
            # Record the sync status
            db.update_printer_config_status(
                printer_id=printer_id,
                template_id=template.id,
                synced_version=template.version,
                synced_hash=template.content_hash
            )
            
            synced_count += 1
            logger.info(
                "push_all queued template=%s target=%s printer=%s",
                template.name,
                target_path,
                printer_id,
            )
        
        logger.info(f"Pushed {synced_count} configs to printer {printer_id}")
        
        return web.json_response({
            'message': f'Successfully pushed {synced_count} config(s) to printer',
            'printerId': printer_id,
            'syncedCount': synced_count,
        })
        
    except Exception as e:
        logger.error(f"Error pushing all configs to printer: {e}")
        return web.json_response({'error': 'Failed to push configs to printer'}, status=500)


@require_auth
async def preview_migrated_configs(request: web.Request):
    """Create migration candidates from running config files without persisting changes."""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        payload = await request.json() if request.can_read_body else {}
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    printer_id = (payload.get('printerId') or '').strip()
    files = payload.get('files') or []
    source_type = str(payload.get('sourceType') or 'runtime').strip().lower()

    if not printer_id:
        return web.json_response({'error': 'printerId is required'}, status=400)
    if source_type not in {'runtime', 'synthesized'}:
        source_type = 'runtime'
    if not isinstance(files, list):
        files = []
    if source_type == 'runtime' and not files:
        return web.json_response({'error': 'files must be a non-empty array'}, status=400)

    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    runtime_source_files = []
    for file_item in files:
        file_path = normalize_config_path((file_item or {}).get('path', ''))
        file_content_b64 = (file_item or {}).get('content')
        if not file_path or not file_content_b64:
            continue

        try:
            decoded = base64.b64decode(file_content_b64).decode('utf-8')
        except Exception:
            continue

        runtime_source_files.append({
            'path': file_path,
            'content': decoded,
            'origin': 'runtime_snapshot',
        })

    synthesized_source_files = _load_synthesized_files_for_printer(printer) if source_type == 'synthesized' else []

    effective_source_type = source_type
    if source_type == 'synthesized' and synthesized_source_files:
        source_files = synthesized_source_files
    elif runtime_source_files:
        source_files = runtime_source_files
        if source_type == 'synthesized':
            effective_source_type = 'runtime_fallback'
    else:
        source_files = synthesized_source_files

    files_by_path, files_by_basename = _build_files_maps(source_files)

    if not files_by_path:
        if source_type == 'synthesized':
            return web.json_response(
                {
                    'error': 'No synthesized files found for this printer',
                    'details': f'Expected files under {SYNTH_OUTPUT_ROOT}/<printer>: printer.cfg and mainsail-idex.cfg',
                },
                status=404,
            )
        return web.json_response({'error': 'No valid file content provided'}, status=400)

    templates = db.get_config_templates()
    if source_type == 'synthesized':
        all_template_count = len(templates)
        templates = [
            t for t in templates
            if basename(t.filename) in SYNTH_TARGET_FILES
            or basename(t.name) in SYNTH_TARGET_FILES
        ]
        logger.info(
            'migrate_preview synth_filter: %s/%s templates matched SYNTH_TARGET_FILES, '
            'effective_source=%s, source_files=%s',
            len(templates), all_template_count,
            effective_source_type, len(files_by_path),
        )
        for t in templates:
            logger.info(
                'migrate_preview template: name=%s filename=%s basename_filename=%s basename_name=%s',
                t.name, t.filename, basename(t.filename), basename(t.name),
            )

    candidates = []
    unmatched_templates = []

    logger.info(
        'migrate_preview source_files_available: paths=%s basenames=%s',
        list(files_by_path.keys()),
        list(files_by_basename.keys()),
    )

    for template in templates:
        source_entry, match_info, match_error = find_source_file_for_template(template, files_by_path, files_by_basename)
        if not source_entry:
            logger.info(
                'migrate_preview unmatched_template: name=%s filename=%s source_path=%s error=%s',
                template.name, template.filename, template.source_path, match_error,
            )
            unmatched_templates.append({
                'templateId': template.id,
                'templateName': template.name,
                'filename': template.filename,
                'sourcePath': template.source_path,
                'reason': match_error or 'No matching running config file found',
            })
            continue

        source_for_migration = source_entry
        if is_printer_cfg_template(template):
            source_for_migration = compose_printer_object_source(source_entry, source_files)
            logger.info(
                'migration_source_merge template=%s primary=%s merged_paths=%s',
                template.name,
                source_entry.get('path'),
                source_for_migration.get('mergedPaths', []),
            )

        passthrough_template = (
            source_for_migration.get('origin') == 'synthesized' and is_passthrough_synth_template(template)
        )
        migrated_content = (
            source_for_migration['content']
            if passthrough_template
            else migrate_template_with_source(template.content, source_for_migration['content'])
        )
        has_content_changes = migrated_content != template.content
        verification_summary = build_verification_summary(source_for_migration['content'], migrated_content)

        logger.info(
            'migration_candidate template=%s origin=%s passthrough=%s has_changes=%s '
            'verification_total=%s verification_mappings=%s',
            template.name,
            source_for_migration.get('origin'),
            passthrough_template,
            has_content_changes,
            verification_summary.get('totalChecks', 0),
            len(verification_summary.get('mappings', [])),
        )

        if not has_content_changes and not passthrough_template:
            continue

        proposed_version = bump_version(template.version) if has_content_changes else template.version
        candidates.append({
            'templateId': template.id,
            'templateName': template.name,
            'filename': template.filename,
            'currentVersion': template.version,
            'currentContent': template.content,
            'proposedVersion': proposed_version,
            'sourcePath': source_for_migration['path'],
            'sourcePathBound': template.source_path,
            'matchType': match_info.get('matchType') if match_info else None,
            'matchAmbiguous': bool(match_info and match_info.get('ambiguous')),
            'matchCandidateCount': (match_info or {}).get('candidateCount', 1),
            'content': migrated_content,
            'contentHash': compute_content_hash(migrated_content),
            'reviewMode': 'passthrough' if passthrough_template else 'migration',
            'hasContentChanges': has_content_changes,
            'verificationSummary': verification_summary,
            'sourceFilesMerged': source_for_migration.get('mergedPaths', [source_for_migration['path']]),
            'sourceType': effective_source_type,
            'sourceOrigin': source_for_migration.get('origin'),
        })

    return web.json_response({
        'printerId': printer_id,
        'sourceType': effective_source_type,
        'candidates': candidates,
        'unmatchedTemplates': unmatched_templates,
        'filesProvided': len(files_by_path),
    })


@require_auth
async def apply_migrated_configs(request: web.Request):
    """Persist verified migration candidates as updated templates."""
    user = request['user']
    user_id = user['sub']
    username = user.get('username')
    db: DatabaseService = request.app['db']

    try:
        payload = await request.json() if request.can_read_body else {}
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    printer_id = (payload.get('printerId') or '').strip()
    candidates = payload.get('candidates') or []
    verification_confirmed = bool(payload.get('verificationConfirmed', False))

    if not printer_id:
        return web.json_response({'error': 'printerId is required'}, status=400)
    if not verification_confirmed:
        return web.json_response({'error': 'User verification is required before applying migration'}, status=400)
    if not isinstance(candidates, list) or not candidates:
        return web.json_response({'error': 'candidates must be a non-empty array'}, status=400)

    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    updated = []
    missing = []
    requested_template_ids = []

    for candidate in candidates:
        template_id = (candidate or {}).get('templateId')
        if not template_id:
            continue

        requested_template_ids.append(template_id)

        existing = db.get_config_template_by_id(template_id)
        if not existing:
            missing.append(template_id)
            continue

        new_content = (candidate or {}).get('content')
        new_version = ((candidate or {}).get('proposedVersion') or existing.version).strip()
        if not new_content:
            continue

        content_hash = compute_content_hash(new_content)
        updated_template = db.update_config_template(
            template_id=existing.id,
            name=existing.name,
            filename=existing.filename,
            content=new_content,
            content_hash=content_hash,
            version=new_version,
            description=existing.description,
            source_path=normalize_config_path((candidate or {}).get('sourcePath') or existing.source_path),
        )

        if updated_template:
            updated.append({
                'templateId': updated_template.id,
                'templateName': updated_template.name,
                'version': updated_template.version,
            })

    logger.info(
        'config_migration_apply user_id=%s username=%s printer_id=%s verification_confirmed=%s requested_template_ids=%s updated_template_ids=%s missing_template_ids=%s updated_count=%s',
        user_id,
        username,
        printer_id,
        verification_confirmed,
        sorted(set(requested_template_ids)),
        [entry['templateId'] for entry in updated],
        missing,
        len(updated),
    )

    return web.json_response({
        'printerId': printer_id,
        'updatedCount': len(updated),
        'updatedTemplates': updated,
        'missingTemplateIds': missing,
        'message': f'Applied {len(updated)} verified migration template(s)',
    })


def setup_config_sync_routes(app: web.Application, fleet_manager=None):
    """Setup config sync routes"""
    app.router.add_get('/api/config-sync/templates', list_config_templates)
    app.router.add_get('/api/config-sync/templates/{id}', get_config_template)
    app.router.add_post('/api/config-sync/templates', create_config_template)
    app.router.add_put('/api/config-sync/templates/{id}', update_config_template)
    app.router.add_delete('/api/config-sync/templates/{id}', delete_config_template)
    app.router.add_get('/api/config-sync/status', get_sync_status)
    app.router.add_post('/api/config-sync/migrate-preview', preview_migrated_configs)
    app.router.add_post('/api/config-sync/migrate-apply', apply_migrated_configs)
    app.router.add_post('/api/config-sync/push/{printerId}', push_config_to_printer)
    app.router.add_post('/api/config-sync/push-all/{printerId}', push_all_configs_to_printer)
