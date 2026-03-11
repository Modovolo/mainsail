"""
Authentication Routes
"""
import json
import logging

from aiohttp import web
from pydantic import ValidationError

from schemas import LoginRequest, RegisterRequest
from services.database import DatabaseService
from services.auth import JWTAuth
from routes.common import require_auth, require_role

logger = logging.getLogger(__name__)


async def login(request: web.Request):
    """Login endpoint"""
    try:
        data = await request.json()
        login_req = LoginRequest(**data)
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return web.json_response({'error': str(e.errors()[0]['msg'])}, status=400)
    
    db: DatabaseService = request.app['db']
    jwt_auth: JWTAuth = request.app['jwt_auth']
    
    user = db.authenticate(login_req.username, login_req.password)
    if not user:
        return web.json_response({'error': 'Invalid credentials'}, status=401)
    
    access_token = jwt_auth.create_access_token(user)
    refresh_token = jwt_auth.create_refresh_token(user)
    
    return web.json_response({
        'token': access_token,
        'refreshToken': refresh_token,
        'user': user.to_dict()
    })


async def register(request: web.Request):
    """Register endpoint"""
    try:
        data = await request.json()
        register_req = RegisterRequest(**data)
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return web.json_response({'error': str(e.errors()[0]['msg'])}, status=400)
    
    db: DatabaseService = request.app['db']
    
    if db.get_user_by_username(register_req.username):
        return web.json_response({'error': 'Username already exists'}, status=409)
    
    try:
        user = db.create_user(register_req.username, register_req.password, register_req.email)
        return web.json_response({
            'message': 'User created successfully',
            'user': user.to_dict()
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        return web.json_response({'error': 'Failed to create user'}, status=500)


async def refresh(request: web.Request):
    """Refresh token endpoint"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    refresh_token = data.get('refreshToken')
    if not refresh_token:
        return web.json_response({'error': 'Refresh token required'}, status=400)
    
    jwt_auth: JWTAuth = request.app['jwt_auth']
    
    result = jwt_auth.refresh_access_token(refresh_token)
    if not result:
        return web.json_response({'error': 'Invalid or expired refresh token'}, status=401)
    
    new_token, user = result
    return web.json_response({
        'token': new_token,
        'user': user.to_dict()
    })


async def logout(request: web.Request):
    """Logout endpoint"""
    try:
        data = await request.json()
        refresh_token = data.get('refreshToken')
        if refresh_token:
            db: DatabaseService = request.app['db']
            db.revoke_refresh_token(refresh_token)
    except:
        pass
    
    return web.json_response({'message': 'Logged out successfully'})


@require_auth
async def get_me(request: web.Request):
    """Get current user info"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    return web.json_response({'user': user.to_dict()})


@require_auth
async def change_password(request: web.Request):
    """Change password endpoint"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')
    
    if not current_password or not new_password:
        return web.json_response({'error': 'Current and new password required'}, status=400)
    
    if len(new_password) < 8:
        return web.json_response({'error': 'New password must be at least 8 characters'}, status=400)
    
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    if not db._verify_password(current_password, user.password_hash):
        return web.json_response({'error': 'Current password is incorrect'}, status=401)
    
    db.update_password(user_id, new_password)
    db.revoke_all_user_tokens(user_id)
    
    return web.json_response({'message': 'Password changed successfully'})


# ==================== Admin User Management ====================

@require_role('admin')
async def admin_list_users(request: web.Request):
    """List all users (admin only)"""
    db: DatabaseService = request.app['db']
    
    try:
        users = db.get_all_users()
        return web.json_response({
            'users': [u.to_dict() for u in users]
        })
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return web.json_response({'error': 'Failed to list users'}, status=500)


@require_role('admin')
async def admin_reset_user_password(request: web.Request):
    """Reset a user's password (admin only)"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    user_id = data.get('userId')
    new_password = data.get('newPassword')
    
    if not user_id or not new_password:
        return web.json_response({'error': 'User ID and new password required'}, status=400)
    
    if len(new_password) < 8:
        return web.json_response({'error': 'Password must be at least 8 characters'}, status=400)
    
    db: DatabaseService = request.app['db']
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    if db.admin_reset_password(user_id, new_password):
        logger.info(f"Admin reset password for user {user.username}")
        return web.json_response({'message': f'Password reset for user {user.username}'})
    else:
        return web.json_response({'error': 'Failed to reset password'}, status=500)


@require_role('admin')
async def admin_update_user_role(request: web.Request):
    """Update a user's role (admin only)"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    user_id = data.get('userId')
    new_role = data.get('role')
    
    if not user_id or not new_role:
        return web.json_response({'error': 'User ID and role required'}, status=400)
    
    if new_role not in ['user', 'admin', 'operator']:
        return web.json_response({'error': 'Invalid role. Must be: user, admin, or operator'}, status=400)
    
    db: DatabaseService = request.app['db']
    
    # Prevent admin from demoting themselves
    current_user_id = request['user']['sub']
    if user_id == current_user_id and new_role != 'admin':
        return web.json_response({'error': 'Cannot change your own role'}, status=400)
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    if db.update_user_role(user_id, new_role):
        logger.info(f"Admin updated role for user {user.username} to {new_role}")
        return web.json_response({'message': f'Role updated to {new_role} for user {user.username}'})
    else:
        return web.json_response({'error': 'Failed to update role'}, status=500)


@require_role('admin')
async def admin_toggle_user_active(request: web.Request):
    """Activate or deactivate a user (admin only)"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    user_id = data.get('userId')
    is_active = data.get('isActive')
    
    if not user_id or is_active is None:
        return web.json_response({'error': 'User ID and isActive required'}, status=400)
    
    db: DatabaseService = request.app['db']
    
    # Prevent admin from deactivating themselves
    current_user_id = request['user']['sub']
    if user_id == current_user_id and not is_active:
        return web.json_response({'error': 'Cannot deactivate your own account'}, status=400)
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    if is_active:
        success = db.activate_user(user_id)
        action = 'activated'
    else:
        success = db.deactivate_user(user_id)
        action = 'deactivated'
    
    if success:
        logger.info(f"Admin {action} user {user.username}")
        return web.json_response({'message': f'User {user.username} {action}'})
    else:
        return web.json_response({'error': f'Failed to {action.replace("d", "")} user'}, status=500)


# ==================== Forgot Password/Username Flow ====================

async def forgot_username(request: web.Request):
    """Look up username by email address"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    email = data.get('email', '').strip().lower()
    
    if not email:
        return web.json_response({'error': 'Email address is required'}, status=400)
    
    db: DatabaseService = request.app['db']
    user = db.get_user_by_email(email)
    
    # Always return success to prevent email enumeration
    # But optionally return the username if found
    if user:
        logger.info(f"Username lookup for email: {email} - found: {user.username}")
        return web.json_response({
            'message': 'If an account exists with this email, the username has been returned.',
            'username': user.username
        })
    else:
        logger.info(f"Username lookup for email: {email} - not found")
        return web.json_response({
            'message': 'If an account exists with this email, the username has been returned.',
            'username': None
        })


async def request_password_reset(request: web.Request):
    """Request a password reset token"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    identifier = data.get('identifier', '').strip()  # Can be username or email
    
    if not identifier:
        return web.json_response({'error': 'Username or email is required'}, status=400)
    
    db: DatabaseService = request.app['db']
    user = db.get_user_by_username_or_email(identifier)
    
    # Always return success to prevent enumeration
    if user:
        token = db.create_password_reset_token(user.id)
        logger.info(f"Password reset token created for user: {user.username}")
        # In production, you would send this via email
        # For now, return it directly (useful for development/testing)
        return web.json_response({
            'message': 'If an account exists, a password reset token has been generated.',
            'resetToken': token,  # In production, remove this and send via email
            'expiresIn': '1 hour'
        })
    else:
        logger.info(f"Password reset requested for unknown identifier: {identifier}")
        return web.json_response({
            'message': 'If an account exists, a password reset token has been generated.',
            'resetToken': None
        })


async def reset_password_with_token(request: web.Request):
    """Reset password using a reset token"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    token = data.get('token', '').strip()
    new_password = data.get('newPassword', '')
    
    if not token:
        return web.json_response({'error': 'Reset token is required'}, status=400)
    
    if not new_password or len(new_password) < 8:
        return web.json_response({'error': 'Password must be at least 8 characters'}, status=400)
    
    db: DatabaseService = request.app['db']
    
    if db.use_password_reset_token(token, new_password):
        logger.info("Password reset completed using token")
        return web.json_response({'message': 'Password has been reset successfully'})
    else:
        return web.json_response({'error': 'Invalid or expired reset token'}, status=400)


def setup_auth_routes(app: web.Application):
    """Setup authentication routes"""
    # Standard auth routes
    app.router.add_post('/api/auth/login', login)
    app.router.add_post('/api/auth/register', register)
    app.router.add_post('/api/auth/refresh', refresh)
    app.router.add_post('/api/auth/logout', logout)
    app.router.add_get('/api/auth/me', get_me)
    app.router.add_post('/api/auth/change-password', change_password)
    
    # Forgot password/username routes (public)
    app.router.add_post('/api/auth/forgot-username', forgot_username)
    app.router.add_post('/api/auth/request-password-reset', request_password_reset)
    app.router.add_post('/api/auth/reset-password', reset_password_with_token)
    
    # Admin user management routes
    app.router.add_get('/api/admin/users', admin_list_users)
    app.router.add_post('/api/admin/users/reset-password', admin_reset_user_password)
    app.router.add_post('/api/admin/users/role', admin_update_user_role)
    app.router.add_post('/api/admin/users/toggle-active', admin_toggle_user_active)
    
    logger.info("Auth routes configured")
