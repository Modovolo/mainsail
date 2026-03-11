"""
Monitoring Routes
Fleet-authenticated facade for bfp-print-monitor read APIs.
"""
import logging
import os
import asyncio
import base64
import json
import time
import uuid
from datetime import datetime
from typing import Dict, Any, List
from urllib.parse import urlsplit, urlunsplit

from aiohttp import web, ClientSession, ClientTimeout

from .common import require_auth
from .webcam_proxy import pending_webcam_requests

logger = logging.getLogger(__name__)


# In-memory operator workflow state for v1 (ack/resolve)
_monitoring_annotations: Dict[str, Dict[str, Any]] = {}
_monitoring_thresholds: Dict[str, Dict[str, Any]] = {}


def _monitor_base_url() -> str:
    return os.environ.get('BFP_MONITOR_BASE_URL', 'http://bfp-print-monitor:5000').rstrip('/')


def _resolve_monitor_hostname(printer) -> str:
    if printer.host:
        return printer.host
    if printer.name:
        return printer.name
    return printer.printer_id


def _last_defect_by_printer(defects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_printer: Dict[str, Dict[str, Any]] = {}
    for defect in defects:
        printer_name = defect.get('printer')
        if not printer_name:
            continue
        by_printer[printer_name] = defect
    return by_printer


def _default_min_confidence() -> float:
    return float(os.environ.get('BFP_MONITOR_DEFAULT_MIN_CONFIDENCE', '0.6'))


def _normalize_base_url(host_or_url: str) -> str:
    value = (host_or_url or '').strip().rstrip('/')
    if not value:
        return ''
    if value.startswith('http://') or value.startswith('https://'):
        return value
    return f'http://{value}'


def _candidate_snapshot_urls(printer) -> List[str]:
    urls: List[str] = []
    base_url = _normalize_base_url(printer.host or printer.name or printer.printer_id)
    if not base_url:
        return urls

    parsed = urlsplit(base_url)
    hostname = parsed.hostname
    if not hostname:
        return urls

    urls.append(f'{base_url}/webcam/snapshot')

    netloc = hostname
    if parsed.port:
        netloc = f'{hostname}:{parsed.port}'
    urls.append(urlunsplit((parsed.scheme or 'http', netloc, '/', 'action=snapshot', '')))

    if parsed.port is None:
        urls.append(urlunsplit((parsed.scheme or 'http', f'{hostname}:8080', '/', 'action=snapshot', '')))

    unique_urls: List[str] = []
    for url in urls:
        if url not in unique_urls:
            unique_urls.append(url)
    return unique_urls


async def _fetch_json(session: ClientSession, url: str) -> Dict[str, Any]:
    async with session.get(url) as response:
        if response.status >= 400:
            body = await response.text()
            raise web.HTTPBadGateway(
                text=f'Upstream monitor request failed ({response.status}): {body[:256]}'
            )
        return await response.json()


async def _fetch_snapshot_via_websocket_relay(request: web.Request, printer_id: str) -> web.Response | None:
    fleet_manager = request.app.get('fleet_manager')
    if not fleet_manager:
        return None

    if printer_id not in fleet_manager.connected_printers:
        return None

    async def _relay_once(path: str, query_string: str = '') -> web.Response | None:
        request_id = f"webcam:{uuid.uuid4().hex}"
        loop = asyncio.get_event_loop()
        response_future = loop.create_future()
        pending_webcam_requests[request_id] = {
            'future': response_future,
            'timestamp': time.time(),
            'printer_id': printer_id,
        }

        try:
            printer_ws = fleet_manager.connected_printers[printer_id]
            webcam_request = {
                'type': 'webcam_request',
                'request_id': request_id,
                'method': 'GET',
                'path': path,
                'headers': {},
                'body': None,
                'query_string': query_string,
            }
            await printer_ws.send(json.dumps(webcam_request))

            try:
                response_data = await asyncio.wait_for(response_future, timeout=12)
            except asyncio.TimeoutError:
                return None

            if 'error' in response_data:
                return None

            status = int(response_data.get('status', 502))
            if status >= 400:
                return None

            response_headers = response_data.get('headers', {}) or {}
            content_type = str(response_headers.get('Content-Type', '')).lower()
            if 'image' not in content_type:
                return None

            body_b64 = response_data.get('body')
            if not body_b64:
                return None

            payload = base64.b64decode(body_b64)
            return web.Response(
                body=payload,
                content_type=response_headers.get('Content-Type', 'image/jpeg'),
                headers={
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    'Pragma': 'no-cache',
                },
            )
        except Exception:
            return None
        finally:
            pending_webcam_requests.pop(request_id, None)

    for relay_path, relay_query in [
        ('/webcam/snapshot', ''),
        ('/webcam/', 'action=snapshot'),
    ]:
        relay_response = await _relay_once(relay_path, relay_query)
        if relay_response is not None:
            return relay_response

    return None


@require_auth
async def get_monitoring_overview(request: web.Request) -> web.Response:
    """Get aggregated monitoring status for all printers accessible to current user."""
    user_id = request['user']['sub']
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')

    if not fleet_manager:
        return web.json_response({'error': 'Fleet manager not available'}, status=500)

    printers = db.get_user_accessible_printers(user_id)
    if not printers:
        return web.json_response(
            {
                'monitorBaseUrl': _monitor_base_url(),
                'monitor': {
                    'available': False,
                    'running': False,
                    'reason': 'No accessible printers',
                },
                'printers': [],
                'generatedAt': datetime.utcnow().isoformat(),
            }
        )

    monitor_status = {}
    monitor_printers = {}
    defects: List[Dict[str, Any]] = []

    timeout = ClientTimeout(total=8)
    base_url = _monitor_base_url()
    try:
        async with ClientSession(timeout=timeout) as session:
            monitor_status = await _fetch_json(session, f'{base_url}/api/status')
            monitor_printers_payload = await _fetch_json(session, f'{base_url}/api/printers')
            monitor_printers = monitor_printers_payload.get('printers', {}) or {}
            defects_payload = await _fetch_json(session, f'{base_url}/api/defects')
            defects = defects_payload.get('defects', []) or []
        monitor_available = True
        monitor_reason = None
    except Exception as exc:
        logger.warning('Monitoring upstream unavailable: %s', exc)
        monitor_available = False
        monitor_reason = str(exc)

    defects_by_printer = _last_defect_by_printer(defects)

    output_printers = []
    for printer in printers:
        hostname = _resolve_monitor_hostname(printer)
        monitor_info = monitor_printers.get(hostname, {}) if monitor_available else {}
        annotation = _monitoring_annotations.get(printer.printer_id, {})
        connected = printer.printer_id in fleet_manager.connected_printers

        output_printers.append(
            {
                'printerId': printer.printer_id,
                'name': printer.name,
                'host': printer.host,
                'monitorHostname': hostname,
                'isConnected': connected,
                'monitorStatus': monitor_info.get('status', 'unknown' if monitor_available else 'unavailable'),
                'streamUrl': monitor_info.get('stream_url', ''),
                'lastMonitorUpdate': monitor_info.get('timestamp'),
                'latestDefect': defects_by_printer.get(hostname),
                'acknowledged': bool(annotation.get('acknowledged', False)),
                'acknowledgedAt': annotation.get('acknowledgedAt'),
                'acknowledgedBy': annotation.get('acknowledgedBy'),
                'thresholds': _monitoring_thresholds.get(
                    printer.printer_id,
                    {'minConfidence': _default_min_confidence()},
                ),
            }
        )

    return web.json_response(
        {
            'monitorBaseUrl': base_url,
            'monitor': {
                'available': monitor_available,
                'running': bool(monitor_status.get('monitor_running', False)) if monitor_available else False,
                'reason': monitor_reason,
                'timestamp': monitor_status.get('timestamp') if monitor_available else None,
                'totalDefects': monitor_status.get('total_defects', 0) if monitor_available else 0,
            },
            'printers': output_printers,
            'generatedAt': datetime.utcnow().isoformat(),
        }
    )


@require_auth
async def get_monitoring_snapshot(request: web.Request) -> web.Response:
    """Proxy latest snapshot for one accessible printer."""
    user_id = request['user']['sub']
    db = request.app['db']
    printer_id = request.match_info.get('printer_id')

    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)

    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    hostname = _resolve_monitor_hostname(printer)
    url = f'{_monitor_base_url()}/api/snapshot/{hostname}'

    relay_response = await _fetch_snapshot_via_websocket_relay(request, printer_id)
    if relay_response is not None:
        return relay_response

    try:
        timeout = ClientTimeout(total=10)
        async with ClientSession(timeout=timeout) as session:
            upstream_status = None
            async with session.get(url) as response:
                if response.status < 400:
                    payload = await response.read()
                    return web.Response(
                        body=payload,
                        content_type=response.headers.get('Content-Type', 'image/jpeg'),
                        headers={
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                            'Pragma': 'no-cache',
                        },
                    )
                upstream_status = response.status
                logger.warning(
                    'Snapshot proxy returned %s for %s (%s), attempting direct fallback',
                    response.status,
                    printer_id,
                    hostname,
                )

            for fallback_url in _candidate_snapshot_urls(printer):
                try:
                    async with session.get(fallback_url) as fallback_response:
                        content_type = fallback_response.headers.get('Content-Type', '').lower()
                        if fallback_response.status >= 400 or 'image' not in content_type:
                            continue

                        payload = await fallback_response.read()
                        return web.Response(
                            body=payload,
                            content_type=fallback_response.headers.get('Content-Type', 'image/jpeg'),
                            headers={
                                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                                'Pragma': 'no-cache',
                            },
                        )
                except Exception:
                    continue

            if upstream_status == 404:
                return web.json_response(
                    {'error': 'Snapshot unavailable for this printer'},
                    status=404,
                )

            return web.json_response(
                {'error': 'Failed to fetch snapshot from monitor and direct fallback URLs'},
                status=502,
            )
    except Exception as exc:
        logger.warning('Snapshot proxy failed for %s (%s): %s', printer_id, hostname, exc)
        return web.json_response({'error': 'Failed to fetch snapshot from monitor service'}, status=502)


@require_auth
async def acknowledge_monitoring_alert(request: web.Request) -> web.Response:
    """Acknowledge or resolve a printer monitoring alert."""
    user = request['user']
    user_id = user.get('sub')
    printer_id = request.match_info.get('printer_id')

    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)

    db = request.app['db']
    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    timestamp = datetime.utcnow().isoformat()
    _monitoring_annotations[printer_id] = {
        'acknowledged': True,
        'acknowledgedAt': timestamp,
        'acknowledgedBy': user.get('username') or user_id,
    }

    return web.json_response(
        {
            'printerId': printer_id,
            'acknowledged': True,
            'acknowledgedAt': timestamp,
            'acknowledgedBy': _monitoring_annotations[printer_id]['acknowledgedBy'],
        }
    )


@require_auth
async def resolve_monitoring_alert(request: web.Request) -> web.Response:
    """Mark a monitoring alert as resolved (clear acknowledge state)."""
    user_id = request['user']['sub']
    printer_id = request.match_info.get('printer_id')

    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)

    db = request.app['db']
    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    _monitoring_annotations.pop(printer_id, None)
    return web.json_response({'printerId': printer_id, 'acknowledged': False})


@require_auth
async def control_monitoring_printer(request: web.Request) -> web.Response:
    """Start/stop monitor process via bfp-print-monitor control endpoint."""
    user_id = request['user']['sub']
    printer_id = request.match_info.get('printer_id')
    action = request.match_info.get('action')

    if action not in {'start', 'stop'}:
        return web.json_response({'error': 'Invalid action. Use start or stop.'}, status=400)

    db = request.app['db']
    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    control_url = f'{_monitor_base_url()}/api/control/{action}'
    payload = {
        'printerId': printer.printer_id,
        'monitorHostname': _resolve_monitor_hostname(printer),
        'requestedBy': user_id,
    }

    try:
        timeout = ClientTimeout(total=12)
        async with ClientSession(timeout=timeout) as session:
            async with session.post(control_url, json=payload) as response:
                result = await response.json(content_type=None)
                if response.status >= 400:
                    return web.json_response(
                        {
                            'error': result.get('error', 'Monitor control request failed'),
                            'details': result.get('message', ''),
                        },
                        status=response.status,
                    )

                return web.json_response(
                    {
                        'printerId': printer_id,
                        'action': action,
                        'ok': bool(result.get('ok', True)),
                        'message': result.get('message', f'Requested monitor {action}'),
                        'monitorRunning': bool(result.get('monitor_running', False)),
                    }
                )
    except Exception as exc:
        logger.warning('Monitor control proxy failed for %s action=%s: %s', printer_id, action, exc)
        return web.json_response({'error': 'Failed to control monitor service'}, status=502)


@require_auth
async def update_monitoring_thresholds(request: web.Request) -> web.Response:
    """Update per-printer monitoring thresholds.

    Upstream bfp monitor config mutation endpoints are not available yet; this is an explicit scaffold.
    """
    user_id = request['user']['sub']
    printer_id = request.match_info.get('printer_id')

    db = request.app['db']
    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)

    try:
        payload = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    min_confidence = payload.get('minConfidence')
    if min_confidence is None:
        return web.json_response({'error': 'minConfidence is required'}, status=400)

    try:
        min_confidence = float(min_confidence)
    except (TypeError, ValueError):
        return web.json_response({'error': 'minConfidence must be a number'}, status=400)

    if min_confidence < 0 or min_confidence > 1:
        return web.json_response({'error': 'minConfidence must be between 0 and 1'}, status=400)

    _monitoring_thresholds[printer_id] = {
        'minConfidence': min_confidence,
        'updatedAt': datetime.utcnow().isoformat(),
    }

    return web.json_response(
        {
            'printerId': printer_id,
            'thresholds': _monitoring_thresholds[printer_id],
        }
    )


def setup_monitoring_routes(app: web.Application):
    """Setup monitoring routes."""
    app.router.add_get('/api/monitoring/overview', get_monitoring_overview)
    app.router.add_get('/api/monitoring/snapshot/{printer_id}', get_monitoring_snapshot)
    app.router.add_post('/api/monitoring/printers/{printer_id}/acknowledge', acknowledge_monitoring_alert)
    app.router.add_post('/api/monitoring/printers/{printer_id}/resolve', resolve_monitoring_alert)
    app.router.add_post('/api/monitoring/printers/{printer_id}/control/{action}', control_monitoring_printer)
    app.router.add_put('/api/monitoring/printers/{printer_id}/thresholds', update_monitoring_thresholds)
