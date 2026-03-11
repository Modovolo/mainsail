"""
Config Template Model for Printer Configuration Sync
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship

from models.base import Base


class ConfigTemplateModel(Base):
    """Config template model for storing printer configurations"""
    __tablename__ = 'config_templates'
    
    id = Column(String(32), primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False)  # SHA-256 hash of content
    version = Column(String(50), nullable=False, default='1.0')
    description = Column(Text, nullable=True)
    created_by = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    creator = relationship('UserModel')
    
    __table_args__ = (
        Index('idx_ct_name', 'name'),
        Index('idx_ct_filename', 'filename'),
        Index('idx_ct_created_by', 'created_by'),
    )


class ConfigTemplateSourceBindingModel(Base):
    """Stores canonical runtime source mapping for a template"""
    __tablename__ = 'config_template_source_bindings'

    id = Column(String(32), primary_key=True)
    template_id = Column(String(32), ForeignKey('config_templates.id'), nullable=False, unique=True, index=True)
    source_path = Column(String(512), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    template = relationship('ConfigTemplateModel')

    __table_args__ = (
        Index('idx_ctsb_template_id', 'template_id', unique=True),
        Index('idx_ctsb_source_path', 'source_path'),
    )


@dataclass
class ConfigTemplate:
    """Config template data class"""
    id: str
    name: str
    filename: str
    content: str
    content_hash: str
    version: str
    created_by: str
    created_at: str
    updated_at: str
    description: Optional[str] = None
    created_by_username: Optional[str] = None
    source_path: Optional[str] = None

    def to_dict(self, include_content: bool = False) -> Dict[str, Any]:
        """Convert to dictionary for API response"""
        result = {
            'id': self.id,
            'name': self.name,
            'filename': self.filename,
            'sourcePath': self.source_path,
            'contentHash': self.content_hash,
            'version': self.version,
            'description': self.description,
            'createdBy': self.created_by,
            'createdByUsername': self.created_by_username,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }
        if include_content:
            result['content'] = self.content
        return result

    @staticmethod
    def from_model(
        model: ConfigTemplateModel,
        include_username: bool = False,
        source_path: Optional[str] = None,
    ) -> 'ConfigTemplate':
        """Create ConfigTemplate from database model"""
        return ConfigTemplate(
            id=model.id,
            name=model.name,
            filename=model.filename,
            content=model.content,
            content_hash=model.content_hash,
            version=model.version,
            description=model.description,
            created_by=model.created_by,
            created_by_username=model.creator.username if include_username and model.creator else None,
            source_path=source_path,
            created_at=model.created_at.isoformat() if model.created_at else None,
            updated_at=model.updated_at.isoformat() if model.updated_at else None,
        )


class PrinterConfigStatusModel(Base):
    """Track which config versions each printer has"""
    __tablename__ = 'printer_config_status'
    
    id = Column(String(32), primary_key=True)
    printer_id = Column(String(32), ForeignKey('printers.printer_id'), nullable=False, index=True)
    template_id = Column(String(32), ForeignKey('config_templates.id'), nullable=False, index=True)
    synced_version = Column(String(50), nullable=False)
    synced_hash = Column(String(64), nullable=False)
    synced_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    printer = relationship('PrinterModel')
    template = relationship('ConfigTemplateModel')
    
    __table_args__ = (
        Index('idx_pcs_printer_id', 'printer_id'),
        Index('idx_pcs_template_id', 'template_id'),
        Index('idx_pcs_printer_template', 'printer_id', 'template_id', unique=True),
    )


@dataclass
class PrinterConfigStatus:
    """Printer config status data class"""
    id: str
    printer_id: str
    template_id: str
    synced_version: str
    synced_hash: str
    synced_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'printerId': self.printer_id,
            'templateId': self.template_id,
            'syncedVersion': self.synced_version,
            'syncedHash': self.synced_hash,
            'syncedAt': self.synced_at,
        }

    @staticmethod
    def from_model(model: PrinterConfigStatusModel) -> 'PrinterConfigStatus':
        return PrinterConfigStatus(
            id=model.id,
            printer_id=model.printer_id,
            template_id=model.template_id,
            synced_version=model.synced_version,
            synced_hash=model.synced_hash,
            synced_at=model.synced_at.isoformat() if model.synced_at else None,
        )
