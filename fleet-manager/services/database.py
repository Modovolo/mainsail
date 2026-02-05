"""
Database Service for Fleet Manager
Handles all database operations
"""
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

from models.base import Base, get_engine, get_session_factory
from models.user import UserModel, RefreshTokenModel, User
from models.printer import PrinterModel, Printer
from models.group import GroupModel, GroupMemberModel, Group, GroupMember
from models.print_queue import PrintQueueJobModel, PrintQueueJob

logger = logging.getLogger(__name__)


class DatabaseService:
    """PostgreSQL database service for fleet manager"""
    
    def __init__(self):
        self.engine = get_engine()
        self.SessionLocal = get_session_factory(self.engine)
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

    # ==================== User Methods ====================

    def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username"""
        with self.get_session() as session:
            user_model = session.query(UserModel).filter_by(username=username).first()
            if user_model:
                return User.from_model(user_model)
        return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        with self.get_session() as session:
            user_model = session.query(UserModel).filter_by(id=user_id).first()
            if user_model:
                return User.from_model(user_model)
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
            
            return User.from_model(user_model)

    def authenticate(self, username: str, password: str) -> Optional[User]:
        """Authenticate user with username and password"""
        user = self.get_user_by_username(username)
        if user and self._verify_password(password, user.password_hash) and user.is_active:
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

    def get_user_by_username_or_email(self, identifier: str) -> Optional[User]:
        """Get user by username or email"""
        with self.get_session() as session:
            from sqlalchemy import func
            user = session.query(UserModel).filter(
                (func.lower(UserModel.username) == identifier.lower()) | 
                (func.lower(UserModel.email) == identifier.lower())
            ).first()
            if user:
                return User.from_model(user)
        return None

    # ==================== Token Methods ====================

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

    # ==================== Printer Methods ====================

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
            return Printer.from_model(printer_model)

    def get_user_printers(self, user_id: str) -> List[Printer]:
        """Get all printers owned by a user"""
        with self.get_session() as session:
            printers = session.query(PrinterModel).filter_by(
                owner_id=user_id,
                is_active=True
            ).all()
            return [Printer.from_model(p) for p in printers]

    def get_printer_by_id(self, printer_id: str, user_id: str) -> Optional[Printer]:
        """Get a specific printer, checking ownership"""
        with self.get_session() as session:
            printer = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).first()
            if printer:
                return Printer.from_model(printer)
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
        """Validate a printer credential"""
        with self.get_session() as session:
            printer = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                is_active=True
            ).first()
            if printer:
                printer.last_connected = datetime.utcnow()
                session.commit()
                return Printer.from_model(printer)
        return None

    def update_printer_host(self, printer_id: str, host: str) -> bool:
        """Update the host/IP address of a printer"""
        with self.get_session() as session:
            updated = session.query(PrinterModel).filter_by(
                printer_id=printer_id
            ).update({'host': host})
            session.commit()
            return updated > 0

    def get_user_accessible_printers(self, user_id: str) -> List[Printer]:
        """Get all printers a user can access (owned + group printers)"""
        with self.get_session() as session:
            own_printers = session.query(PrinterModel).filter_by(
                owner_id=user_id,
                is_active=True
            ).all()
            
            group_ids = session.query(GroupMemberModel.group_id).filter_by(
                user_id=user_id
            ).subquery()
            
            group_printers = session.query(PrinterModel).filter(
                PrinterModel.group_id.in_(group_ids),
                PrinterModel.is_active == True
            ).all()
            
            seen_ids = set()
            result = []
            for p in own_printers + group_printers:
                if p.printer_id not in seen_ids:
                    seen_ids.add(p.printer_id)
                    result.append(Printer.from_model(p))
            
            return result

    def get_accessible_printer_by_id(self, printer_id: str, user_id: str) -> Optional[Printer]:
        """Get a printer by ID if the user has access (owner or group member)"""
        with self.get_session() as session:
            # First check if user owns the printer
            printer = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id,
                is_active=True
            ).first()
            
            if printer:
                return Printer.from_model(printer)
            
            # Check if user has access via group membership
            group_ids = session.query(GroupMemberModel.group_id).filter_by(
                user_id=user_id
            ).subquery()
            
            printer = session.query(PrinterModel).filter(
                PrinterModel.printer_id == printer_id,
                PrinterModel.group_id.in_(group_ids),
                PrinterModel.is_active == True
            ).first()
            
            if printer:
                return Printer.from_model(printer)
            
            return None

    def assign_printer_to_group(self, printer_id: str, group_id: str, user_id: str) -> bool:
        """Assign a printer to a group"""
        with self.get_session() as session:
            updated = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).update({'group_id': group_id})
            session.commit()
            return updated > 0

    def remove_printer_from_group(self, printer_id: str, user_id: str) -> bool:
        """Remove a printer from its group"""
        with self.get_session() as session:
            updated = session.query(PrinterModel).filter_by(
                printer_id=printer_id,
                owner_id=user_id
            ).update({'group_id': None})
            session.commit()
            return updated > 0

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
            
            member_model = GroupMemberModel(
                id=secrets.token_hex(16),
                group_id=group_id,
                user_id=created_by,
                role='owner',
                joined_at=datetime.utcnow()
            )
            session.add(member_model)
            session.commit()
            
            return Group.from_model(group_model)

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
                group_dict = Group.from_model(group).to_dict()
                group_dict['memberRole'] = member.role
                group_dict['joinedAt'] = member.joined_at.isoformat()
                result.append(group_dict)
            return result

    def get_group_by_id(self, group_id: str) -> Optional[Group]:
        """Get a group by ID"""
        with self.get_session() as session:
            group = session.query(GroupModel).filter_by(id=group_id, is_active=True).first()
            if group:
                return Group.from_model(group)
        return None

    def get_group_members(self, group_id: str) -> List[GroupMember]:
        """Get all members of a group with their usernames"""
        with self.get_session() as session:
            members = session.query(GroupMemberModel, UserModel).join(
                UserModel, GroupMemberModel.user_id == UserModel.id
            ).filter(
                GroupMemberModel.group_id == group_id
            ).all()
            
            return [GroupMember.from_model(m, u.username) for m, u in members]

    def get_group_printers(self, group_id: str) -> List[Printer]:
        """Get all printers assigned to a group"""
        with self.get_session() as session:
            printers = session.query(PrinterModel).filter_by(
                group_id=group_id,
                is_active=True
            ).all()
            return [Printer.from_model(p) for p in printers]

    def get_user_group_role(self, user_id: str, group_id: str) -> Optional[str]:
        """Get a user's role in a group"""
        with self.get_session() as session:
            member = session.query(GroupMemberModel).filter_by(
                user_id=user_id,
                group_id=group_id
            ).first()
            return member.role if member else None

    def add_group_member(self, group_id: str, user_id: str, role: str = 'member') -> Optional[GroupMember]:
        """Add a user to a group"""
        with self.get_session() as session:
            existing = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id
            ).first()
            if existing:
                return None
            
            member_model = GroupMemberModel(
                id=secrets.token_hex(16),
                group_id=group_id,
                user_id=user_id,
                role=role,
                joined_at=datetime.utcnow()
            )
            session.add(member_model)
            session.commit()
            
            user = session.query(UserModel).filter_by(id=user_id).first()
            return GroupMember.from_model(member_model, user.username if user else None)

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

    def delete_group(self, group_id: str, user_id: str) -> bool:
        """Delete a group (soft delete, user must be owner)"""
        with self.get_session() as session:
            member = session.query(GroupMemberModel).filter_by(
                group_id=group_id,
                user_id=user_id,
                role='owner'
            ).first()
            if not member:
                return False
            
            session.query(PrinterModel).filter_by(group_id=group_id).update({'group_id': None})
            session.query(GroupModel).filter_by(id=group_id).update({'is_active': False})
            session.commit()
            return True

    def update_group(self, group_id: str, user_id: str, name: Optional[str] = None, 
                     description: Optional[str] = None) -> bool:
        """Update group details"""
        with self.get_session() as session:
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

    # ==================== Print Queue Methods ====================

    def get_queued_jobs(self) -> List[PrintQueueJobModel]:
        """Get all queued jobs ordered by position"""
        with self.get_session() as session:
            jobs = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.status == 'queued'
            ).order_by(PrintQueueJobModel.position).all()
            # Detach from session
            session.expunge_all()
            return jobs

    def get_printing_jobs(self) -> List[PrintQueueJobModel]:
        """Get all currently printing jobs"""
        with self.get_session() as session:
            jobs = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.status == 'printing'
            ).all()
            session.expunge_all()
            return jobs

    def get_completed_today_count(self) -> int:
        """Get count of jobs completed today"""
        with self.get_session() as session:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            return session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.status == 'completed',
                PrintQueueJobModel.completed_at >= today_start
            ).count()

    def add_queue_job(self, user_id: str, file_id: str, file_name: str, 
                      priority: str = 'Normal') -> PrintQueueJobModel:
        """Add a job to the print queue"""
        with self.get_session() as session:
            max_position = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.status == 'queued'
            ).count()
            
            position = max_position + 1
            
            if priority == 'Urgent':
                position = 1
                session.query(PrintQueueJobModel).filter(
                    PrintQueueJobModel.status == 'queued'
                ).update({PrintQueueJobModel.position: PrintQueueJobModel.position + 1})
            elif priority == 'High':
                first_normal = session.query(PrintQueueJobModel).filter(
                    PrintQueueJobModel.status == 'queued',
                    PrintQueueJobModel.priority.in_(['Normal', 'Low'])
                ).order_by(PrintQueueJobModel.position).first()
                if first_normal:
                    position = first_normal.position
                    session.query(PrintQueueJobModel).filter(
                        PrintQueueJobModel.status == 'queued',
                        PrintQueueJobModel.position >= position
                    ).update({PrintQueueJobModel.position: PrintQueueJobModel.position + 1})
            
            job = PrintQueueJobModel(
                id=secrets.token_hex(16),
                user_id=user_id,
                file_id=file_id,
                file_name=file_name,
                position=position,
                priority=priority,
                status='queued',
            )
            session.add(job)
            session.commit()
            session.expunge(job)
            return job

    def update_job_position(self, job_id: str, new_position: int) -> bool:
        """Update a job's position in the queue"""
        with self.get_session() as session:
            job = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.id == job_id,
                PrintQueueJobModel.status == 'queued'
            ).first()
            
            if not job:
                return False
            
            old_position = job.position
            
            if new_position < old_position:
                session.query(PrintQueueJobModel).filter(
                    PrintQueueJobModel.status == 'queued',
                    PrintQueueJobModel.position >= new_position,
                    PrintQueueJobModel.position < old_position,
                    PrintQueueJobModel.id != job_id
                ).update({PrintQueueJobModel.position: PrintQueueJobModel.position + 1})
            else:
                session.query(PrintQueueJobModel).filter(
                    PrintQueueJobModel.status == 'queued',
                    PrintQueueJobModel.position > old_position,
                    PrintQueueJobModel.position <= new_position,
                    PrintQueueJobModel.id != job_id
                ).update({PrintQueueJobModel.position: PrintQueueJobModel.position - 1})
            
            job.position = new_position
            session.commit()
            return True

    def remove_queue_job(self, job_id: str) -> bool:
        """Remove a job from the queue"""
        with self.get_session() as session:
            job = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.id == job_id,
                PrintQueueJobModel.status == 'queued'
            ).first()
            
            if not job:
                return False
            
            old_position = job.position
            
            session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.status == 'queued',
                PrintQueueJobModel.position > old_position
            ).update({PrintQueueJobModel.position: PrintQueueJobModel.position - 1})
            
            session.delete(job)
            session.commit()
            return True

    def cancel_print_job(self, job_id: str) -> bool:
        """Cancel an active print job"""
        with self.get_session() as session:
            job = session.query(PrintQueueJobModel).filter(
                PrintQueueJobModel.id == job_id,
                PrintQueueJobModel.status == 'printing'
            ).first()
            
            if not job:
                return False
            
            job.status = 'cancelled'
            job.completed_at = datetime.utcnow()
            session.commit()
            return True
