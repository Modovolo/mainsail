"""
Group Routes
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


@require_auth
async def create_group(request: web.Request):
    """Create a new group"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
        name = data.get('name')
        description = data.get('description')
        
        if not name:
            return web.json_response({'error': 'Group name is required'}, status=400)
        
        group = db.create_group(name, user_id, description)
        return web.json_response({'group': group.to_dict()}, status=201)
    except Exception as e:
        logger.error(f"Error creating group: {e}")
        return web.json_response({'error': str(e)}, status=500)


@require_auth
async def list_user_groups(request: web.Request):
    """List all groups the user belongs to"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    groups = db.get_user_groups(user_id)
    return web.json_response({'groups': groups})


@require_auth
async def get_group(request: web.Request):
    """Get group details including members and printers"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: DatabaseService = request.app['db']
    
    role = db.get_user_group_role(user_id, group_id)
    if not role:
        return web.json_response({'error': 'Not a member of this group'}, status=403)
    
    group = db.get_group_by_id(group_id)
    if not group:
        return web.json_response({'error': 'Group not found'}, status=404)
    
    members = db.get_group_members(group_id)
    printers = db.get_group_printers(group_id)
    
    result = group.to_dict()
    result['members'] = [m.to_dict() for m in members]
    result['printers'] = [p.to_dict() for p in printers]
    result['userRole'] = role
    
    return web.json_response({'group': result})


@require_auth
async def update_group(request: web.Request):
    """Update group name or description"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
        name = data.get('name')
        description = data.get('description')
        
        if not db.update_group(group_id, user_id, name, description):
            return web.json_response({'error': 'Not authorized to update this group'}, status=403)
        
        return web.json_response({'message': 'Group updated successfully'})
    except Exception as e:
        logger.error(f"Error updating group: {e}")
        return web.json_response({'error': str(e)}, status=500)


@require_auth
async def delete_group(request: web.Request):
    """Delete a group (owner only)"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: DatabaseService = request.app['db']
    
    if not db.delete_group(group_id, user_id):
        return web.json_response({'error': 'Not authorized to delete this group'}, status=403)
    
    return web.json_response({'message': 'Group deleted successfully'})


@require_auth
async def add_group_member(request: web.Request):
    """Add a member to a group"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: DatabaseService = request.app['db']
    
    role = db.get_user_group_role(user_id, group_id)
    if role not in ['owner', 'admin']:
        return web.json_response({'error': 'Not authorized to add members'}, status=403)
    
    try:
        data = await request.json()
        username_or_email = data.get('user')
        member_role = data.get('role', 'member')
        
        if not username_or_email:
            return web.json_response({'error': 'User identifier is required'}, status=400)
        
        if member_role not in ['admin', 'member']:
            return web.json_response({'error': 'Invalid role. Must be admin or member'}, status=400)
        
        target_user = db.get_user_by_username_or_email(username_or_email)
        if not target_user:
            return web.json_response({'error': 'User not found'}, status=404)
        
        member = db.add_group_member(group_id, target_user.id, member_role)
        if not member:
            return web.json_response({'error': 'User is already a member of this group'}, status=400)
        
        return web.json_response({'member': member.to_dict()}, status=201)
    except Exception as e:
        logger.error(f"Error adding group member: {e}")
        return web.json_response({'error': str(e)}, status=500)


@require_auth
async def remove_group_member(request: web.Request):
    """Remove a member from a group"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    member_user_id = request.match_info['user_id']
    db: DatabaseService = request.app['db']
    
    role = db.get_user_group_role(user_id, group_id)
    if user_id != member_user_id and role not in ['owner', 'admin']:
        return web.json_response({'error': 'Not authorized to remove members'}, status=403)
    
    target_role = db.get_user_group_role(member_user_id, group_id)
    if target_role == 'owner' and user_id != member_user_id:
        return web.json_response({'error': 'Cannot remove the group owner'}, status=400)
    
    if not db.remove_group_member(group_id, member_user_id):
        return web.json_response({'error': 'Member not found'}, status=404)
    
    return web.json_response({'message': 'Member removed successfully'})


@require_auth
async def update_member_role(request: web.Request):
    """Update a member's role"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    member_user_id = request.match_info['user_id']
    db: DatabaseService = request.app['db']
    
    role = db.get_user_group_role(user_id, group_id)
    if role != 'owner':
        return web.json_response({'error': 'Only the group owner can change roles'}, status=403)
    
    try:
        data = await request.json()
        new_role = data.get('role')
        
        if new_role not in ['admin', 'member']:
            return web.json_response({'error': 'Invalid role. Must be admin or member'}, status=400)
        
        if user_id == member_user_id:
            return web.json_response({'error': 'Cannot change your own role as owner'}, status=400)
        
        if not db.update_member_role(group_id, member_user_id, new_role):
            return web.json_response({'error': 'Member not found'}, status=404)
        
        return web.json_response({'message': 'Role updated successfully'})
    except Exception as e:
        logger.error(f"Error updating member role: {e}")
        return web.json_response({'error': str(e)}, status=500)


@require_auth
async def assign_printer_to_group(request: web.Request):
    """Assign a printer to a group"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: DatabaseService = request.app['db']
    
    role = db.get_user_group_role(user_id, group_id)
    if not role:
        return web.json_response({'error': 'Not a member of this group'}, status=403)
    
    try:
        data = await request.json()
        printer_id = data.get('printerId')
        
        if not printer_id:
            return web.json_response({'error': 'Printer ID is required'}, status=400)
        
        if not db.assign_printer_to_group(printer_id, group_id, user_id):
            return web.json_response({'error': 'Printer not found or you are not the owner'}, status=404)
        
        return web.json_response({'message': 'Printer assigned to group successfully'})
    except Exception as e:
        logger.error(f"Error assigning printer to group: {e}")
        return web.json_response({'error': str(e)}, status=500)


def setup_group_routes(app: web.Application):
    """Setup group routes"""
    app.router.add_post('/api/groups', create_group)
    app.router.add_get('/api/groups', list_user_groups)
    app.router.add_get('/api/groups/{group_id}', get_group)
    app.router.add_put('/api/groups/{group_id}', update_group)
    app.router.add_delete('/api/groups/{group_id}', delete_group)
    app.router.add_post('/api/groups/{group_id}/members', add_group_member)
    app.router.add_delete('/api/groups/{group_id}/members/{user_id}', remove_group_member)
    app.router.add_put('/api/groups/{group_id}/members/{user_id}', update_member_role)
    app.router.add_post('/api/groups/{group_id}/printers', assign_printer_to_group)
    
    logger.info("Group routes configured")
