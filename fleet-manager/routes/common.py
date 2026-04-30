"""
Common route utilities and middleware
"""
import logging
from functools import wraps

from aiohttp import web

from services.auth import JWTAuth

logger = logging.getLogger(__name__)


def require_auth(handler):
    """Decorator to require authentication for a route"""
    @wraps(handler)
    async def wrapper(request: web.Request):
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            return web.json_response(
                {'error': 'Missing or invalid authorization header'},
                status=401
            )
        
        token = auth_header[7:]  # Remove 'Bearer ' prefix
        jwt_auth: JWTAuth = request.app['jwt_auth']
        
        payload = jwt_auth.verify_access_token(token)
        if not payload:
            return web.json_response(
                {'error': 'Invalid or expired token'},
                status=401
            )
        
        db_service = request.app['db']
        username = payload.get("preferred_username") or payload.get("email")
        
        # Provision user if doesn't exist
        user = db_service.get_user_by_username(username)
        if not user:
            # We auto-provision
            user = db_service.create_user(username, "keycloak_managed", payload.get("email"))
            
        # Optional: You can attach the DB User object into the request, or just payload
        payload['role'] = user.role if user else "user"
        request['user'] = payload
        
        return await handler(request)
    
    return wrapper


def require_role(*roles):
    """Decorator to require specific roles"""
    def decorator(handler):
        @wraps(handler)
        @require_auth
        async def wrapper(request: web.Request):
            user_role = request['user'].get('role')
            if user_role not in roles:
                return web.json_response(
                    {'error': 'Insufficient permissions'},
                    status=403
                )
            return await handler(request)
        return wrapper
    return decorator
