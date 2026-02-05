"""
User and Authentication Models
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship

from models.base import Base


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

    @staticmethod
    def from_model(model: UserModel) -> 'User':
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
