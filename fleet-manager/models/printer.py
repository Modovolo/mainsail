"""
Printer Model
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text, Boolean, Index
from sqlalchemy.orm import relationship

from models.base import Base


class PrinterModel(Base):
    """Printer model - printers owned by users or groups"""
    __tablename__ = 'printers'
    
    id = Column(String(32), primary_key=True)
    owner_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    group_id = Column(String(32), ForeignKey('groups.id'), nullable=True, index=True)
    printer_id = Column(String(255), nullable=False, unique=True, index=True)
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
            'id': self.printer_id,  # Use printer_id as id for frontend WebSocket connections
            'internalId': self.id,  # Keep internal DB id available if needed
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

    @staticmethod
    def from_model(model: PrinterModel) -> 'Printer':
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
