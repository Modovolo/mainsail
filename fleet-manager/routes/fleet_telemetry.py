"""
Fleet Telemetry Routes
Unified telemetry feed for Fleet Dashboard and downstream RAG ingestion.
"""
import asyncio
import logging
import os
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

from aiohttp import ClientSession, ClientTimeout, web

from .common import require_auth

logger = logging.getLogger(__name__)


def _monitor_base_url() -> str:
    return os.environ.get('BFP_MONITOR_BASE_URL', 'http://bfp-print-monitor:5000').rstrip('/')


def _resolve_monitor_hostname(printer) -> str:
    if printer.host:
        return printer.host
    if printer.name:
        return printer.name
    return printer.printer_id


def _extract_host(value: str) -> str:
    raw = (value or '').strip()
    if not raw:
        return ''
    if raw.startswith('http://') or raw.startswith('https://'):
        parsed = urlsplit(raw)
        return parsed.hostname or ''
    if '/' in raw:
        raw = raw.split('/')[0]
    if ':' in raw:
        raw = raw.split(':')[0]
    return raw


def _tail_lines(text: str, max_lines: int = 20, max_chars: int = 4000) -> List[str]:
    if not text:
        return []
    trimmed = text[-max_chars:]
    lines = [line.strip() for line in trimmed.splitlines() if line.strip()]
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return lines


def _last_defect_by_printer(defects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_printer: Dict[str, Dict[str, Any]] = {}
    for defect in defects:
        printer_name = defect.get('printer')
        if not printer_name:
            continue
        by_printer[printer_name] = defect
    return by_printer


def _monitor_log_tail_for_printer(
    monitor_logs: List[str],
    printer,
    monitor_hostname: str,
    max_lines: int = 20,
) -> List[str]:
    tokens = {
        str(monitor_hostname or '').lower(),
        str(printer.printer_id or '').lower(),
        str(printer.name or '').lower(),
    }
    tokens = {token for token in tokens if token}
    if not tokens:
        return []

    matched = []
    for line in monitor_logs:
        line_value = str(line or '').strip()
        if not line_value:
            continue
        haystack = line_value.lower()
        if any(token in haystack for token in tokens):
            matched.append(line_value)
    if len(matched) > max_lines:
        matched = matched[-max_lines:]
    return matched


async def _fetch_json_or_default(session: ClientSession, url: str, default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        async with session.get(url) as response:
            if response.status >= 400:
                return default
            return await response.json()
    except Exception:
        return default


async def _fetch_klippy_log_tail(session: ClientSession, printer) -> Optional[List[str]]:
    host = _extract_host(printer.host or printer.name or '')
    if not host:
        return None

    # Bound memory use even if klippy.log is large.
    max_tail_bytes = 64 * 1024
    url = f'http://{host}:7125/server/files/klippy.log'
    try:
        async with session.get(url, headers={'Range': f'bytes=-{max_tail_bytes}'}) as response:
            if response.status >= 400:
                return None

            chunks = deque()
            total = 0
            async for chunk in response.content.iter_chunked(4096):
                if not chunk:
                    continue
                chunks.append(chunk)
                total += len(chunk)
                while total > max_tail_bytes and chunks:
                    total -= len(chunks.popleft())

            text = b''.join(chunks).decode('utf-8', errors='replace')
            return _tail_lines(text)
    except Exception:
        return None


@require_auth
async def get_fleet_telemetry_overview(request: web.Request) -> web.Response:
    user_id = request['user']['sub']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')

    if not fleet_manager:
        return web.json_response({'error': 'Fleet manager not available'}, status=500)

    printers = db.get_user_accessible_printers(user_id)
    if not printers:
        return web.json_response(
            {
                'generatedAt': datetime.utcnow().isoformat(),
                'summary': {
                    'printerCount': 0,
                    'connectedCount': 0,
                    'printingCount': 0,
                    'defectCount': 0,
                },
                'monitor': {
                    'available': False,
                    'running': False,
                    'reason': 'No accessible printers',
                },
                'printers': [],
            }
        )

    monitor_base_url = _monitor_base_url()
    monitor_timeout = ClientTimeout(total=6)
    moonraker_timeout = ClientTimeout(total=2)

    monitor_status: Dict[str, Any] = {}
    monitor_printers: Dict[str, Any] = {}
    defects: List[Dict[str, Any]] = []
    monitor_logs: List[str] = []
    monitor_available = False

    try:
        async with ClientSession(timeout=monitor_timeout) as session:
            monitor_status = await _fetch_json_or_default(session, f'{monitor_base_url}/api/status', {})
            printers_payload = await _fetch_json_or_default(session, f'{monitor_base_url}/api/printers', {})
            defects_payload = await _fetch_json_or_default(session, f'{monitor_base_url}/api/defects', {})
            logs_payload = await _fetch_json_or_default(session, f'{monitor_base_url}/api/logs', {})

            monitor_printers = printers_payload.get('printers', {}) or {}
            defects = defects_payload.get('defects', []) or []
            monitor_logs = logs_payload.get('logs', []) or []
            monitor_available = bool(monitor_status)
    except Exception as exc:
        logger.warning('Failed to load monitor telemetry: %s', exc)

    defects_by_printer = _last_defect_by_printer(defects)

    async with ClientSession(timeout=moonraker_timeout) as moonraker_session:
        klippy_tasks = [_fetch_klippy_log_tail(moonraker_session, printer) for printer in printers]
        klippy_results = await asyncio.gather(*klippy_tasks, return_exceptions=True)

    telemetry_printers: List[Dict[str, Any]] = []
    printing_count = 0

    for index, printer in enumerate(printers):
        printer_id = printer.printer_id
        monitor_hostname = _resolve_monitor_hostname(printer)
        monitor_info = monitor_printers.get(monitor_hostname, {}) if monitor_available else {}
        printer_status = fleet_manager.printer_status.get(printer_id, {})
        printer_data = printer_status.get('printer_data', {}) or {}

        print_stats = printer_data.get('print_stats', {}) or {}
        toolhead = printer_data.get('toolhead', {}) or {}
        gcode_move = printer_data.get('gcode_move', {}) or {}
        extruder = printer_data.get('extruder', {}) or {}
        bed = printer_data.get('heater_bed', {}) or {}

        state = print_stats.get('state') or printer_status.get('status') or 'unknown'
        if str(state).lower() == 'printing':
            printing_count += 1

        klippy_tail = klippy_results[index]
        if isinstance(klippy_tail, Exception):
            klippy_tail = None

        if klippy_tail:
            log_source = 'moonraker'
            log_lines = klippy_tail
        else:
            log_source = 'monitor'
            log_lines = _monitor_log_tail_for_printer(monitor_logs, printer, monitor_hostname)

        if not log_lines:
            log_source = 'none'

        telemetry_printers.append(
            {
                'printerId': printer_id,
                'name': printer.name,
                'host': printer.host,
                'isConnected': printer_id in fleet_manager.connected_printers,
                'lastSeen': printer_status.get('last_seen'),
                'status': {
                    'state': state,
                    'filename': print_stats.get('filename'),
                    'progress': print_stats.get('progress'),
                    'printDuration': print_stats.get('print_duration'),
                },
                'kinematics': {
                    'position': toolhead.get('position') or gcode_move.get('gcode_position') or [],
                    'homedAxes': toolhead.get('homed_axes'),
                    'velocity': toolhead.get('max_velocity') or gcode_move.get('speed'),
                    'accel': toolhead.get('max_accel'),
                },
                'temperature': {
                    'extruder': extruder.get('temperature'),
                    'targetExtruder': extruder.get('target'),
                    'bed': bed.get('temperature'),
                    'targetBed': bed.get('target'),
                },
                'monitoring': {
                    'status': monitor_info.get('status', 'unknown' if monitor_available else 'unavailable'),
                    'lastUpdate': monitor_info.get('timestamp'),
                    'latestDefect': defects_by_printer.get(monitor_hostname),
                },
                'logs': {
                    'source': log_source,
                    'lines': log_lines,
                },
            }
        )

    connected_count = sum(1 for item in telemetry_printers if item['isConnected'])

    return web.json_response(
        {
            'generatedAt': datetime.utcnow().isoformat(),
            'monitor': {
                'available': monitor_available,
                'running': bool(monitor_status.get('monitor_running', False)) if monitor_available else False,
                'timestamp': monitor_status.get('timestamp') if monitor_available else None,
                'totalDefects': monitor_status.get('total_defects', len(defects)) if monitor_available else len(defects),
            },
            'summary': {
                'printerCount': len(printers),
                'connectedCount': connected_count,
                'printingCount': printing_count,
                'defectCount': len(defects),
            },
            'printers': telemetry_printers,
        }
    )


def setup_fleet_telemetry_routes(app: web.Application):
    app.router.add_get('/api/fleet/telemetry/overview', get_fleet_telemetry_overview)