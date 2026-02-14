"""
Printer Profile Routes

CRUD endpoints for global printer profiles (machine configurations).
These profiles store bed volume, extruder count, nozzle diameter, etc.
and are shared across all users.
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


@require_auth
async def list_printer_profiles(request: web.Request):
    """Get all printer profiles"""
    db: DatabaseService = request.app['db']
    profiles = db.get_all_printer_profiles()
    return web.json_response({
        'profiles': [p.to_dict() for p in profiles]
    })


@require_auth
async def get_printer_profile(request: web.Request):
    """Get a single printer profile by ID"""
    profile_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    profile = db.get_printer_profile(profile_id)
    if not profile:
        return web.json_response({'error': 'Printer profile not found'}, status=404)

    return web.json_response(profile.to_dict())


@require_auth
async def create_printer_profile(request: web.Request):
    """Create a new printer profile"""
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    if not data.get('name'):
        return web.json_response({'error': 'Name is required'}, status=400)

    profile = db.create_printer_profile(data)
    logger.info(f"Printer profile created: {profile.name} ({profile.id})")
    return web.json_response(profile.to_dict(), status=201)


@require_auth
async def update_printer_profile(request: web.Request):
    """Update an existing printer profile"""
    profile_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    profile = db.update_printer_profile(profile_id, data)
    if not profile:
        return web.json_response({'error': 'Printer profile not found'}, status=404)

    logger.info(f"Printer profile updated: {profile.name} ({profile.id})")
    return web.json_response(profile.to_dict())


@require_auth
async def delete_printer_profile(request: web.Request):
    """Delete a printer profile"""
    profile_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    if not db.delete_printer_profile(profile_id):
        return web.json_response({'error': 'Printer profile not found'}, status=404)

    logger.info(f"Printer profile deleted: {profile_id}")
    return web.json_response({'message': 'Printer profile deleted'})


def setup_printer_profile_routes(app: web.Application):
    """Setup printer profile routes"""
    app.router.add_get('/api/printer-profiles', list_printer_profiles)
    app.router.add_get('/api/printer-profiles/{id}', get_printer_profile)
    app.router.add_post('/api/printer-profiles', create_printer_profile)
    app.router.add_put('/api/printer-profiles/{id}', update_printer_profile)
    app.router.add_delete('/api/printer-profiles/{id}', delete_printer_profile)

    logger.info("Printer profile routes configured")
