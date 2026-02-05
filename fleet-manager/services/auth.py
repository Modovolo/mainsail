"""
JWT Authentication Service
"""
import os
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple

import jwt

from models.user import User
from services.database import DatabaseService

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7


class JWTAuth:
    """JWT Token management"""
    
    def __init__(self, db: DatabaseService):
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
