"""
Print Queue Job Model
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Index
from sqlalchemy.orm import relationship

from models.base import Base


class PrintQueueJobModel(Base):
    """Print queue job model"""
    __tablename__ = 'print_queue_jobs'
    
    id = Column(String(32), primary_key=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    file_id = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    position = Column(Integer, nullable=False, index=True)
    priority = Column(String(50), default='Normal')
    status = Column(String(50), default='queued', index=True)  # queued, printing, completed, cancelled
    printer_id = Column(String(32), nullable=True, index=True)
    printer_name = Column(String(255), nullable=True)
    progress = Column(Integer, default=0)
    time_remaining = Column(String(50), nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship('UserModel')
    
    __table_args__ = (
        Index('idx_pqj_user_id', 'user_id'),
        Index('idx_pqj_status', 'status'),
        Index('idx_pqj_position', 'position'),
    )


@dataclass
class PrintQueueJob:
    """Print queue job data class"""
    id: str
    user_id: str
    file_id: str
    file_name: str
    position: int
    priority: str
    status: str
    added_at: str
    printer_id: Optional[str] = None
    printer_name: Optional[str] = None
    progress: int = 0
    time_remaining: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'userId': self.user_id,
            'fileId': self.file_id,
            'fileName': self.file_name,
            'position': self.position,
            'priority': self.priority,
            'status': self.status,
            'printerId': self.printer_id,
            'printerName': self.printer_name,
            'progress': self.progress,
            'timeRemaining': self.time_remaining,
            'addedAt': self.added_at,
            'startedAt': self.started_at,
            'completedAt': self.completed_at,
        }

    @staticmethod
    def from_model(model: PrintQueueJobModel) -> 'PrintQueueJob':
        """Convert PrintQueueJobModel to PrintQueueJob"""
        return PrintQueueJob(
            id=model.id,
            user_id=model.user_id,
            file_id=model.file_id,
            file_name=model.file_name,
            position=model.position,
            priority=model.priority,
            status=model.status,
            printer_id=model.printer_id,
            printer_name=model.printer_name,
            progress=model.progress or 0,
            time_remaining=model.time_remaining,
            added_at=model.added_at.isoformat() if model.added_at else None,
            started_at=model.started_at.isoformat() if model.started_at else None,
            completed_at=model.completed_at.isoformat() if model.completed_at else None,
        )
