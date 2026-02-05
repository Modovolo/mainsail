"""
Group and Group Member Models
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship

from models.base import Base


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

    @staticmethod
    def from_model(model: GroupModel) -> 'Group':
        """Convert GroupModel to Group"""
        return Group(
            id=model.id,
            name=model.name,
            description=model.description,
            created_by=model.created_by,
            created_at=model.created_at.isoformat(),
            is_active=model.is_active
        )


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

    @staticmethod
    def from_model(model: GroupMemberModel, username: Optional[str] = None) -> 'GroupMember':
        """Convert GroupMemberModel to GroupMember"""
        return GroupMember(
            id=model.id,
            group_id=model.group_id,
            user_id=model.user_id,
            role=model.role,
            joined_at=model.joined_at.isoformat(),
            username=username
        )
