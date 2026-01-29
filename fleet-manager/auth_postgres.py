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


class GroupModel(Base):
    """Group model - groups that can own printers and have members"""
    __tablename__ = 'groups'
    
    id = Column(String(32), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    created_by = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    creator = relationship('UserModel', foreign_keys=[created_by])
    members = relationship('GroupMemberModel', back_populates='group', cascade='all, delete-orphan')
    printers = relationship('PrinterModel', back_populates='group')
    
    __table_args__ = (
        Index('idx_group_created_by', 'created_by'),
        Index('idx_group_name', 'name'),
    )


class GroupMemberModel(Base):
    """Group member model - users belonging to groups"""
    __tablename__ = 'group_members'
    
    id = Column(String(32), primary_key=True)
    group_id = Column(String(32), ForeignKey('groups.id'), nullable=False, index=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    role = Column(String(50), default='member')  # 'owner', 'admin', 'member'
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    group = relationship('GroupModel', back_populates='members')
    user = relationship('UserModel')
    
    __table_args__ = (
        Index('idx_gm_group_id', 'group_id'),
        Index('idx_gm_user_id', 'user_id'),
    )


class PrinterModel(Base):
    """Printer model - printers owned by users or groups"""
    __tablename__ = 'printers'
    
    id = Column(String(32), primary_key=True)
    owner_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    group_id = Column(String(32), ForeignKey('groups.id'), nullable=True, index=True)  # Optional group ownership
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
    group = relationship('GroupModel', back_populates='printers')
    
    __table_args__ = (
        Index('idx_owner_id', 'owner_id'),
        Index('idx_printer_id', 'printer_id'),
        Index('idx_group_id', 'group_id'),
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
    group_id: Optional[str] = None

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
            'groupId': self.group_id,
        }


@dataclass
class Group:
    """Group data class"""
    id: str
    name: str
    description: Optional[str]
    created_by: str
    created_at: str
    is_active: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'createdBy': self.created_by,
            'createdAt': self.created_at,
            'isActive': self.is_active,
        }


@dataclass
class GroupMember:
    """Group member data class"""
    id: str
    group_id: str
    user_id: str
    role: str
    joined_at: str
    username: Optional[str] = None  # For display purposes

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'groupId': self.group_id,
            'userId': self.user_id,
            'role': self.role,
            'joinedAt': self.joined_at,
            'username': self.username,
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
            is_active=model.is_active,
            group_id=model.group_id
        )

    @staticmethod
    def _model_to_group(model: GroupModel) -> Group:
        """Convert GroupModel to Group"""
        return Group(
            id=model.id,
            name=model.name,
            description=model.description,
            created_by=model.created_by,
            created_at=model.created_at.isoformat(),
            is_active=model.is_active
        )

    @staticmethod
    def _model_to_group_member(model: GroupMemberModel, username: Optional[str] = None) -> GroupMember:
        """Convert GroupMemberModel to GroupMember"""
        return GroupMember(
            id=model.id,
            group_id=model.group_id,
            user_id=model.user_id,
            role=model.role,
            joined_at=model.joined_at.isoformat(),
            username=username
        )

    # ==================== Group Methods ====================

    def create_group(self, name: str, created_by: str, description: Optional[str] = None) -> Group:
        """Create a new group and add creator as owner"""
        with self.get_session() as session:
            group_id = secrets.token_hex(16)
            group_model = GroupModel(
                id=group_id,
                name=name,
                description=description,
                created_by=created_by,
                created_at=datetime.utcnow(),
                is_active=True
            )
            session.add(group_model)
            
            # Add creator as owner
            member_model = GroupMemberModel(
                id=secrets.token_hex(16),
                group_id=group_id,
                user_id=created_by,
                role='owner',
                joined_at=datetime.utcnow()
            )
            session.add(member_model)
            session.commit()
            
            return self._model_to_group(group_model)

    def get_user_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all groups a user belongs to with their role"""
        with self.get_session() as session:
            memberships = session.query(GroupMemberModel, GroupModel).join(
                GroupModel, GroupMemberModel.group_id == GroupModel.id
            ).filter(
                GroupMemberModel.user_id == user_id,
                GroupModel.is_active == True
            ).all()
            
            result = []
            for member, group in memberships:
                group_dict = self._model_to_group(group).to_dict()
                group_dict['memberRole'] = member.role
                group_dict['joinedAt'] = member.joined_at.isoformat()
                result.append(group_dict)
            return result

    def get_group_by_id(self, group_id: str) -> Optional[Group]:
        """Get a group by ID"""
        with self.get_session() as session:
            group = session.query(GroupModel).filter_by(id=group_id, is_active=True).first()
            if group:
                return self._model_to_group(group)
        return None

    def get_group_members(self, group_id: str) -> List[GroupMember]:
        """Get all members of a group with their usernames"""
        with self.get_session() as session:
            members = session.query(GroupMemberModel, UserModel).join(
                UserModel, GroupMemberModel.user_id == UserModel.id
            ).filter(
                GroupMemberModel.group_id == group_id
            ).all()
            
            return [self._model_to_group_member(m, u.username) for m, u in members]

    def get_user_group_role(self, user_id: str, group_id: str) -> Optional[str]:
        """Get a user's role in a group (or None if not a member)"""
        with self.get_session() as session:
            member = session.query(GroupMemberModel).filter_by(
                user_id=user_id,
                group_id=group_id
            ).first()
            return member.role if member else None

    def add_group_member(self, group_id: str, user_id: str, role: str = 'member') -> Optional[GroupMember]:
        """Add a user to a group"""
        with self.get_session() as session:
            # Check if already a member
            existing = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id
            ).first()
            if existing:
                return None  # Already a member
            
            member_model = GroupMemberModel(
                id=secrets.token_hex(16),
                group_id=group_id,
                user_id=user_id,
                role=role,
                joined_at=datetime.utcnow()
            )
            session.add(member_model)
            session.commit()
            
            # Get username for response
            user = session.query(UserModel).filter_by(id=user_id).first()
            return self._model_to_group_member(member_model, user.username if user else None)

    def remove_group_member(self, group_id: str, user_id: str) -> bool:
        """Remove a user from a group"""
        with self.get_session() as session:
            deleted = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id
            ).delete()
            session.commit()
            return deleted > 0

    def update_member_role(self, group_id: str, user_id: str, new_role: str) -> bool:
        """Update a member's role in a group"""
        with self.get_session() as session:
            updated = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id
            ).update({'role': new_role})
            session.commit()
            return updated > 0

    def assign_printer_to_group(self, printer_id: str, group_id: str, user_id: str) -> bool:
        """Assign a printer to a group (user must own the printer)"""
        with self.get_session() as session:
            updated = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).update({'group_id': group_id})
            session.commit()
            return updated > 0

    def remove_printer_from_group(self, printer_id: str, user_id: str) -> bool:
        """Remove a printer from its group (user must own the printer)"""
        with self.get_session() as session:
            updated = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).update({'group_id': None})
            session.commit()
            return updated > 0

    def get_group_printers(self, group_id: str) -> List[Printer]:
        """Get all printers assigned to a group"""
        with self.get_session() as session:
            printers = session.query(PrinterModel).filter_by(
                group_id=group_id,
                is_active=True
            ).all()
            return [self._model_to_printer(p) for p in printers]

    def get_user_accessible_printers(self, user_id: str) -> List[Printer]:
        """Get all printers a user can access (owned + group printers)"""
        with self.get_session() as session:
            # Get user's own printers
            own_printers = session.query(PrinterModel).filter_by(
                owner_id=user_id,
                is_active=True
            ).all()
            
            # Get printers from groups user belongs to
            group_ids = session.query(GroupMemberModel.group_id).filter_by(
                user_id=user_id
            ).subquery()
            
            group_printers = session.query(PrinterModel).filter(
                PrinterModel.group_id.in_(group_ids),
                PrinterModel.is_active == True
            ).all()
            
            # Combine and deduplicate (in case user owns a printer that's also in their group)
            seen_ids = set()
            result = []
            for p in own_printers + group_printers:
                if p.printer_id not in seen_ids:
                    seen_ids.add(p.printer_id)
                    result.append(self._model_to_printer(p))
            
            return result

    def delete_group(self, group_id: str, user_id: str) -> bool:
        """Delete a group (soft delete, user must be owner)"""
        with self.get_session() as session:
            # Check if user is owner
            member = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id,
                role='owner'
            ).first()
            if not member:
                return False
            
            # Remove printers from group
            session.query(PrinterModel).filter_by(group_id=group_id).update({'group_id': None})
            
            # Soft delete group
            session.query(GroupModel).filter_by(id=group_id).update({'is_active': False})
            session.commit()
            return True

    def update_group(self, group_id: str, user_id: str, name: Optional[str] = None, description: Optional[str] = None) -> bool:
        """Update group details (user must be owner or admin)"""
        with self.get_session() as session:
            # Check if user has permission
            member = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id
            ).first()
            if not member or member.role not in ['owner', 'admin']:
                return False
            
            updates = {}
            if name is not None:
                updates['name'] = name
            if description is not None:
                updates['description'] = description
            
            if updates:
                session.query(GroupModel).filter_by(id=group_id).update(updates)
                session.commit()
            return True

    def get_user_by_username_or_email(self, identifier: str) -> Optional[User]:
        """Get user by username or email (for inviting to groups)"""
        with self.get_session() as session:
            user = session.query(UserModel).filter(
                (UserModel.username == identifier) | (UserModel.email == identifier)
            ).first()
            if user:
                return self._model_to_user(user)
        return None


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


# ==================== Group API Endpoints ====================

@require_auth
async def create_group(request: web.Request):
    """Create a new group"""
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
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
    db: AuthDatabase = request.app['auth_db']
    
    groups = db.get_user_groups(user_id)
    return web.json_response({'groups': groups})


@require_auth
async def get_group(request: web.Request):
    """Get group details including members and printers"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: AuthDatabase = request.app['auth_db']
    
    # Check if user is a member
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
    db: AuthDatabase = request.app['auth_db']
    
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
    db: AuthDatabase = request.app['auth_db']
    
    if not db.delete_group(group_id, user_id):
        return web.json_response({'error': 'Not authorized to delete this group'}, status=403)
    
    return web.json_response({'message': 'Group deleted successfully'})


@require_auth
async def add_group_member(request: web.Request):
    """Add a member to a group (owner/admin only)"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: AuthDatabase = request.app['auth_db']
    
    # Check if user has permission
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
        
        # Find the user
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
    db: AuthDatabase = request.app['auth_db']
    
    # Check if user has permission (owner/admin can remove others, anyone can remove themselves)
    role = db.get_user_group_role(user_id, group_id)
    if user_id != member_user_id and role not in ['owner', 'admin']:
        return web.json_response({'error': 'Not authorized to remove members'}, status=403)
    
    # Don't allow removing the owner
    target_role = db.get_user_group_role(member_user_id, group_id)
    if target_role == 'owner' and user_id != member_user_id:
        return web.json_response({'error': 'Cannot remove the group owner'}, status=400)
    
    if not db.remove_group_member(group_id, member_user_id):
        return web.json_response({'error': 'Member not found'}, status=404)
    
    return web.json_response({'message': 'Member removed successfully'})


@require_auth
async def update_member_role(request: web.Request):
    """Update a member's role (owner only)"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    member_user_id = request.match_info['user_id']
    db: AuthDatabase = request.app['auth_db']
    
    # Only owner can change roles
    role = db.get_user_group_role(user_id, group_id)
    if role != 'owner':
        return web.json_response({'error': 'Only the group owner can change roles'}, status=403)
    
    try:
        data = await request.json()
        new_role = data.get('role')
        
        if new_role not in ['admin', 'member']:
            return web.json_response({'error': 'Invalid role. Must be admin or member'}, status=400)
        
        # Can't change own role as owner
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
    """Assign a printer to a group (printer owner only)"""
    user_id = request['user']['sub']
    group_id = request.match_info['group_id']
    db: AuthDatabase = request.app['auth_db']
    
    # Check if user is a member of the group
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


@require_auth
async def remove_printer_from_group(request: web.Request):
    """Remove a printer from a group (printer owner only)"""
    user_id = request['user']['sub']
    printer_id = request.match_info['printer_id']
    db: AuthDatabase = request.app['auth_db']
    
    if not db.remove_printer_from_group(printer_id, user_id):
        return web.json_response({'error': 'Printer not found or you are not the owner'}, status=404)
    
    return web.json_response({'message': 'Printer removed from group successfully'})


@require_auth
async def get_accessible_printers(request: web.Request):
    """Get all printers the user can access (owned + group printers)"""
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
    printers = db.get_user_accessible_printers(user_id)
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
    app.router.add_get('/api/printers/accessible', get_accessible_printers)
    app.router.add_delete('/api/printers/{printer_id}/group', remove_printer_from_group)
    
    # Group routes
    app.router.add_post('/api/groups', create_group)
    app.router.add_get('/api/groups', list_user_groups)
    app.router.add_get('/api/groups/{group_id}', get_group)
    app.router.add_put('/api/groups/{group_id}', update_group)
    app.router.add_delete('/api/groups/{group_id}', delete_group)
    app.router.add_post('/api/groups/{group_id}/members', add_group_member)
    app.router.add_delete('/api/groups/{group_id}/members/{user_id}', remove_group_member)
    app.router.add_put('/api/groups/{group_id}/members/{user_id}', update_member_role)
    app.router.add_post('/api/groups/{group_id}/printers', assign_printer_to_group)
    
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
