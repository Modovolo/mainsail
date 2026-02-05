"""
Printer Routes
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


@require_auth
async def get_user_printers(request: web.Request):
    """Get all printers for the logged-in user"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    printers = db.get_user_printers(user_id)
    return web.json_response({
        'printers': [p.to_dict() for p in printers]
    })


@require_auth
async def get_accessible_printers(request: web.Request):
    """Get all printers the user can access (owned + group printers)"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    printers = db.get_user_accessible_printers(user_id)
    return web.json_response({
        'printers': [p.to_dict() for p in printers]
    })


@require_auth
async def remove_printer_from_group(request: web.Request):
    """Remove a printer from its group"""
    user_id = request['user']['sub']
    printer_id = request.match_info['printer_id']
    db: DatabaseService = request.app['db']
    
    if not db.remove_printer_from_group(printer_id, user_id):
        return web.json_response({'error': 'Printer not found or you are not the owner'}, status=404)
    
    return web.json_response({'message': 'Printer removed from group successfully'})


def setup_printer_routes(app: web.Application):
    """Setup printer routes"""
    app.router.add_get('/api/printers', get_user_printers)
    app.router.add_get('/api/printers/accessible', get_accessible_printers)
    app.router.add_delete('/api/printers/{printer_id}/group', remove_printer_from_group)
    
    logger.info("Printer routes configured")
