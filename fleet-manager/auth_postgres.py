#!/usr/bin/env python3
"""
JWT Authentication Service for Fleet Manager with PostgreSQL
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple, List
from functools import wraps

import jwt
from aiohttp import web
from pydantic import ValidationError
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey, Integer, Text, Boolean, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, scoped_session
from sqlalchemy.exc import IntegrityError
from contextlib import contextmanager

# Import Pydantic models
from models import (
    LoginRequest, RegisterRequest, RefreshTokenRequest, ChangePasswordRequest,
    UserResponse, LoginResponse, TokenResponse, MessageResponse, ErrorResponse
)

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# PostgreSQL connection
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'fleet_manager')
DB_USER = os.environ.get('DB_USER', 'fleet_admin')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'fleet_password')

DATABASE_URL = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'

Base = declarative_base()


# SQLAlchemy Models
class UserModel(Base):
    """User model"""
    __tablename__ = 'users'
    
    id = Column(String(32), primary_key=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255))
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='user')
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    printers = relationship('PrinterModel', back_populates='owner')
    refresh_tokens = relationship('RefreshTokenModel', back_populates='user', cascade='all, delete-orphan')
    
    __table_args__ = (
        Index('idx_username', 'username'),
        Index('idx_created_at', 'created_at'),
    )


class PrinterModel(Base):
    """Printer model - printers owned by users"""
    __tablename__ = 'printers'
    
    id = Column(String(32), primary_key=True)
    owner_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    printer_id = Column(String(255), nullable=False, unique=True, index=True)  # Unique printer identifier
    name = Column(String(255), nullable=False)
    host = Column(String(255))
    port = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_connected = Column(DateTime)
    is_active = Column(Boolean, default=True)
    printer_metadata = Column(Text)  # JSON metadata
    
    # Relationships
    owner = relationship('UserModel', back_populates='printers')
    
    __table_args__ = (
        Index('idx_owner_id', 'owner_id'),
        Index('idx_printer_id', 'printer_id'),
    )


class RefreshTokenModel(Base):
    """Refresh token model"""
    __tablename__ = 'refresh_tokens'
    
    token = Column(String(255), primary_key=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship('UserModel', back_populates='refresh_tokens')
    
    __table_args__ = (
        Index('idx_user_id', 'user_id'),
        Index('idx_expires_at', 'expires_at'),
    )


@dataclass
class User:
    """User data class"""
    id: str
    username: str
    email: Optional[str]
    role: str
    password_hash: str
    created_at: str
    last_login: Optional[str] = None
    is_active: bool = True

    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'createdAt': self.created_at,
            'lastLogin': self.last_login,
            'isActive': self.is_active,
        }
        if include_sensitive:
            data['password_hash'] = self.password_hash
        return data


@dataclass
class Printer:
    """Printer data class"""
    id: str
    owner_id: str
    printer_id: str
    name: str
    host: Optional[str]
    port: Optional[int]
    created_at: str
    last_connected: Optional[str]
    is_active: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'ownerId': self.owner_id,
            'printerId': self.printer_id,
            'name': self.name,
            'host': self.host,
            'port': self.port,
            'createdAt': self.created_at,
            'lastConnected': self.last_connected,
            'isActive': self.is_active,
        }


class AuthDatabase:
    """PostgreSQL database for user authentication"""
    
    def __init__(self):
        self.engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        self.SessionLocal = scoped_session(sessionmaker(bind=self.engine))
        self._init_db()

    def _init_db(self):
        """Initialize database schema"""
        Base.metadata.create_all(self.engine)
        
        # Create default admin user if no users exist
        with self.get_session() as session:
            count = session.query(UserModel).count()
            if count == 0:
                self._create_default_admin(session)

    @contextmanager
    def get_session(self):
        """Get database session context manager"""
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _create_default_admin(self, session):
        """Create default admin user"""
        admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
        password_hash = self._hash_password(admin_password)
        
        admin_user = UserModel(
            id=secrets.token_hex(16),
            username='admin',
            email=None,
            password_hash=password_hash,
            role='admin',
            created_at=datetime.utcnow(),
            is_active=True
        )
        session.add(admin_user)
        session.commit()
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
        with self.get_session() as session:
            user_model = session.query(UserModel).filter_by(username=username).first()
            if user_model:
                return self._model_to_user(user_model)
        return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        with self.get_session() as session:
            user_model = session.query(UserModel).filter_by(id=user_id).first()
            if user_model:
                return self._model_to_user(user_model)
        return None

    def create_user(self, username: str, password: str, email: Optional[str] = None, role: str = 'user') -> User:
        """Create a new user"""
        with self.get_session() as session:
            user_id = secrets.token_hex(16)
            password_hash = self._hash_password(password)
            
            user_model = UserModel(
                id=user_id,
                username=username,
                email=email,
                password_hash=password_hash,
                role=role,
                created_at=datetime.utcnow(),
                is_active=True
            )
            session.add(user_model)
            session.commit()
            
            return self._model_to_user(user_model)

    def authenticate(self, username: str, password: str) -> Optional[User]:
        """Authenticate user with username and password"""
        user = self.get_user_by_username(username)
        if user and self._verify_password(password, user.password_hash) and user.is_active:
            # Update last login
            with self.get_session() as session:
                session.query(UserModel).filter_by(id=user.id).update(
                    {'last_login': datetime.utcnow()}
                )
                session.commit()
            return user
        return None

    def update_password(self, user_id: str, new_password: str) -> bool:
        """Update user password"""
        with self.get_session() as session:
            password_hash = self._hash_password(new_password)
            result = session.query(UserModel).filter_by(id=user_id).update(
                {'password_hash': password_hash}
            )
            session.commit()
            return result > 0

    def store_refresh_token(self, token: str, user_id: str, expires_at: datetime):
        """Store refresh token"""
        with self.get_session() as session:
            token_model = RefreshTokenModel(
                token=token,
                user_id=user_id,
                expires_at=expires_at,
                created_at=datetime.utcnow()
            )
            session.add(token_model)
            session.commit()

    def validate_refresh_token(self, token: str) -> Optional[str]:
        """Validate refresh token and return user_id if valid"""
        with self.get_session() as session:
            token_model = session.query(RefreshTokenModel).filter_by(token=token).first()
            if token_model and token_model.expires_at > datetime.utcnow():
                return token_model.user_id
        return None

    def revoke_refresh_token(self, token: str):
        """Revoke a refresh token"""
        with self.get_session() as session:
            session.query(RefreshTokenModel).filter_by(token=token).delete()
            session.commit()

    def revoke_all_user_tokens(self, user_id: str):
        """Revoke all refresh tokens for a user"""
        with self.get_session() as session:
            session.query(RefreshTokenModel).filter_by(user_id=user_id).delete()
            session.commit()

    # Printer methods
    def create_printer(self, owner_id: str, printer_id: str, name: str, 
                      host: Optional[str] = None, port: Optional[int] = None) -> Printer:
        """Create a printer for a user"""
        with self.get_session() as session:
            printer_model = PrinterModel(
                id=secrets.token_hex(16),
                owner_id=owner_id,
                printer_id=printer_id,
                name=name,
                host=host,
                port=port,
                created_at=datetime.utcnow(),
                is_active=True
            )
            session.add(printer_model)
            session.commit()
            return self._model_to_printer(printer_model)

    def get_user_printers(self, user_id: str) -> List[Printer]:
        """Get all printers owned by a user"""
        with self.get_session() as session:
            printers = session.query(PrinterModel).filter_by(
                owner_id=user_id,
                is_active=True
            ).all()
            return [self._model_to_printer(p) for p in printers]

    def get_printer_by_id(self, printer_id: str, user_id: str) -> Optional[Printer]:
        """Get a specific printer, checking ownership"""
        with self.get_session() as session:
            printer = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).first()
            if printer:
                return self._model_to_printer(printer)
        return None

    def update_printer_connection(self, printer_id: str, user_id: str):
        """Update printer last connected time"""
        with self.get_session() as session:
            session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).update({'last_connected': datetime.utcnow()})
            session.commit()

    def validate_printer_credential(self, printer_id: str) -> Optional[Printer]:
        """Validate a printer credential (used by printers connecting via WebSocket).
        Returns the Printer if the printer_id is valid and active, None otherwise.
        """
        with self.get_session() as session:
            printer = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                is_active=True
            ).first()
            if printer:
                # Update last_connected time
                printer.last_connected = datetime.utcnow()
                session.commit()
                return self._model_to_printer(printer)
        return None

    @staticmethod
    def _model_to_user(model: UserModel) -> User:
        """Convert UserModel to User"""
        return User(
            id=model.id,
            username=model.username,
            email=model.email,
            role=model.role,
            password_hash=model.password_hash,
            created_at=model.created_at.isoformat(),
            last_login=model.last_login.isoformat() if model.last_login else None,
            is_active=model.is_active
        )

    @staticmethod
    def _model_to_printer(model: PrinterModel) -> Printer:
        """Convert PrinterModel to Printer"""
        return Printer(
            id=model.id,
            owner_id=model.owner_id,
            printer_id=model.printer_id,
            name=model.name,
            host=model.host,
            port=model.port,
            created_at=model.created_at.isoformat(),
            last_connected=model.last_connected.isoformat() if model.last_connected else None,
            is_active=model.is_active
        )


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
    """Login endpoint with Pydantic validation"""
    try:
        data = await request.json()
        login_req = LoginRequest(**data)
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return web.json_response({'error': str(e.errors()[0]['msg'])}, status=400)
    
    db: AuthDatabase = request.app['auth_db']
    jwt_auth: JWTAuth = request.app['jwt_auth']
    
    user = db.authenticate(login_req.username, login_req.password)
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
    """Register endpoint with Pydantic validation"""
    try:
        data = await request.json()
        register_req = RegisterRequest(**data)
    except json.JSONDecodeError:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    except ValidationError as e:
        return web.json_response({'error': str(e.errors()[0]['msg'])}, status=400)
    
    db: AuthDatabase = request.app['auth_db']
    
    # Check if username exists
    if db.get_user_by_username(register_req.username):
        return web.json_response(
            {'error': 'Username already exists'},
            status=409
        )
    
    try:
        user = db.create_user(register_req.username, register_req.password, register_req.email)
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


@require_auth
async def get_user_printers(request: web.Request):
    """Get all printers for the logged-in user"""
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
    printers = db.get_user_printers(user_id)
    return web.json_response({
        'printers': [p.to_dict() for p in printers]
    })


def setup_auth_routes(app: web.Application):
    """Setup authentication routes"""
    # Initialize database and JWT auth
    db = AuthDatabase()
    jwt_auth = JWTAuth(db)
    
    app['auth_db'] = db
    app['jwt_auth'] = jwt_auth
    
    # Auth routes
    app.router.add_post('/api/auth/login', login)
    app.router.add_post('/api/auth/register', register)
    app.router.add_post('/api/auth/refresh', refresh)
    app.router.add_post('/api/auth/logout', logout)
    app.router.add_get('/api/auth/me', get_me)
    app.router.add_post('/api/auth/change-password', change_password)
    
    # Printer routes
    app.router.add_get('/api/printers', get_user_printers)
    
    logger.info("Auth routes configured")


if __name__ == '__main__':
    # Test the auth system
    db = AuthDatabase()
    jwt_auth = JWTAuth(db)
    
    # Test user creation and authentication
    user = db.authenticate('admin', 'admin123')
    if user:
        print(f"Authenticated: {user.username}")
        token = jwt_auth.create_access_token(user)
        print(f"Token: {token[:50]}...")
        
        payload = jwt_auth.verify_access_token(token)
        print(f"Payload: {payload}")
