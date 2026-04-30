"""
JWT Authentication Service
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple

import jwt
from jwt import PyJWKClient

from models.user import User
from services.database import DatabaseService

logger = logging.getLogger(__name__)

# Configuration
JWT_ALGORITHM = 'RS256'

KEYCLOAK_ISSUER_URL = "https://ghn.modovolo.com/realms/workspace"
KEYCLOAK_CLIENT_ID = "flight-data-platform" # Might share same client or create new
KEYCLOAK_JWKS_URL = "http://keycloak.keycloak.svc.cluster.local:8080/realms/workspace/protocol/openid-connect/certs"

jwks_client = PyJWKClient(KEYCLOAK_JWKS_URL)


class JWTAuth:
    """JWT Token management"""
    
    def __init__(self, db: DatabaseService):
        self.db = db

    def verify_access_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode access token"""
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token, 
                signing_key.key, 
                algorithms=["RS256"],
                audience=KEYCLOAK_CLIENT_ID,
                options={"verify_exp": True, "verify_iss": False}
            )
            return payload
        except Exception as e:
            logger.debug(f"Invalid token: {e}")
            return None
