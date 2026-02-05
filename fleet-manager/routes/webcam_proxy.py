"""
Webcam Proxy Routes
Proxies webcam requests (including WebRTC signaling) to printers through WebSocket relay.

Instead of making direct HTTP connections to printers, this module sends requests
through the existing WebSocket connection to the printer client, which then fetches
the webcam data locally and returns it.
"""
import asyncio
import logging
import uuid
import time
import base64
import json
from aiohttp import web
from .common import require_auth

logger = logging.getLogger(__name__)

# Store for pending webcam requests (request_id -> dict with Future)
pending_webcam_requests: dict = {}

# Timeout for webcam requests (seconds)
WEBCAM_REQUEST_TIMEOUT = 30


@require_auth
async def proxy_webcam_request(request: web.Request) -> web.Response:
    """
    Proxy webcam requests to the printer through WebSocket relay.
    
    Route: /webcam/proxy/{printer_id}/{path:.*}
    
    This handles WebRTC signaling (POST requests) and other webcam endpoints.
    The request is forwarded to the printer client via WebSocket, which fetches
    the data locally and returns it.
    """
    # Get auth from decorator
    user = request.get('user', {})
    user_id = user.get('sub')
    
    db = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    printer_id = request.match_info.get('printer_id')
    path = request.match_info.get('path', 'webrtc')
    
    if not printer_id:
        return web.json_response({'error': 'Missing printer_id'}, status=400)
    
    if not fleet_manager:
        logger.error("Fleet manager not available")
        return web.json_response({'error': 'Fleet manager not available'}, status=500)
    
    # Check user has access to this printer
    printer = db.get_accessible_printer_by_id(printer_id, user_id)
    if not printer:
        logger.warning(f"Webcam proxy: printer not found or no access: {printer_id}")
        return web.json_response({'error': 'Printer not found'}, status=404)
    
    # Check printer is connected
    if printer_id not in fleet_manager.connected_printers:
        logger.warning(f"Webcam proxy: printer not connected: {printer_id}")
        return web.json_response({'error': 'Printer not connected'}, status=503)
    
    # Get the request body if present
    body_base64 = None
    if request.method in ['POST', 'PUT', 'PATCH']:
        body = await request.read()
        if body:
            body_base64 = base64.b64encode(body).decode('utf-8')
    
    # Build headers dict (excluding hop-by-hop headers)
    headers = {}
    for key, value in request.headers.items():
        key_lower = key.lower()
        if key_lower not in ['host', 'content-length', 'transfer-encoding', 
                             'connection', 'authorization', 'cookie']:
            headers[key] = value
    
    # Generate unique request ID
    request_id = f"webcam:{uuid.uuid4().hex}"
    
    # Create a Future to wait for the response
    loop = asyncio.get_event_loop()
    response_future = loop.create_future()
    pending_webcam_requests[request_id] = {
        'future': response_future,
        'timestamp': time.time(),
        'printer_id': printer_id
    }
    
    try:
        # Send webcam request to printer via WebSocket
        printer_ws = fleet_manager.connected_printers[printer_id]
        
        webcam_request = {
            'type': 'webcam_request',
            'request_id': request_id,
            'method': request.method,
            'path': f'/webcam/{path}',
            'headers': headers,
            'body': body_base64,
            'query_string': request.query_string
        }
        
        await printer_ws.send(json.dumps(webcam_request))
        logger.debug(f"Sent webcam request {request_id} to printer {printer_id}: {request.method} /webcam/{path}")
        
        # Wait for response with timeout
        try:
            response_data = await asyncio.wait_for(
                response_future,
                timeout=WEBCAM_REQUEST_TIMEOUT
            )
        except asyncio.TimeoutError:
            logger.error(f"Webcam request {request_id} timed out")
            return web.json_response({
                'error': 'Request timed out',
                'details': 'Printer did not respond in time'
            }, status=504)
        
        # Process response from printer
        if 'error' in response_data:
            logger.warning(f"Webcam request {request_id} error: {response_data['error']}")
            return web.json_response({
                'error': response_data['error'],
                'details': response_data.get('details', '')
            }, status=response_data.get('status', 502))
        
        # Decode response body
        response_body = b''
        if response_data.get('body'):
            response_body = base64.b64decode(response_data['body'])
        
        # Build response headers
        response_headers = {}
        for key, value in response_data.get('headers', {}).items():
            if key.lower() not in ['content-length', 'transfer-encoding', 'connection']:
                response_headers[key] = value
        
        return web.Response(
            body=response_body,
            status=response_data.get('status', 200),
            headers=response_headers
        )
        
    except Exception as e:
        logger.error(f"Webcam proxy error: {e}")
        return web.json_response({
            'error': 'Internal proxy error',
            'details': str(e)
        }, status=500)
    finally:
        # Clean up pending request
        pending_webcam_requests.pop(request_id, None)


def handle_webcam_response(response_data: dict):
    """
    Handle a webcam response from a printer client.
    Called by the fleet manager when receiving a webcam_response message.
    """
    request_id = response_data.get('request_id')
    if not request_id:
        logger.warning("Received webcam response without request_id")
        return
    
    pending = pending_webcam_requests.get(request_id)
    if not pending:
        logger.warning(f"Received webcam response for unknown request: {request_id}")
        return
    
    future = pending.get('future')
    if future and not future.done():
        future.set_result(response_data)
        logger.debug(f"Resolved webcam request {request_id}")


def cleanup_stale_requests():
    """Clean up stale webcam requests that have been pending too long."""
    current_time = time.time()
    stale_ids = [
        req_id for req_id, req in pending_webcam_requests.items()
        if current_time - req['timestamp'] > WEBCAM_REQUEST_TIMEOUT * 2
    ]
    for req_id in stale_ids:
        pending = pending_webcam_requests.pop(req_id, None)
        if pending and pending.get('future') and not pending['future'].done():
            pending['future'].set_exception(asyncio.TimeoutError("Request expired"))
        logger.debug(f"Cleaned up stale webcam request: {req_id}")


def setup_webcam_proxy_routes(app: web.Application):
    """Setup webcam proxy routes."""
    logger.info("Setting up Webcam proxy routes (WebSocket relay mode)")
    
    # Proxy route for webcam requests
    # Matches: /webcam/proxy/{printer_id}/webrtc, /webcam/proxy/{printer_id}/?action=stream, etc.
    app.router.add_route('*', '/webcam/proxy/{printer_id}/{path:.*}', proxy_webcam_request)
    # Also handle case where path is empty (just /webcam/proxy/{printer_id})
    app.router.add_route('*', '/webcam/proxy/{printer_id}', proxy_webcam_request)
