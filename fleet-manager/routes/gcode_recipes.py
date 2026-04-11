"""
G-code Recipe Routes

CRUD API for hierarchical G-code recipe trees, scoped to the user's organization.
Also supports a bulk-sync endpoint that replaces the entire tree in one call.
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


@require_auth
async def list_recipes(request: web.Request):
    """Get the full recipe tree for the user's organization"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'recipes': []})

    group_id = groups[0]['id']
    recipes = db.get_recipe_tree(group_id)
    return web.json_response({
        'recipes': [r.to_dict() for r in recipes],
    })


@require_auth
async def create_recipe(request: web.Request):
    """Create a single recipe node"""
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

    recipe = db.create_recipe(
        group_id=group_id,
        created_by=user_id,
        parent_id=data.get('parentId'),
        name=name,
        node_type=data.get('nodeType', 'item'),
        file_id=data.get('fileId'),
        position=data.get('position', 0),
    )
    logger.info(f"Recipe created: {recipe.name} ({recipe.id}) by {user_id}")
    return web.json_response(recipe.to_dict(), status=201)


@require_auth
async def update_recipe(request: web.Request):
    """Update a single recipe node"""
    recipe_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    recipe = db.update_recipe(recipe_id, data)
    if not recipe:
        return web.json_response({'error': 'Recipe not found'}, status=404)

    logger.info(f"Recipe updated: {recipe.name} ({recipe.id})")
    return web.json_response(recipe.to_dict())


@require_auth
async def delete_recipe(request: web.Request):
    """Delete a recipe node and all its children"""
    recipe_id = request.match_info['id']
    db: DatabaseService = request.app['db']

    if not db.delete_recipe(recipe_id):
        return web.json_response({'error': 'Recipe not found'}, status=404)

    logger.info(f"Recipe deleted: {recipe_id}")
    return web.json_response({'message': 'Deleted'})


@require_auth
async def sync_recipes(request: web.Request):
    """
    Replace the entire recipe tree for the user's organization.

    Accepts { "recipes": RecipeNode[] } where each node mirrors the frontend
    tree shape: { name, nodeType?, fileId?, children?: [] }.
    Existing rows for the group are deleted and re-created from the payload.
    """
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    nodes = data.get('recipes')
    if not isinstance(nodes, list):
        return web.json_response({'error': '"recipes" must be an array'}, status=400)

    groups = db.get_user_groups(user_id)
    if not groups:
        return web.json_response({'error': 'User must belong to a group'}, status=400)
    group_id = groups[0]['id']

    recipes = db.sync_recipes(group_id, user_id, nodes)
    logger.info(f"Recipes synced for group {group_id} by {user_id}")
    return web.json_response({
        'recipes': [r.to_dict() for r in recipes],
    })


def setup_gcode_recipe_routes(app: web.Application):
    """Register G-code recipe routes"""
    app.router.add_get('/api/gcode-recipes', list_recipes)
    app.router.add_post('/api/gcode-recipes', create_recipe)
    app.router.add_post('/api/gcode-recipes/sync', sync_recipes)
    app.router.add_put('/api/gcode-recipes/{id}', update_recipe)
    app.router.add_delete('/api/gcode-recipes/{id}', delete_recipe)
    logger.info("G-code recipe routes configured")
