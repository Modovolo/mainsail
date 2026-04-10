"""
PMI (Preventive Maintenance Inspection) and Downtime Models
"""
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Boolean, Index, Integer
from sqlalchemy.orm import relationship

from models.base import Base


class DowntimeRecordModel(Base):
    """Printer downtime record"""
    __tablename__ = 'downtime_records'

    id = Column(String(32), primary_key=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    group_id = Column(String(32), ForeignKey('groups.id'), nullable=False, index=True)
    printer = Column(String(255), nullable=False)
    start = Column(DateTime, nullable=False)
    end = Column(DateTime, nullable=True)
    reason = Column(String(255), nullable=False)
    description = Column(Text, default='')
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('UserModel')
    group = relationship('GroupModel')

    __table_args__ = (
        Index('idx_dt_user_id', 'user_id'),
        Index('idx_dt_group_id', 'group_id'),
        Index('idx_dt_start', 'start'),
    )


class PmiRecordModel(Base):
    """Preventive Maintenance Inspection record"""
    __tablename__ = 'pmi_records'

    id = Column(String(32), primary_key=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    group_id = Column(String(32), ForeignKey('groups.id'), nullable=False, index=True)
    printer = Column(String(255), nullable=False)
    inspector = Column(String(255), nullable=False)
    date = Column(DateTime, nullable=False)
    type = Column(String(100), nullable=False)
    additional_notes = Column(Text, default='')
    overall_status = Column(String(50), nullable=False)
    passed_count = Column(Integer, default=0)
    total_checks = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('UserModel')
    group = relationship('GroupModel')
    checklist_items = relationship(
        'PmiChecklistItemModel',
        back_populates='pmi_record',
        cascade='all, delete-orphan',
    )

    __table_args__ = (
        Index('idx_pmi_user_id', 'user_id'),
        Index('idx_pmi_group_id', 'group_id'),
        Index('idx_pmi_date', 'date'),
    )


class PmiChecklistItemModel(Base):
    """Individual checklist item within a PMI record"""
    __tablename__ = 'pmi_checklist_items'

    id = Column(String(32), primary_key=True)
    pmi_record_id = Column(String(32), ForeignKey('pmi_records.id', ondelete='CASCADE'), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    passed = Column(Boolean, default=False)
    notes = Column(Text, default='')

    pmi_record = relationship('PmiRecordModel', back_populates='checklist_items')

    __table_args__ = (
        Index('idx_pci_pmi_record_id', 'pmi_record_id'),
    )


# ── Dataclasses ──

@dataclass
class DowntimeRecord:
    id: str
    user_id: str
    group_id: str
    printer: str
    start: str
    end: Optional[str]
    reason: str
    description: str
    created_at: str
    username: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'userId': self.user_id,
            'groupId': self.group_id,
            'printer': self.printer,
            'start': self.start,
            'end': self.end,
            'reason': self.reason,
            'description': self.description,
            'createdAt': self.created_at,
            'username': self.username,
        }

    @staticmethod
    def from_model(model: DowntimeRecordModel, username: Optional[str] = None) -> 'DowntimeRecord':
        return DowntimeRecord(
            id=model.id,
            user_id=model.user_id,
            group_id=model.group_id,
            printer=model.printer,
            start=model.start.isoformat() if model.start else None,
            end=model.end.isoformat() if model.end else None,
            reason=model.reason,
            description=model.description or '',
            created_at=model.created_at.isoformat() if model.created_at else None,
            username=username,
        )


@dataclass
class PmiChecklistItem:
    label: str
    passed: bool
    notes: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            'label': self.label,
            'passed': self.passed,
            'notes': self.notes,
        }


@dataclass
class PmiRecord:
    id: str
    user_id: str
    group_id: str
    printer: str
    inspector: str
    date: str
    type: str
    additional_notes: str
    overall_status: str
    passed_count: int
    total_checks: int
    created_at: str
    checklist: List[PmiChecklistItem] = field(default_factory=list)
    username: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'userId': self.user_id,
            'groupId': self.group_id,
            'printer': self.printer,
            'inspector': self.inspector,
            'date': self.date,
            'type': self.type,
            'additionalNotes': self.additional_notes,
            'overallStatus': self.overall_status,
            'passedCount': self.passed_count,
            'totalChecks': self.total_checks,
            'createdAt': self.created_at,
            'checklist': [c.to_dict() for c in self.checklist],
            'username': self.username,
        }

    @staticmethod
    def from_model(model: PmiRecordModel, username: Optional[str] = None) -> 'PmiRecord':
        checklist = [
            PmiChecklistItem(label=ci.label, passed=ci.passed, notes=ci.notes or '')
            for ci in (model.checklist_items or [])
        ]
        return PmiRecord(
            id=model.id,
            user_id=model.user_id,
            group_id=model.group_id,
            printer=model.printer,
            inspector=model.inspector,
            date=model.date.isoformat() if model.date else None,
            type=model.type,
            additional_notes=model.additional_notes or '',
            overall_status=model.overall_status,
            passed_count=model.passed_count or 0,
            total_checks=model.total_checks or 0,
            created_at=model.created_at.isoformat() if model.created_at else None,
            checklist=checklist,
            username=username,
        )
