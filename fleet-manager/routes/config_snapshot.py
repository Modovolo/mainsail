"""
Config Snapshot Routes
Fetches currently running config files from connected printers through WebSocket relay.
"""
import asyncio
import json
import logging
import time
import uuid
from aiohttp import web

from .common import require_auth

logger = logging.getLogger(__name__)

# Store pending config fetch requests (request_id -> dict with Future)
pending_config_requests: dict = {}

# Timeout for config fetch requests (seconds)
CONFIG_FETCH_TIMEOUT = 45


@require_auth
async def fetch_printer_config_snapshot(request: web.Request) -> web.Response:
    """
    Fetch one or more config files from a connected printer.

    Route: POST /api/config-sync/snapshot/{printer_id}
    Body:
      {
        "filenames": ["printer.cfg", "macros.cfg"],
        "includeDependencies": true
      }
    """
    user = request.get('user', {})
    user_id = user.get('sub')

    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    printer_id = request.match_info.get('printer_id')

    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)

    if not fleet_manager:
        return web.json_response({'error': 'Fleet manager not available'}, status=500)

    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    if printer_id not in fleet_manager.connected_printers:
        return web.json_response({'error': 'Printer not connected'}, status=503)

    status_data = fleet_manager.printer_status.get(printer_id, {}).get('data', {})
    capabilities = status_data.get('capabilities') or []
    if isinstance(capabilities, list) and 'config_fetch' not in capabilities:
        return web.json_response(
            {
                'error': 'Printer client does not support config fetch',
                'details': 'Update fleet client on this printer to a version with config_fetch capability',
            },
            status=426,
        )

    try:
        payload = await request.json() if request.can_read_body else {}
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    filenames = payload.get('filenames', ['printer.cfg'])
    include_dependencies = bool(payload.get('includeDependencies', True))

    if not isinstance(filenames, list) or not filenames:
        return web.json_response({'error': 'filenames must be a non-empty array'}, status=400)

    request_id = f"config_fetch:{uuid.uuid4().hex}"
    loop = asyncio.get_event_loop()
    response_future = loop.create_future()
    pending_config_requests[request_id] = {
        'future': response_future,
        'timestamp': time.time(),
        'printer_id': printer_id,
    }

    try:
        printer_ws = fleet_manager.connected_printers[printer_id]
        request_message = {
            'type': 'config_fetch',
            'request_id': request_id,
            'filenames': filenames,
            'include_dependencies': include_dependencies,
        }

        await printer_ws.send(json.dumps(request_message))

        try:
            response_data = await asyncio.wait_for(response_future, timeout=CONFIG_FETCH_TIMEOUT)
        except asyncio.TimeoutError:
            return web.json_response(
                {
                    'error': 'Request timed out',
                    'details': 'Printer did not respond in time',
                },
                status=504,
            )

        if not response_data.get('success', False):
            return web.json_response(
                {
                    'error': response_data.get('error', 'Failed to fetch config files'),
                    'details': response_data.get('details', ''),
                },
                status=response_data.get('status', 502),
            )

        return web.json_response(
            {
                'printerId': printer_id,
                'files': response_data.get('files', []),
                'unresolvedIncludes': response_data.get('unresolved_includes', []),
                'fetchedAt': response_data.get('fetched_at'),
            }
        )
    finally:
        pending_config_requests.pop(request_id, None)


def handle_config_fetch_response(response_data: dict):
    """Resolve a pending config fetch request from a printer response."""
    request_id = response_data.get('request_id')
    if not request_id:
        logger.warning('Received config fetch response without request_id')
        return

    pending = pending_config_requests.get(request_id)
    if not pending:
        logger.warning(f'Received config fetch response for unknown request: {request_id}')
        return

    future = pending.get('future')
    if future and not future.done():
        future.set_result(response_data)


@require_auth
async def debug_printer_config_snapshot(request: web.Request) -> web.Response:
    """
    Debug endpoint for config fetch errors and capabilities.

    Route: GET /api/config-sync/snapshot-debug/{printer_id}
    Query params:
      - filename (optional, default: printer.cfg)
      - includeDependencies (optional, default: true)
    """
    user = request.get('user', {})
    user_id = user.get('sub')

    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    printer_id = request.match_info.get('printer_id')

    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)

    if not fleet_manager:
        return web.json_response({'error': 'Fleet manager not available'}, status=500)

    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    is_connected = printer_id in fleet_manager.connected_printers
    status_data = fleet_manager.printer_status.get(printer_id, {}).get('data', {})
    capabilities = status_data.get('capabilities') or []

    if not is_connected:
        return web.json_response(
            {
                'printerId': printer_id,
                'connected': False,
                'capabilities': capabilities,
                'error': 'Printer not connected',
            },
            status=503,
        )

    filename = (request.query.get('filename') or 'printer.cfg').strip() or 'printer.cfg'
    include_dependencies = request.query.get('includeDependencies', 'true').lower() not in ('0', 'false', 'no')

    request_id = f"config_fetch_debug:{uuid.uuid4().hex}"
    loop = asyncio.get_event_loop()
    response_future = loop.create_future()
    pending_config_requests[request_id] = {
        'future': response_future,
        'timestamp': time.time(),
        'printer_id': printer_id,
    }

    started_at = time.time()

    try:
        printer_ws = fleet_manager.connected_printers[printer_id]
        await printer_ws.send(json.dumps({
            'type': 'config_fetch',
            'request_id': request_id,
            'filenames': [filename],
            'include_dependencies': include_dependencies,
        }))

        try:
            response_data = await asyncio.wait_for(response_future, timeout=CONFIG_FETCH_TIMEOUT)
        except asyncio.TimeoutError:
            return web.json_response(
                {
                    'printerId': printer_id,
                    'connected': True,
                    'capabilities': capabilities,
                    'filename': filename,
                    'includeDependencies': include_dependencies,
                    'elapsedMs': int((time.time() - started_at) * 1000),
                    'success': False,
                    'error': 'Request timed out',
                    'details': 'Printer did not respond in time',
                },
                status=504,
            )

        return web.json_response(
            {
                'printerId': printer_id,
                'connected': True,
                'capabilities': capabilities,
                'filename': filename,
                'includeDependencies': include_dependencies,
                'elapsedMs': int((time.time() - started_at) * 1000),
                'success': bool(response_data.get('success', False)),
                'error': response_data.get('error'),
                'details': response_data.get('details'),
                'status': response_data.get('status'),
                'filesCount': len(response_data.get('files', []) or []),
                'unresolvedIncludes': response_data.get('unresolved_includes', []),
                'rawResponse': response_data,
            },
            status=200 if response_data.get('success', False) else response_data.get('status', 502),
        )
    finally:
        pending_config_requests.pop(request_id, None)


def cleanup_stale_requests():
    """Clean up stale pending config requests."""
    current_time = time.time()
    stale_ids = [
        req_id
        for req_id, req in pending_config_requests.items()
        if current_time - req['timestamp'] > CONFIG_FETCH_TIMEOUT * 2
    ]

    for req_id in stale_ids:
        pending = pending_config_requests.pop(req_id, None)
        if pending and pending.get('future') and not pending['future'].done():
            pending['future'].set_exception(asyncio.TimeoutError('Request expired'))


def setup_config_snapshot_routes(app: web.Application):
    """Setup config snapshot routes."""
    app.router.add_post('/api/config-sync/snapshot/{printer_id}', fetch_printer_config_snapshot)
    app.router.add_get('/api/config-sync/snapshot-debug/{printer_id}', debug_printer_config_snapshot)
