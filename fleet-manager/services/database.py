"""
Database Service for Fleet Manager
Handles all database operations
"""
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

from models.base import Base, get_engine, get_session_factory
from models.user import UserModel, RefreshTokenModel, User
from models.printer import PrinterModel, Printer
from models.group import GroupModel, GroupMemberModel, Group, GroupMember
from models.print_queue import PrintQueueJobModel, PrintQueueJob
from models.printer_profile import PrinterProfileModel, PrinterProfileData

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

    # ==================== Admin User Management Methods ====================

    def get_all_users(self) -> List[User]:
        """Get all users (admin function)"""
        with self.get_session() as session:
            users = session.query(UserModel).order_by(UserModel.username).all()
            return [User.from_model(u) for u in users]

    def admin_reset_password(self, user_id: str, new_password: str) -> bool:
        """Admin function to reset a user's password"""
        with self.get_session() as session:
            password_hash = self._hash_password(new_password)
            result = session.query(UserModel).filter_by(id=user_id).update(
                {'password_hash': password_hash}
            )
            session.commit()
            if result > 0:
                # Revoke all existing tokens for the user
                self.revoke_all_user_tokens(user_id)
                return True
            return False

    def update_user_role(self, user_id: str, new_role: str) -> bool:
        """Update user role (admin function)"""
        with self.get_session() as session:
            result = session.query(UserModel).filter_by(id=user_id).update(
                {'role': new_role}
            )
            session.commit()
            return result > 0

    def deactivate_user(self, user_id: str) -> bool:
        """Deactivate a user account (admin function)"""
        with self.get_session() as session:
            result = session.query(UserModel).filter_by(id=user_id).update(
                {'is_active': False}
            )
            session.commit()
            if result > 0:
                self.revoke_all_user_tokens(user_id)
                return True
            return False

    def activate_user(self, user_id: str) -> bool:
        """Activate a user account (admin function)"""
        with self.get_session() as session:
            result = session.query(UserModel).filter_by(id=user_id).update(
                {'is_active': True}
            )
            session.commit()
            return result > 0

    # ==================== Password Reset Token Methods ====================

    def create_password_reset_token(self, user_id: str) -> str:
        """Create a password reset token for a user"""
        from models.user import PasswordResetTokenModel
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)  # Token valid for 1 hour
        
        with self.get_session() as session:
            # Invalidate any existing tokens for this user
            session.query(PasswordResetTokenModel).filter_by(user_id=user_id).delete()
            
            token_model = PasswordResetTokenModel(
                token=token,
                user_id=user_id,
                expires_at=expires_at,
                created_at=datetime.utcnow(),
                used=False
            )
            session.add(token_model)
            session.commit()
        
        return token

    def validate_password_reset_token(self, token: str) -> Optional[str]:
        """Validate a password reset token and return user_id if valid"""
        from models.user import PasswordResetTokenModel
        with self.get_session() as session:
            token_model = session.query(PasswordResetTokenModel).filter_by(token=token).first()
            if token_model and not token_model.used and token_model.expires_at > datetime.utcnow():
                return token_model.user_id
        return None

    def use_password_reset_token(self, token: str, new_password: str) -> bool:
        """Use a password reset token to change a user's password"""
        from models.user import PasswordResetTokenModel
        user_id = self.validate_password_reset_token(token)
        if not user_id:
            return False
        
        with self.get_session() as session:
            # Update password
            password_hash = self._hash_password(new_password)
            session.query(UserModel).filter_by(id=user_id).update(
                {'password_hash': password_hash}
            )
            
            # Mark token as used
            session.query(PasswordResetTokenModel).filter_by(token=token).update(
                {'used': True}
            )
            session.commit()
        
        # Revoke all refresh tokens
        self.revoke_all_user_tokens(user_id)
        return True

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email address"""
        if not email:
            return None
        with self.get_session() as session:
            from sqlalchemy import func
            user = session.query(UserModel).filter(
                func.lower(UserModel.email) == email.lower()
            ).first()
            if user:
                return User.from_model(user)
        return None

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

    # ==================== Printer Profile Operations ====================

    def get_all_printer_profiles(self) -> List[PrinterProfileData]:
        """Get all printer profiles"""
        with self.get_session() as session:
            models = session.query(PrinterProfileModel).order_by(
                PrinterProfileModel.name
            ).all()
            return [PrinterProfileData.from_model(m) for m in models]

    def get_printer_profile(self, profile_id: str) -> Optional[PrinterProfileData]:
        """Get a single printer profile by ID"""
        with self.get_session() as session:
            model = session.query(PrinterProfileModel).filter_by(id=profile_id).first()
            if not model:
                return None
            return PrinterProfileData.from_model(model)

    def create_printer_profile(self, data: Dict[str, Any]) -> PrinterProfileData:
        """Create a new printer profile"""
        with self.get_session() as session:
            build_volume = data.get('buildVolume', {})
            model = PrinterProfileModel(
                id=secrets.token_hex(16),
                name=data.get('name', 'Custom Printer'),
                build_volume_x=build_volume.get('x', 220),
                build_volume_y=build_volume.get('y', 220),
                build_volume_z=build_volume.get('z', 250),
                extruder_count=data.get('extruderCount', 1),
                nozzle_diameter=data.get('nozzleDiameter', 0.4),
                filament_diameter=data.get('filamentDiameter', 1.75),
                bed_shape=data.get('bedShape', 'rectangular'),
                heated_bed=data.get('heatedBed', True),
                heated_chamber=data.get('heatedChamber', False),
                auto_bed_leveling=data.get('autoBedLeveling', False),
                direct_drive=data.get('directDrive', False),
                multi_extruder_type=data.get('multiExtruderType'),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(model)
            session.commit()
            return PrinterProfileData.from_model(model)

    def update_printer_profile(self, profile_id: str, data: Dict[str, Any]) -> Optional[PrinterProfileData]:
        """Update an existing printer profile"""
        with self.get_session() as session:
            model = session.query(PrinterProfileModel).filter_by(id=profile_id).first()
            if not model:
                return None

            if 'name' in data:
                model.name = data['name']
            if 'buildVolume' in data:
                bv = data['buildVolume']
                if 'x' in bv:
                    model.build_volume_x = bv['x']
                if 'y' in bv:
                    model.build_volume_y = bv['y']
                if 'z' in bv:
                    model.build_volume_z = bv['z']
            if 'extruderCount' in data:
                model.extruder_count = data['extruderCount']
            if 'nozzleDiameter' in data:
                model.nozzle_diameter = data['nozzleDiameter']
            if 'filamentDiameter' in data:
                model.filament_diameter = data['filamentDiameter']
            if 'bedShape' in data:
                model.bed_shape = data['bedShape']
            if 'heatedBed' in data:
                model.heated_bed = data['heatedBed']
            if 'heatedChamber' in data:
                model.heated_chamber = data['heatedChamber']
            if 'autoBedLeveling' in data:
                model.auto_bed_leveling = data['autoBedLeveling']
            if 'directDrive' in data:
                model.direct_drive = data['directDrive']
            if 'multiExtruderType' in data:
                model.multi_extruder_type = data['multiExtruderType']

            model.updated_at = datetime.utcnow()
            session.commit()
            return PrinterProfileData.from_model(model)

    def delete_printer_profile(self, profile_id: str) -> bool:
        """Delete a printer profile"""
        with self.get_session() as session:
            model = session.query(PrinterProfileModel).filter_by(id=profile_id).first()
            if not model:
                return False
            session.delete(model)
            session.commit()
            return True

    # ==================== Config Template Methods ====================

    def _get_template_source_path_map(self, session, template_ids: List[str]) -> Dict[str, str]:
        from models.config_template import ConfigTemplateSourceBindingModel

        if not template_ids:
            return {}

        bindings = (
            session.query(ConfigTemplateSourceBindingModel)
            .filter(ConfigTemplateSourceBindingModel.template_id.in_(template_ids))
            .all()
        )
        return {
            binding.template_id: binding.source_path
            for binding in bindings
            if binding.source_path
        }

    def get_template_source_binding(self, template_id: str) -> Optional[str]:
        """Get canonical source path binding for a template."""
        from models.config_template import ConfigTemplateSourceBindingModel

        with self.get_session() as session:
            binding = session.query(ConfigTemplateSourceBindingModel).filter_by(template_id=template_id).first()
            if not binding:
                return None
            return binding.source_path

    def upsert_template_source_binding(self, template_id: str, source_path: Optional[str]) -> Optional[str]:
        """Create, update, or delete source binding for a template."""
        from models.config_template import ConfigTemplateSourceBindingModel

        cleaned_path = (source_path or '').strip()

        with self.get_session() as session:
            binding = session.query(ConfigTemplateSourceBindingModel).filter_by(template_id=template_id).first()

            if not cleaned_path:
                if binding:
                    session.delete(binding)
                return None

            if binding:
                binding.source_path = cleaned_path
                binding.updated_at = datetime.utcnow()
            else:
                binding = ConfigTemplateSourceBindingModel(
                    id=secrets.token_hex(16),
                    template_id=template_id,
                    source_path=cleaned_path,
                    updated_at=datetime.utcnow(),
                )
                session.add(binding)

            session.flush()
            return cleaned_path

    def get_config_templates(self) -> List['ConfigTemplate']:
        """Get all config templates"""
        from models.config_template import ConfigTemplateModel, ConfigTemplate
        with self.get_session() as session:
            models = session.query(ConfigTemplateModel).order_by(ConfigTemplateModel.name).all()
            source_map = self._get_template_source_path_map(session, [m.id for m in models])
            return [
                ConfigTemplate.from_model(m, include_username=True, source_path=source_map.get(m.id))
                for m in models
            ]

    def get_config_template_by_id(self, template_id: str) -> Optional['ConfigTemplate']:
        """Get a config template by ID"""
        from models.config_template import ConfigTemplateModel, ConfigTemplate
        with self.get_session() as session:
            model = session.query(ConfigTemplateModel).filter_by(id=template_id).first()
            if model:
                source_map = self._get_template_source_path_map(session, [model.id])
                return ConfigTemplate.from_model(
                    model,
                    include_username=True,
                    source_path=source_map.get(model.id),
                )
        return None

    def create_config_template(
        self,
        template_id: str,
        name: str,
        filename: str,
        content: str,
        content_hash: str,
        version: str,
        description: Optional[str],
        created_by: str,
        source_path: Optional[str] = None,
    ) -> 'ConfigTemplate':
        """Create a new config template"""
        from models.config_template import ConfigTemplateModel, ConfigTemplate, ConfigTemplateSourceBindingModel
        with self.get_session() as session:
            model = ConfigTemplateModel(
                id=template_id,
                name=name,
                filename=filename,
                content=content,
                content_hash=content_hash,
                version=version,
                description=description,
                created_by=created_by,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            session.add(model)

            cleaned_source_path = (source_path or '').strip()
            if cleaned_source_path:
                session.add(
                    ConfigTemplateSourceBindingModel(
                        id=secrets.token_hex(16),
                        template_id=template_id,
                        source_path=cleaned_source_path,
                        updated_at=datetime.utcnow(),
                    )
                )

            session.commit()
            session.refresh(model)
            return ConfigTemplate.from_model(
                model,
                include_username=True,
                source_path=cleaned_source_path or None,
            )

    def update_config_template(
        self,
        template_id: str,
        name: str,
        filename: str,
        content: str,
        content_hash: str,
        version: str,
        description: Optional[str],
        source_path: Optional[str] = None,
    ) -> Optional['ConfigTemplate']:
        """Update an existing config template"""
        from models.config_template import ConfigTemplateModel, ConfigTemplate, ConfigTemplateSourceBindingModel
        with self.get_session() as session:
            model = session.query(ConfigTemplateModel).filter_by(id=template_id).first()
            if not model:
                return None
            
            model.name = name
            model.filename = filename
            model.content = content
            model.content_hash = content_hash
            model.version = version
            model.description = description
            model.updated_at = datetime.utcnow()

            cleaned_source_path = (source_path or '').strip()
            binding = session.query(ConfigTemplateSourceBindingModel).filter_by(template_id=template_id).first()
            if cleaned_source_path:
                if binding:
                    binding.source_path = cleaned_source_path
                    binding.updated_at = datetime.utcnow()
                else:
                    session.add(
                        ConfigTemplateSourceBindingModel(
                            id=secrets.token_hex(16),
                            template_id=template_id,
                            source_path=cleaned_source_path,
                            updated_at=datetime.utcnow(),
                        )
                    )
            elif binding:
                session.delete(binding)
            
            session.commit()
            session.refresh(model)
            return ConfigTemplate.from_model(
                model,
                include_username=True,
                source_path=cleaned_source_path or None,
            )

    def delete_config_template(self, template_id: str) -> bool:
        """Delete a config template and its sync statuses"""
        from models.config_template import (
            ConfigTemplateModel,
            ConfigTemplateSourceBindingModel,
            PrinterConfigStatusModel,
        )
        with self.get_session() as session:
            # Delete sync statuses first
            session.query(PrinterConfigStatusModel).filter_by(template_id=template_id).delete()
            session.query(ConfigTemplateSourceBindingModel).filter_by(template_id=template_id).delete()
            
            # Delete template
            model = session.query(ConfigTemplateModel).filter_by(id=template_id).first()
            if not model:
                return False
            session.delete(model)
            session.commit()
            return True

    # ==================== Printer Config Status Methods ====================

    def get_all_printer_config_statuses(self) -> List['PrinterConfigStatus']:
        """Get all printer config sync statuses"""
        from models.config_template import PrinterConfigStatusModel, PrinterConfigStatus
        with self.get_session() as session:
            models = session.query(PrinterConfigStatusModel).all()
            return [PrinterConfigStatus.from_model(m) for m in models]

    def get_printer_config_statuses(self, printer_id: str) -> List['PrinterConfigStatus']:
        """Get config sync statuses for a specific printer"""
        from models.config_template import PrinterConfigStatusModel, PrinterConfigStatus
        with self.get_session() as session:
            models = session.query(PrinterConfigStatusModel).filter_by(printer_id=printer_id).all()
            return [PrinterConfigStatus.from_model(m) for m in models]

    def update_printer_config_status(
        self,
        printer_id: str,
        template_id: str,
        synced_version: str,
        synced_hash: str
    ) -> 'PrinterConfigStatus':
        """Update or create a printer config status record"""
        from models.config_template import PrinterConfigStatusModel, PrinterConfigStatus
        with self.get_session() as session:
            # Try to find existing
            model = session.query(PrinterConfigStatusModel).filter_by(
                printer_id=printer_id,
                template_id=template_id
            ).first()
            
            if model:
                # Update existing
                model.synced_version = synced_version
                model.synced_hash = synced_hash
                model.synced_at = datetime.utcnow()
            else:
                # Create new
                model = PrinterConfigStatusModel(
                    id=secrets.token_hex(16),
                    printer_id=printer_id,
                    template_id=template_id,
                    synced_version=synced_version,
                    synced_hash=synced_hash,
                    synced_at=datetime.utcnow()
                )
                session.add(model)
            
            session.commit()
            session.refresh(model)
            return PrinterConfigStatus.from_model(model)
