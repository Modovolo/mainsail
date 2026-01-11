#!/usr/bin/env python3
"""
JWT Authentication Service for Fleet Manager
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from functools import wraps

import jwt
from aiohttp import web

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7
DATABASE_PATH = os.environ.get('AUTH_DB_PATH', '/data/auth.db')


@dataclass
class User:
    id: str
    username: str
    email: Optional[str]
    role: str
    password_hash: str
    created_at: str
    last_login: Optional[str] = None

    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'createdAt': self.created_at,
            'lastLogin': self.last_login,
        }
        if include_sensitive:
            data['password_hash'] = self.password_hash
        return data


class AuthDatabase:
    """SQLite database for user authentication"""
    
    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialize database schema"""
        # Ensure directory exists and handle cases where dirname might be empty
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TEXT NOT NULL,
                last_login TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Create default admin user if no users exist
        cursor.execute('SELECT COUNT(*) FROM users')
        if cursor.fetchone()[0] == 0:
            self._create_default_admin(cursor)
        
        conn.commit()
        conn.close()

    def _create_default_admin(self, cursor):
        """Create default admin user"""
        admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
        password_hash = self._hash_password(admin_password)
        
        cursor.execute('''
            INSERT INTO users (id, username, email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            secrets.token_hex(16),
            'admin',
            None,
            password_hash,
            'admin',
            datetime.utcnow().isoformat()
        ))
        logger.info("Created default admin user (username: admin)")

    @staticmethod
    def _hash_password(password: str) -> str:
        """Hash password using PBKDF2"""
        salt = secrets.token_hex(16)
        hash_obj = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return f"{salt}${hash_obj.hex()}"

    @staticmethod
    def _verify_password(password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        try:
            salt, stored_hash = password_hash.split('$')
            hash_obj = hashlib.pbkdf2_hmac(
                'sha256',
                password.encode('utf-8'),
                salt.encode('utf-8'),
                100000
            )
            return hmac.compare_digest(hash_obj.hex(), stored_hash)
        except Exception:
            return False

    def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return User(**dict(row))
        return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return User(**dict(row))
        return None

    def create_user(self, username: str, password: str, email: Optional[str] = None, role: str = 'user') -> User:
        """Create a new user"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        user_id = secrets.token_hex(16)
        password_hash = self._hash_password(password)
        created_at = datetime.utcnow().isoformat()
        
        cursor.execute('''
            INSERT INTO users (id, username, email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_id, username, email, password_hash, role, created_at))
        
        conn.commit()
        conn.close()
        
        return User(
            id=user_id,
            username=username,
            email=email,
            role=role,
            password_hash=password_hash,
            created_at=created_at
        )

    def authenticate(self, username: str, password: str) -> Optional[User]:
        """Authenticate user with username and password"""
        user = self.get_user_by_username(username)
        if user and self._verify_password(password, user.password_hash):
            # Update last login
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE users SET last_login = ? WHERE id = ?',
                (datetime.utcnow().isoformat(), user.id)
            )
            conn.commit()
            conn.close()
            return user
        return None

    def update_password(self, user_id: str, new_password: str) -> bool:
        """Update user password"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        password_hash = self._hash_password(new_password)
        cursor.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            (password_hash, user_id)
        )
        
        conn.commit()
        success = cursor.rowcount > 0
        conn.close()
        return success

    def store_refresh_token(self, token: str, user_id: str, expires_at: datetime):
        """Store refresh token"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO refresh_tokens (token, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
        ''', (token, user_id, expires_at.isoformat(), datetime.utcnow().isoformat()))
        
        conn.commit()
        conn.close()

    def validate_refresh_token(self, token: str) -> Optional[str]:
        """Validate refresh token and return user_id if valid"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?
        ''', (token,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            expires_at = datetime.fromisoformat(row['expires_at'])
            if expires_at > datetime.utcnow():
                return row['user_id']
        return None

    def revoke_refresh_token(self, token: str):
        """Revoke a refresh token"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM refresh_tokens WHERE token = ?', (token,))
        conn.commit()
        conn.close()

    def revoke_all_user_tokens(self, user_id: str):
        """Revoke all refresh tokens for a user"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM refresh_tokens WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()


class JWTAuth:
    """JWT Token management"""
    
    def __init__(self, db: AuthDatabase):
        self.db = db

    def create_access_token(self, user: User) -> str:
        """Create JWT access token"""
        expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            'sub': user.id,
            'username': user.username,
            'role': user.role,
            'exp': expires,
            'iat': datetime.utcnow(),
            'type': 'access'
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def create_refresh_token(self, user: User) -> str:
        """Create refresh token"""
        expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        token = secrets.token_urlsafe(64)
        self.db.store_refresh_token(token, user.id, expires)
        return token

    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode access token"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get('type') != 'access':
                return None
            return payload
        except jwt.ExpiredSignatureError:
            logger.debug("Access token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.debug(f"Invalid token: {e}")
            return None

    def refresh_access_token(self, refresh_token: str) -> Optional[Tuple[str, User]]:
        """Refresh access token using refresh token"""
        user_id = self.db.validate_refresh_token(refresh_token)
        if not user_id:
            return None
        
        user = self.db.get_user_by_id(user_id)
        if not user:
            return None
        
        new_access_token = self.create_access_token(user)
        return new_access_token, user


# Middleware for authentication
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


# API Routes
async def login(request: web.Request):
    """Login endpoint"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return web.json_response(
            {'error': 'Username and password required'},
            status=400
        )
    
    db: AuthDatabase = request.app['auth_db']
    jwt_auth: JWTAuth = request.app['jwt_auth']
    
    user = db.authenticate(username, password)
    if not user:
        return web.json_response(
            {'error': 'Invalid credentials'},
            status=401
        )
    
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
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    
    if not username or not password:
        return web.json_response(
            {'error': 'Username and password required'},
            status=400
        )
    
    if len(username) < 3:
        return web.json_response(
            {'error': 'Username must be at least 3 characters'},
            status=400
        )
    
    if len(password) < 8:
        return web.json_response(
            {'error': 'Password must be at least 8 characters'},
            status=400
        )
    
    db: AuthDatabase = request.app['auth_db']
    
    # Check if username exists
    if db.get_user_by_username(username):
        return web.json_response(
            {'error': 'Username already exists'},
            status=409
        )
    
    try:
        user = db.create_user(username, password, email)
        return web.json_response({
            'message': 'User created successfully',
            'user': user.to_dict()
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        return web.json_response(
            {'error': 'Failed to create user'},
            status=500
        )


async def refresh(request: web.Request):
    """Refresh token endpoint"""
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    refresh_token = data.get('refreshToken')
    if not refresh_token:
        return web.json_response(
            {'error': 'Refresh token required'},
            status=400
        )
    
    jwt_auth: JWTAuth = request.app['jwt_auth']
    
    result = jwt_auth.refresh_access_token(refresh_token)
    if not result:
        return web.json_response(
            {'error': 'Invalid or expired refresh token'},
            status=401
        )
    
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
            db: AuthDatabase = request.app['auth_db']
            db.revoke_refresh_token(refresh_token)
    except:
        pass
    
    return web.json_response({'message': 'Logged out successfully'})


@require_auth
async def get_me(request: web.Request):
    """Get current user info"""
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
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
        return web.json_response(
            {'error': 'Current and new password required'},
            status=400
        )
    
    if len(new_password) < 8:
        return web.json_response(
            {'error': 'New password must be at least 8 characters'},
            status=400
        )
    
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    # Verify current password
    if not db._verify_password(current_password, user.password_hash):
        return web.json_response(
            {'error': 'Current password is incorrect'},
            status=401
        )
    
    # Update password
    db.update_password(user_id, new_password)
    
    # Revoke all refresh tokens for security
    db.revoke_all_user_tokens(user_id)
    
    return web.json_response({'message': 'Password changed successfully'})


def setup_auth_routes(app: web.Application):
    """Setup authentication routes"""
    # Initialize database and JWT auth
    db = AuthDatabase()
    jwt_auth = JWTAuth(db)
    
    app['auth_db'] = db
    app['jwt_auth'] = jwt_auth
    
    # Add routes
    app.router.add_post('/api/auth/login', login)
    app.router.add_post('/api/auth/register', register)
    app.router.add_post('/api/auth/refresh', refresh)
    app.router.add_post('/api/auth/logout', logout)
    app.router.add_get('/api/auth/me', get_me)
    app.router.add_post('/api/auth/change-password', change_password)
    
    logger.info("Auth routes configured")


if __name__ == '__main__':
    # Test the auth system
    db = AuthDatabase('/tmp/test_auth.db')
    jwt_auth = JWTAuth(db)
    
    # Test user creation and authentication
    user = db.authenticate('admin', 'admin123')
    if user:
        print(f"Authenticated: {user.username}")
        token = jwt_auth.create_access_token(user)
        print(f"Token: {token[:50]}...")
        
        payload = jwt_auth.verify_access_token(token)
        print(f"Payload: {payload}")
