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
from routes.common import require_auth

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


def setup_auth_routes(app: web.Application):
    """Setup authentication routes"""
    app.router.add_post('/api/auth/login', login)
    app.router.add_post('/api/auth/register', register)
    app.router.add_post('/api/auth/refresh', refresh)
    app.router.add_post('/api/auth/logout', logout)
    app.router.add_get('/api/auth/me', get_me)
    app.router.add_post('/api/auth/change-password', change_password)
    
    logger.info("Auth routes configured")
