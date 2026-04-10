"""
PMI & Downtime Routes
"""
import logging
from datetime import datetime

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


# ── Downtime ──

@require_auth
async def list_downtime(request: web.Request):
    """List all downtime records visible to the user (team-scoped)"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    records = db.get_team_downtime_records(user_id)
    return web.json_response({
        'records': [r.to_dict() for r in records],
    })


@require_auth
async def create_downtime(request: web.Request):
    """Create a new downtime record"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    printer = data.get('printer')
    start = data.get('start')
    reason = data.get('reason')

    if not printer or not start or not reason:
        return web.json_response({'error': 'printer, start, and reason are required'}, status=400)

    # Determine the user's group (use first group)
    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'error': 'User must belong to a group'}, status=400)
    group_id = groups[0]['id']

    record = db.create_downtime_record(
        user_id=user_id,
        group_id=group_id,
        printer=printer,
        start=start,
        end=data.get('end'),
        reason=reason,
        description=data.get('description', ''),
    )
    return web.json_response({'record': record.to_dict()}, status=201)


@require_auth
async def delete_downtime(request: web.Request):
    """Delete a downtime record (only owner)"""
    user_id = request['user']['sub']
    record_id = request.match_info['record_id']
    db: DatabaseService = request.app['db']

    if not db.delete_downtime_record(record_id, user_id):
        return web.json_response({'error': 'Record not found or not authorized'}, status=404)

    return web.json_response({'message': 'Deleted'})


# ── PMI ──

@require_auth
async def list_pmi(request: web.Request):
    """List all PMI records visible to the user (team-scoped)"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    records = db.get_team_pmi_records(user_id)
    return web.json_response({
        'records': [r.to_dict() for r in records],
    })


@require_auth
async def create_pmi(request: web.Request):
    """Create a new PMI record"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    printer = data.get('printer')
    inspector = data.get('inspector')
    date = data.get('date')
    pmi_type = data.get('type')
    overall_status = data.get('overallStatus')
    checklist = data.get('checklist', [])

    if not all([printer, inspector, date, pmi_type, overall_status]):
        return web.json_response(
            {'error': 'printer, inspector, date, type, and overallStatus are required'},
            status=400,
        )

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'error': 'User must belong to a group'}, status=400)
    group_id = groups[0]['id']

    record = db.create_pmi_record(
        user_id=user_id,
        group_id=group_id,
        printer=printer,
        inspector=inspector,
        date=date,
        pmi_type=pmi_type,
        additional_notes=data.get('additionalNotes', ''),
        overall_status=overall_status,
        checklist=checklist,
    )
    return web.json_response({'record': record.to_dict()}, status=201)


@require_auth
async def get_pmi_detail(request: web.Request):
    """Get a single PMI record by ID"""
    user_id = request['user']['sub']
    record_id = request.match_info['record_id']
    db: DatabaseService = request.app['db']

    record = db.get_pmi_record(record_id, user_id)
    if not record:
        return web.json_response({'error': 'Record not found or not authorized'}, status=404)

    return web.json_response({'record': record.to_dict()})


# ── Lookups ──

@require_auth
async def get_team_members(request: web.Request):
    """Get usernames of all members in the user's teams"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    usernames = db.get_team_usernames(user_id)
    return web.json_response({'usernames': usernames})


# ── Setup ──

def setup_pmi_routes(app: web.Application):
    """Setup PMI & Downtime routes"""
    app.router.add_get('/api/pmi/downtime', list_downtime)
    app.router.add_post('/api/pmi/downtime', create_downtime)
    app.router.add_delete('/api/pmi/downtime/{record_id}', delete_downtime)

    app.router.add_get('/api/pmi/inspections', list_pmi)
    app.router.add_post('/api/pmi/inspections', create_pmi)
    app.router.add_get('/api/pmi/inspections/{record_id}', get_pmi_detail)

    app.router.add_get('/api/pmi/team-members', get_team_members)

    logger.info("PMI & Downtime routes configured")
