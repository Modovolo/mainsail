"""
Design Tree Routes

CRUD API for hierarchical design file trees, scoped to the user's organization.
Mirrors the G-code recipe routes pattern for the design team's part library.
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


@require_auth
async def list_designs(request: web.Request):
    """Get the full design tree for the user's organization"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'designs': []})

    group_id = groups[0]['id']
    designs = db.get_design_tree(group_id)
    return web.json_response({
        'designs': [d.to_dict() for d in designs],
    })


@require_auth
async def create_design(request: web.Request):
    """Create a single design tree node"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    name = data.get('name', '').strip()
    if not name:
        return web.json_response({'error': 'Name is required'}, status=400)

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'error': 'User must belong to a group'}, status=400)
    group_id = groups[0]['id']

    design = db.create_design_node(
        group_id=group_id,
        created_by=user_id,
        parent_id=data.get('parentId'),
        name=name,
        node_type=data.get('nodeType', 'item'),
        file_id=data.get('fileId'),
        version=data.get('version'),
        position=data.get('position', 0),
    )
    logger.info(f"Design node created: {design.name} ({design.id}) by {user_id}")
    return web.json_response(design.to_dict(), status=201)


@require_auth
async def update_design(request: web.Request):
    """Update a single design tree node"""
    design_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    design = db.update_design_node(design_id, data)
    if not design:
        return web.json_response({'error': 'Design node not found'}, status=404)

    logger.info(f"Design node updated: {design.name} ({design.id})")
    return web.json_response(design.to_dict())


@require_auth
async def delete_design(request: web.Request):
    """Delete a design tree node and all its children"""
    design_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    if not db.delete_design_node(design_id):
        return web.json_response({'error': 'Design node not found'}, status=404)

    logger.info(f"Design node deleted: {design_id}")
    return web.json_response({'message': 'Deleted'})


@require_auth
async def sync_designs(request: web.Request):
    """
    Replace the entire design tree for the user's organization.

    Accepts { "designs": DesignNode[] } where each node mirrors the frontend
    tree shape: { name, nodeType?, fileId?, version?, children?: [] }.
    Existing rows for the group are deleted and re-created from the payload.
    """
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    nodes = data.get('designs')
    if not isinstance(nodes, list):
        return web.json_response({'error': '"designs" must be an array'}, status=400)

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'error': 'User must belong to a group'}, status=400)
    group_id = groups[0]['id']

    designs = db.sync_design_tree(group_id, user_id, nodes)
    logger.info(f"Design tree synced for group {group_id} by {user_id}")
    return web.json_response({
        'designs': [d.to_dict() for d in designs],
    })


def setup_design_tree_routes(app: web.Application):
    """Register design tree routes"""
    app.router.add_get('/api/design-tree', list_designs)
    app.router.add_post('/api/design-tree', create_design)
    app.router.add_post('/api/design-tree/sync', sync_designs)
    app.router.add_put('/api/design-tree/{id}', update_design)
    app.router.add_delete('/api/design-tree/{id}', delete_design)
    logger.info("Design tree routes configured")
