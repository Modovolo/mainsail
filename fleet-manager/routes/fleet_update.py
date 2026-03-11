"""
Fleet Client Update Routes
Manage fleet client versions and trigger updates
"""
import logging
import json
import os
from datetime import datetime

from aiohttp import web

from routes.common import require_auth
from services.client_version import load_client_release_info

logger = logging.getLogger(__name__)


def _load_client_version_info() -> dict:
    try:
        return load_client_release_info()
    except Exception as e:
        logger.error(f"Failed to read version info: {e}")
        return {'version': 'unknown', 'min_version': '0.0.0'}


def _get_printer_status_data(fleet_manager, printer_id: str) -> dict:
    if not fleet_manager or printer_id not in fleet_manager.printer_status:
        return {}

    status_entry = fleet_manager.printer_status[printer_id]
    return status_entry.get('data') or status_entry.get('printer_data') or {}


def _set_runtime_update_state(fleet_manager, printer_id: str, state: str, message: str, progress: int):
    if not fleet_manager or printer_id not in fleet_manager.printer_status:
        return

    status_data = fleet_manager.printer_status[printer_id].setdefault('data', {})
    update_logs = list(status_data.get('update_logs') or [])
    timestamped_message = f"{datetime.now().strftime('%H:%M:%S')} {message}"
    if not update_logs or not str(update_logs[-1]).endswith(message):
        update_logs.append(timestamped_message)

    status_data.update({
        'update_state': state,
        'update_message': message,
        'update_progress': progress,
        'update_logs': update_logs[-12:],
        'update_updated_at': datetime.now().isoformat(),
    })
    fleet_manager.printer_status[printer_id]['last_seen'] = datetime.now().isoformat()


@require_auth
async def get_fleet_client_status(request: web.Request):
    """Get version status for all accessible printers"""
    user_id = request['user']['sub']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    # Get accessible printers
    printers = db.get_user_accessible_printers(user_id)
    
    # Load latest version info
    latest_version_info = _load_client_version_info()
    
    latest_version = latest_version_info.get('version', 'unknown')
    min_version = latest_version_info.get('min_version', '0.0.0')
    changelog = latest_version_info.get('changelog', '')
    released = latest_version_info.get('released', '')
    
    # Build printer status list
    printer_statuses = []
    for printer in printers:
        printer_id = printer.printer_id  # Use printer_id which is the connection key
        is_online = fleet_manager and printer_id in fleet_manager.connected_printers
        
        status_data = _get_printer_status_data(fleet_manager, printer_id)

        # Get client version from printer runtime state if online
        client_version = None
        auto_update = True  # Default to auto-update enabled
        update_state = status_data.get('update_state')
        update_message = status_data.get('update_message')
        update_progress = status_data.get('update_progress')
        update_logs = status_data.get('update_logs') or []
        service_name = status_data.get('service_name') or 'fleet-client'
        last_seen = None
        
        if is_online and fleet_manager and printer_id in fleet_manager.printer_status:
            client_version = status_data.get('version') or status_data.get('client_version')
            # Auto-update setting could be stored in DB or in the client's registration data
            auto_update = status_data.get('auto_update', True)
            last_seen = fleet_manager.printer_status[printer_id].get('last_seen')
        
        # Determine update status
        update_status = 'unknown'
        if client_version:
            if client_version == latest_version:
                update_status = 'up_to_date'
            elif _version_compare(latest_version, client_version) > 0:
                update_status = 'update_available'
            if _version_compare(client_version, min_version) < 0:
                update_status = 'requires_update'
        elif not is_online:
            update_status = 'offline'
        
        printer_statuses.append({
            'printerId': printer_id,
            'printerName': printer.name,
            'isOnline': is_online,
            'clientVersion': client_version,
            'updateStatus': update_status,
            'autoUpdate': auto_update,
            'updateState': update_state,
            'updateMessage': update_message,
            'updateProgress': update_progress,
            'updateLogs': update_logs,
            'serviceName': service_name,
            'lastSeen': last_seen,
        })
    
    return web.json_response({
        'latestVersion': latest_version,
        'minVersion': min_version,
        'changelog': changelog,
        'released': released,
        'printers': printer_statuses,
    })


@require_auth
async def trigger_printer_update(request: web.Request):
    """Trigger an update check on a specific printer"""
    user_id = request['user']['sub']
    printer_id = request.match_info['printer_id']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    # Verify user has access to this printer
    printers = db.get_user_accessible_printers(user_id)
    printer_ids = [p.printer_id for p in printers]  # Use printer_id for connection key matching
    if printer_id not in printer_ids:
        return web.json_response({'error': 'Printer not found or not accessible'}, status=404)
    
    # Check if printer is online
    if not fleet_manager or printer_id not in fleet_manager.connected_printers:
        return web.json_response({'error': 'Printer is offline'}, status=400)
    
    # Send update trigger message to printer
    try:
        printer_ws = fleet_manager.connected_printers[printer_id]
        _set_runtime_update_state(fleet_manager, printer_id, 'requested', 'Update requested from fleet manager', 1)
        await printer_ws.send(json.dumps({
            'type': 'trigger_update',
            'force': True,
        }))
        
        logger.info(f"Triggered update check on printer {printer_id}")
        return web.json_response({
            'message': 'Update check triggered',
            'printerId': printer_id,
        })
    except Exception as e:
        logger.error(f"Failed to trigger update on {printer_id}: {e}")
        return web.json_response({'error': f'Failed to trigger update: {str(e)}'}, status=500)


@require_auth
async def trigger_fleet_update(request: web.Request):
    """Trigger an update check on all online printers the user has access to"""
    user_id = request['user']['sub']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    if not fleet_manager:
        return web.json_response({'error': 'Fleet manager not available'}, status=500)
    
    # Get accessible printers
    printers = db.get_user_accessible_printers(user_id)
    
    triggered = []
    failed = []
    offline = []
    
    for printer in printers:
        printer_id = printer.printer_id  # Use printer_id which is the connection key
        if printer_id not in fleet_manager.connected_printers:
            offline.append(printer_id)
            continue
        
        try:
            printer_ws = fleet_manager.connected_printers[printer_id]
            _set_runtime_update_state(fleet_manager, printer_id, 'requested', 'Fleet-wide update requested', 1)
            await printer_ws.send(json.dumps({
                'type': 'trigger_update',
                'force': True,
            }))
            triggered.append(printer_id)
        except Exception as e:
            logger.error(f"Failed to trigger update on {printer_id}: {e}")
            failed.append(printer_id)
    
    return web.json_response({
        'message': f'Update triggered on {len(triggered)} printers',
        'triggered': triggered,
        'failed': failed,
        'offline': offline,
    })


@require_auth
async def restart_printer_client(request: web.Request):
    """Trigger a fleet-client service restart on a specific printer"""
    user_id = request['user']['sub']
    printer_id = request.match_info['printer_id']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')

    printers = db.get_user_accessible_printers(user_id)
    printer_ids = [p.printer_id for p in printers]
    if printer_id not in printer_ids:
        return web.json_response({'error': 'Printer not found or not accessible'}, status=404)

    if not fleet_manager or printer_id not in fleet_manager.connected_printers:
        return web.json_response({'error': 'Printer is offline'}, status=400)

    try:
        printer_ws = fleet_manager.connected_printers[printer_id]
        _set_runtime_update_state(fleet_manager, printer_id, 'restarting', 'Restart requested from fleet manager', 95)
        await printer_ws.send(json.dumps({
            'type': 'restart_client',
        }))

        logger.info(f"Triggered fleet-client restart on printer {printer_id}")
        return web.json_response({
            'message': 'Fleet client restart triggered',
            'printerId': printer_id,
        })
    except Exception as e:
        logger.error(f"Failed to trigger restart on {printer_id}: {e}")
        return web.json_response({'error': f'Failed to trigger restart: {str(e)}'}, status=500)


@require_auth 
async def set_printer_auto_update(request: web.Request):
    """Set auto-update preference for a printer"""
    user_id = request['user']['sub']
    printer_id = request.match_info['printer_id']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    # Verify user has access to this printer
    printers = db.get_user_accessible_printers(user_id)
    printer_ids = [p.printer_id for p in printers]  # Use printer_id for connection key matching
    if printer_id not in printer_ids:
        return web.json_response({'error': 'Printer not found or not accessible'}, status=404)
    
    try:
        data = await request.json()
        auto_update = data.get('autoUpdate', True)
    except Exception:
        return web.json_response({'error': 'Invalid request body'}, status=400)
    
    # Send auto-update setting to printer if online
    if fleet_manager and printer_id in fleet_manager.connected_printers:
        try:
            printer_ws = fleet_manager.connected_printers[printer_id]
            await printer_ws.send(json.dumps({
                'type': 'set_auto_update',
                'enabled': auto_update,
            }))
            
            # Also update in printer_status
            if printer_id in fleet_manager.printer_status:
                fleet_manager.printer_status[printer_id].setdefault('data', {})['auto_update'] = auto_update
            
            logger.info(f"Set auto_update={auto_update} for printer {printer_id}")
            return web.json_response({
                'message': 'Auto-update preference updated',
                'printerId': printer_id,
                'autoUpdate': auto_update,
            })
        except Exception as e:
            logger.error(f"Failed to set auto-update on {printer_id}: {e}")
            return web.json_response({'error': f'Failed to set auto-update: {str(e)}'}, status=500)
    else:
        return web.json_response({'error': 'Printer is offline'}, status=400)


def _version_compare(v1: str, v2: str) -> int:
    """Compare two version strings. Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal"""
    def parse_version(v):
        try:
            return [int(x) for x in v.split('.')]
        except (ValueError, AttributeError):
            return [0]
    
    v1_parts = parse_version(v1)
    v2_parts = parse_version(v2)
    
    # Pad with zeros
    while len(v1_parts) < len(v2_parts):
        v1_parts.append(0)
    while len(v2_parts) < len(v1_parts):
        v2_parts.append(0)
    
    for a, b in zip(v1_parts, v2_parts):
        if a > b:
            return 1
        elif a < b:
            return -1
    return 0


def setup_fleet_update_routes(app: web.Application):
    """Setup fleet update routes"""
    app.router.add_get('/api/fleet/client-status', get_fleet_client_status)
    app.router.add_post('/api/fleet/update/{printer_id}', trigger_printer_update)
    app.router.add_post('/api/fleet/update-all', trigger_fleet_update)
    app.router.add_post('/api/fleet/restart/{printer_id}', restart_printer_client)
    app.router.add_put('/api/fleet/auto-update/{printer_id}', set_printer_auto_update)
    
    logger.info("Fleet update routes configured")
