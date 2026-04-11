"""
G-code Recipe Model

Hierarchical recipe tree scoped to an organization (group).
Each node is either a category ('item') or a G-code file reference ('gcode').
Replaces browser-local localStorage persistence with server-side storage.
"""
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, String, DateTime, Integer, Index, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base


class GcodeRecipeModel(Base):
    """G-code recipe node — can be a product, category folder, or gcode file reference"""
    __tablename__ = 'gcode_recipes'

    id = Column(String(32), primary_key=True)
    group_id = Column(String(32), ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    parent_id = Column(String(32), ForeignKey('gcode_recipes.id', ondelete='CASCADE'), nullable=True)
    name = Column(String(255), nullable=False)
    node_type = Column(String(50), nullable=False, default='item')  # 'item' or 'gcode'
    file_id = Column(String(255), nullable=True)  # repository file ID for gcode nodes
    position = Column(Integer, nullable=False, default=0)
    created_by = Column(String(32), ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('idx_gcr_group_id', 'group_id'),
        Index('idx_gcr_parent_id', 'parent_id'),
    )


@dataclass
class GcodeRecipeData:
    """G-code recipe data transfer object"""
    id: str
    group_id: str
    name: str
    node_type: str
    position: int
    created_by: str
    created_at: str
    updated_at: str
    parent_id: Optional[str] = None
    file_id: Optional[str] = None
    children: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'groupId': self.group_id,
            'parentId': self.parent_id,
            'name': self.name,
            'nodeType': self.node_type,
            'fileId': self.file_id,
            'position': self.position,
            'children': self.children,
            'createdBy': self.created_by,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }

    @staticmethod
    def from_model(model: 'GcodeRecipeModel', children: Optional[List[Dict[str, Any]]] = None) -> 'GcodeRecipeData':
        return GcodeRecipeData(
            id=model.id,
            group_id=model.group_id,
            parent_id=model.parent_id,
            name=model.name,
            node_type=model.node_type or 'item',
            file_id=model.file_id,
            position=model.position or 0,
            created_by=model.created_by,
            created_at=model.created_at.isoformat() if model.created_at else '',
            updated_at=model.updated_at.isoformat() if model.updated_at else '',
            children=children or [],
        )
