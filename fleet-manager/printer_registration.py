#!/usr/bin/env python3
"""
Printer Registration Service for Fleet Manager
Handles printer registration keys, device pairing codes, and email notifications
"""
import os
import secrets
import logging
import json
import random
import string
from datetime import datetime, timedelta
from typing import Optional, List
from dataclasses import dataclass

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Index
from aiohttp import web

from auth_postgres import Base, require_auth, AuthDatabase

logger = logging.getLogger(__name__)

# Resend Email Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
EMAIL_FROM = os.environ.get('EMAIL_FROM', 'Modovolo Fleet <noreply@modovolo.com>')
EMAIL_ENABLED = bool(RESEND_API_KEY)

REGISTRATION_KEY_EXPIRE_HOURS = 24
PAIRING_CODE_EXPIRE_MINUTES = 10  # Pairing codes expire in 10 minutes
FLEET_URL = os.environ.get('FLEET_URL', 'https://fleet.modovolo.com')


class PrinterRegistrationKeyModel(Base):
    """Printer registration key model"""
    __tablename__ = 'printer_registration_keys'
    
    key = Column(String(255), primary_key=True)
    user_id = Column(String(32), ForeignKey('users.id'), nullable=False, index=True)
    printer_name = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    used = Column(Boolean, default=False)
    used_at = Column(DateTime)
    printer_id = Column(String(32))  # Set when the key is used to register a printer
    
    __table_args__ = (
        Index('idx_reg_user_id', 'user_id'),
        Index('idx_reg_key', 'key'),
        Index('idx_reg_expires_at', 'expires_at'),
    )


class PairingCodeModel(Base):
    """Device-style pairing code model - 6 digit codes displayed on printer"""
    __tablename__ = 'pairing_codes'
    
    code = Column(String(6), primary_key=True)  # 6-digit code
    printer_name = Column(String(255), nullable=False)
    printer_host = Column(String(255))  # Local IP/hostname of printer
    printer_port = Column(String(10))  # Moonraker port
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), default='pending')  # pending, paired, expired
    user_id = Column(String(32), ForeignKey('users.id'))  # Set when user claims the code
    printer_id = Column(String(32))  # Set when pairing completes
    
    __table_args__ = (
        Index('idx_pairing_code', 'code'),
        Index('idx_pairing_status', 'status'),
        Index('idx_pairing_expires_at', 'expires_at'),
    )


@dataclass
class PrinterRegistrationKey:
    """Registration key data class"""
    key: str
    user_id: str
    printer_name: str
    expires_at: str
    created_at: str
    used: bool
    printer_id: Optional[str] = None

    def to_dict(self):
        return {
            'key': self.key,
            'userId': self.user_id,
            'printerName': self.printer_name,
            'expiresAt': self.expires_at,
            'createdAt': self.created_at,
            'used': self.used,
            'printerId': self.printer_id,
        }


@dataclass
class PairingCode:
    """Pairing code data class"""
    code: str
    printer_name: str
    printer_host: Optional[str]
    printer_port: Optional[str]
    expires_at: str
    created_at: str
    status: str
    user_id: Optional[str] = None
    printer_id: Optional[str] = None

    def to_dict(self):
        return {
            'code': self.code,
            'printerName': self.printer_name,
            'printerHost': self.printer_host,
            'printerPort': self.printer_port,
            'expiresAt': self.expires_at,
            'createdAt': self.created_at,
            'status': self.status,
            'userId': self.user_id,
            'printerId': self.printer_id,
        }


class PrinterRegistrationDatabase:
    """Database operations for printer registration"""
    
    def __init__(self, db: AuthDatabase):
        self.db = db

    def create_registration_key(self, user_id: str, printer_name: str) -> PrinterRegistrationKey:
        """Create a printer registration key"""
        with self.db.get_session() as session:
            key = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(hours=REGISTRATION_KEY_EXPIRE_HOURS)
            created_at = datetime.utcnow()
            
            key_model = PrinterRegistrationKeyModel(
                key=key,
                user_id=user_id,
                printer_name=printer_name,
                expires_at=expires_at,
                created_at=created_at,
                used=False
            )
            session.add(key_model)
            session.commit()
            
            return PrinterRegistrationKey(
                key=key,
                user_id=user_id,
                printer_name=printer_name,
                expires_at=expires_at.isoformat(),
                created_at=created_at.isoformat(),
                used=False
            )

    def get_registration_key(self, key: str) -> Optional[PrinterRegistrationKey]:
        """Get a registration key"""
        with self.db.get_session() as session:
            key_model = session.query(PrinterRegistrationKeyModel).filter_by(key=key).first()
            if key_model:
                return PrinterRegistrationKey(
                    key=key_model.key,
                    user_id=key_model.user_id,
                    printer_name=key_model.printer_name,
                    expires_at=key_model.expires_at.isoformat(),
                    created_at=key_model.created_at.isoformat(),
                    used=key_model.used,
                    printer_id=key_model.printer_id
                )
        return None

    def validate_registration_key(self, key: str) -> Optional[dict]:
        """Validate a registration key and return key info if valid"""
        with self.db.get_session() as session:
            key_model = session.query(PrinterRegistrationKeyModel).filter_by(key=key).first()
            if key_model:
                if key_model.used:
                    return None  # Already used
                if key_model.expires_at < datetime.utcnow():
                    return None  # Expired
                return {
                    'user_id': key_model.user_id,
                    'printer_name': key_model.printer_name
                }
        return None

    def mark_key_as_used(self, key: str, printer_id: str):
        """Mark a registration key as used"""
        with self.db.get_session() as session:
            session.query(PrinterRegistrationKeyModel).filter_by(key=key).update({
                'used': True,
                'used_at': datetime.utcnow(),
                'printer_id': printer_id
            })
            session.commit()

    def get_user_registration_keys(self, user_id: str) -> List[PrinterRegistrationKey]:
        """Get all registration keys for a user"""
        with self.db.get_session() as session:
            keys = session.query(PrinterRegistrationKeyModel).filter_by(
                user_id=user_id
            ).order_by(PrinterRegistrationKeyModel.created_at.desc()).all()
            return [
                PrinterRegistrationKey(
                    key=k.key,
                    user_id=k.user_id,
                    printer_name=k.printer_name,
                    expires_at=k.expires_at.isoformat(),
                    created_at=k.created_at.isoformat(),
                    used=k.used,
                    printer_id=k.printer_id
                )
                for k in keys
            ]

    # ===== Device-Style Pairing Methods =====

    def _generate_pairing_code(self) -> str:
        """Generate a unique 6-digit pairing code"""
        for _ in range(10):  # Try up to 10 times to get a unique code
            code = ''.join(random.choices(string.digits, k=6))
            with self.db.get_session() as session:
                existing = session.query(PairingCodeModel).filter_by(code=code, status='pending').first()
                if not existing:
                    return code
        raise ValueError("Unable to generate unique pairing code")

    def create_pairing_code(self, printer_name: str, printer_host: str = None, printer_port: str = None) -> PairingCode:
        """Create a pairing code for a printer (called by printer client)"""
        with self.db.get_session() as session:
            # Clean up expired codes first
            session.query(PairingCodeModel).filter(
                PairingCodeModel.expires_at < datetime.utcnow(),
                PairingCodeModel.status == 'pending'
            ).update({'status': 'expired'})
            session.commit()

        code = self._generate_pairing_code()
        expires_at = datetime.utcnow() + timedelta(minutes=PAIRING_CODE_EXPIRE_MINUTES)
        created_at = datetime.utcnow()
        
        with self.db.get_session() as session:
            code_model = PairingCodeModel(
                code=code,
                printer_name=printer_name,
                printer_host=printer_host,
                printer_port=printer_port,
                expires_at=expires_at,
                created_at=created_at,
                status='pending'
            )
            session.add(code_model)
            session.commit()
            
            return PairingCode(
                code=code,
                printer_name=printer_name,
                printer_host=printer_host,
                printer_port=printer_port,
                expires_at=expires_at.isoformat(),
                created_at=created_at.isoformat(),
                status='pending'
            )

    def get_pairing_code(self, code: str) -> Optional[PairingCode]:
        """Get a pairing code by code"""
        with self.db.get_session() as session:
            code_model = session.query(PairingCodeModel).filter_by(code=code).first()
            if code_model:
                return PairingCode(
                    code=code_model.code,
                    printer_name=code_model.printer_name,
                    printer_host=code_model.printer_host,
                    printer_port=code_model.printer_port,
                    expires_at=code_model.expires_at.isoformat(),
                    created_at=code_model.created_at.isoformat(),
                    status=code_model.status,
                    user_id=code_model.user_id,
                    printer_id=code_model.printer_id
                )
        return None

    def claim_pairing_code(self, code: str, user_id: str) -> Optional[dict]:
        """User claims a pairing code (links it to their account)"""
        with self.db.get_session() as session:
            code_model = session.query(PairingCodeModel).filter_by(code=code, status='pending').first()
            
            if not code_model:
                return None
            
            if code_model.expires_at < datetime.utcnow():
                code_model.status = 'expired'
                session.commit()
                return None
            
            # Generate printer_id and mark as paired
            printer_id = secrets.token_hex(16)
            code_model.user_id = user_id
            code_model.printer_id = printer_id
            code_model.status = 'paired'
            session.commit()
            
            return {
                'printer_id': printer_id,
                'printer_name': code_model.printer_name,
                'user_id': user_id
            }

    def check_pairing_status(self, code: str) -> Optional[dict]:
        """Check pairing status (called by printer client polling)"""
        with self.db.get_session() as session:
            code_model = session.query(PairingCodeModel).filter_by(code=code).first()
            
            if not code_model:
                return None
            
            # Check if expired
            if code_model.status == 'pending' and code_model.expires_at < datetime.utcnow():
                code_model.status = 'expired'
                session.commit()
            
            return {
                'status': code_model.status,
                'printer_id': code_model.printer_id,
                'expires_at': code_model.expires_at.isoformat()
            }


class EmailService:
    """Service for sending emails using Resend"""
    
    @staticmethod
    async def send_printer_registration_email(
        user_email: str,
        username: str,
        printer_name: str,
        registration_key: str
    ) -> bool:
        """Send printer registration email via Resend API"""
        logger.info(f"Sending registration email - to: {user_email}, printer_name: '{printer_name}'")
        
        if not EMAIL_ENABLED:
            logger.warning(f"Email disabled - Registration key for {printer_name}: {registration_key}")
            # Return True so the key is still provided to the user
            return True
        
        try:
            import resend
            resend.api_key = RESEND_API_KEY
            
            html_content = f"""
<html>
  <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0;">🖨️ Printer Registration</h1>
    </div>
    <div style="padding: 30px; background: #fff;">
      <p style="font-size: 16px;">Hi <strong>{username}</strong>,</p>
      <p>Your printer registration key has been generated for <strong>{printer_name}</strong>.</p>
      
      <div style="background: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Your Registration Key:</p>
        <code style="font-size: 18px; background: #1565c0; color: white; padding: 12px 20px; border-radius: 4px; display: inline-block; font-family: 'Courier New', monospace; letter-spacing: 1px;">
          {registration_key}
        </code>
      </div>
      
      <h3 style="color: #1976d2; margin-top: 30px;">📋 Setup Instructions</h3>
      <ol style="line-height: 2;">
        <li>Download the fleet client to your printer's Raspberry Pi</li>
        <li>Install dependencies: <code style="background:#f5f5f5; padding:4px 8px; border-radius: 4px;">pip3 install websockets requests</code></li>
        <li>Register your printer:
          <div style="background: #263238; color: #4fc3f7; padding: 12px; border-radius: 4px; margin: 10px 0; font-family: monospace;">
            python3 printer_fleet_client.py --register {registration_key}
          </div>
        </li>
      </ol>
      
      <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
        <strong>⏰ Note:</strong> This key expires in {REGISTRATION_KEY_EXPIRE_HOURS} hours.
      </div>
      
      <p style="color: #666;">Once connected, your printer will appear in your <a href="{FLEET_URL}/my-printers" style="color: #1976d2;">My Printers</a> dashboard.</p>
    </div>
    <div style="background: #f5f5f5; padding: 20px; text-align: center; color: #888; font-size: 12px;">
      <p style="margin: 0;">Modovolo Fleet Manager</p>
      <p style="margin: 5px 0 0 0;"><a href="{FLEET_URL}" style="color: #1976d2;">fleet.modovolo.com</a></p>
    </div>
  </body>
</html>
"""
            
            text_content = f"""
Hi {username},

Your printer registration key has been generated.

Printer: {printer_name}
Registration Key: {registration_key}

To register your printer:
1. Download the fleet client to your printer's Raspberry Pi
2. Install dependencies: pip3 install websockets requests
3. Run: python3 printer_fleet_client.py --register {registration_key}

This key will expire in {REGISTRATION_KEY_EXPIRE_HOURS} hours.

Best regards,
Modovolo Fleet Manager
{FLEET_URL}
"""
            
            params = {
                "from": EMAIL_FROM,
                "to": [user_email],
                "subject": f"🖨️ Printer Registration Key - {printer_name}",
                "html": html_content,
                "text": text_content,
            }
            
            email = resend.Emails.send(params)
            logger.info(f"Registration email sent to {user_email}, id: {email.get('id', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"Failed to send registration email: {e}")
            return False


# API Routes
@require_auth
async def create_registration_key(request: web.Request):
    """Create a printer registration key"""
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    printer_name = data.get('printerName')
    logger.info(f"Registration request received - printerName: '{printer_name}', full data: {data}")
    
    if not printer_name:
        return web.json_response({'error': 'Printer name required'}, status=400)
    
    if len(printer_name) < 2:
        return web.json_response({'error': 'Printer name must be at least 2 characters'}, status=400)
    
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    # Get user to get their email
    user = db.get_user_by_id(user_id)
    if not user:
        return web.json_response({'error': 'User not found'}, status=404)
    
    # Validate that user has an email address
    if not user.email or len(user.email.strip()) == 0:
        return web.json_response({
            'error': 'Email address required. Please add an email to your account before registering printers.'
        }, status=400)
    
    try:
        # Create registration key
        reg_key = reg_db.create_registration_key(user_id, printer_name)
        
        # Send email
        email_sent = await EmailService.send_printer_registration_email(
            user.email,
            user.username,
            printer_name,
            reg_key.key
        )
        
        if not email_sent:
            logger.warning(f"Failed to send email but key was generated: {reg_key.key}")
        
        return web.json_response({
            'message': 'Registration key created and sent to your email',
            'key': reg_key.to_dict(),
            'emailSent': email_sent
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to create registration key: {e}")
        return web.json_response(
            {'error': 'Failed to create registration key'},
            status=500
        )


@require_auth
async def get_registration_keys(request: web.Request):
    """Get all registration keys for the user"""
    user_id = request['user']['sub']
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    keys = reg_db.get_user_registration_keys(user_id)
    return web.json_response({
        'keys': [k.to_dict() for k in keys]
    })


async def validate_registration_key_endpoint(request: web.Request):
    """Validate a registration key (no auth required - used by printer script)"""
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    registration_key = data.get('registrationKey')
    if not registration_key:
        return web.json_response({'error': 'Registration key required'}, status=400)
    
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    key_info = reg_db.validate_registration_key(registration_key)
    if not key_info:
        return web.json_response({'error': 'Invalid or expired registration key'}, status=401)
    
    return web.json_response({
        'valid': True,
        'printerName': key_info['printer_name']
    })


async def register_printer_with_key(request: web.Request):
    """Register a printer using a registration key (no auth - used by printer script)"""
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    registration_key = data.get('registrationKey')
    printer_host = data.get('host')  # Optional: printer's local IP/hostname
    printer_port = data.get('port')  # Optional: moonraker port
    
    if not registration_key:
        return web.json_response({'error': 'Registration key required'}, status=400)
    
    db: AuthDatabase = request.app['auth_db']
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    # Validate the key
    key_info = reg_db.validate_registration_key(registration_key)
    if not key_info:
        return web.json_response(
            {'error': 'Invalid or expired registration key'},
            status=401
        )
    
    # Generate a unique printer_id (this is the secret for the printer)
    printer_id = secrets.token_hex(16)
    
    try:
        # Create the printer in the database
        printer = db.create_printer(
            owner_id=key_info['user_id'],
            printer_id=printer_id,
            name=key_info['printer_name'],
            host=printer_host,
            port=printer_port
        )
        
        # Mark key as used
        reg_db.mark_key_as_used(registration_key, printer_id)
        
        logger.info(f"Printer registered: {printer_id} for user {key_info['user_id']}")
        
        return web.json_response({
            'message': 'Printer registered successfully',
            'printer': printer.to_dict(),
            'printerId': printer_id,
            'fleetUrl': FLEET_URL,
            'wsUrl': f"{FLEET_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/printer"
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to register printer: {e}")
        return web.json_response(
            {'error': 'Failed to register printer'},
            status=500
        )


@require_auth
async def delete_printer(request: web.Request):
    """Delete a printer"""
    printer_id = request.match_info.get('printer_id')
    if not printer_id:
        return web.json_response({'error': 'Printer ID required'}, status=400)
    
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    
    # Verify ownership
    printer = db.get_printer_by_id(printer_id, user_id)
    if not printer:
        return web.json_response({'error': 'Printer not found'}, status=404)
    
    # Delete the printer
    with db.get_session() as session:
        from auth_postgres import PrinterModel
        session.query(PrinterModel).filter_by(printer_id=printer_id, owner_id=user_id).delete()
        session.commit()
    
    return web.json_response({'message': 'Printer deleted'})


# ===== Device-Style Pairing Endpoints =====

async def create_pairing_code_endpoint(request: web.Request):
    """Create a pairing code (called by printer client, no auth required)"""
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    printer_name = data.get('printerName', 'Unknown Printer')
    printer_host = data.get('host')
    printer_port = data.get('port')
    
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    try:
        pairing_code = reg_db.create_pairing_code(printer_name, printer_host, printer_port)
        logger.info(f"Pairing code created: {pairing_code.code} for {printer_name}")
        
        return web.json_response({
            'code': pairing_code.code,
            'expiresAt': pairing_code.expires_at,
            'expiresInMinutes': PAIRING_CODE_EXPIRE_MINUTES
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to create pairing code: {e}")
        return web.json_response({'error': 'Failed to create pairing code'}, status=500)


async def check_pairing_status_endpoint(request: web.Request):
    """Check pairing status (called by printer client polling, no auth required)"""
    code = request.match_info.get('code')
    if not code:
        return web.json_response({'error': 'Code required'}, status=400)
    
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    db: AuthDatabase = request.app['auth_db']
    
    status_info = reg_db.check_pairing_status(code)
    if not status_info:
        return web.json_response({'error': 'Invalid code'}, status=404)
    
    response = {
        'status': status_info['status'],
        'expiresAt': status_info['expires_at']
    }
    
    # If paired, include the printer_id and WebSocket URL
    if status_info['status'] == 'paired' and status_info['printer_id']:
        response['printerId'] = status_info['printer_id']
        response['fleetUrl'] = FLEET_URL
        response['wsUrl'] = f"{FLEET_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/printer"
    
    return web.json_response(response)


@require_auth
async def claim_pairing_code_endpoint(request: web.Request):
    """User claims a pairing code (links printer to their account)"""
    try:
        data = await request.json()
    except:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    code = data.get('code')
    if not code:
        return web.json_response({'error': 'Pairing code required'}, status=400)
    
    # Validate code format (6 digits)
    if not code.isdigit() or len(code) != 6:
        return web.json_response({'error': 'Invalid code format. Enter 6 digits.'}, status=400)
    
    user_id = request['user']['sub']
    db: AuthDatabase = request.app['auth_db']
    reg_db: PrinterRegistrationDatabase = request.app['reg_db']
    
    # Claim the code
    claim_result = reg_db.claim_pairing_code(code, user_id)
    if not claim_result:
        return web.json_response({'error': 'Invalid or expired pairing code'}, status=400)
    
    try:
        # Create the printer in the database
        printer = db.create_printer(
            owner_id=claim_result['user_id'],
            printer_id=claim_result['printer_id'],
            name=claim_result['printer_name']
        )
        
        logger.info(f"Printer paired via code: {claim_result['printer_id']} for user {user_id}")
        
        return web.json_response({
            'message': 'Printer paired successfully!',
            'printer': printer.to_dict()
        }, status=201)
    except Exception as e:
        logger.error(f"Failed to create printer after pairing: {e}")
        return web.json_response({'error': 'Failed to complete pairing'}, status=500)


def setup_printer_registration_routes(app: web.Application):
    """Setup printer registration routes"""
    db: AuthDatabase = app['auth_db']
    
    # Initialize registration database
    reg_db = PrinterRegistrationDatabase(db)
    app['reg_db'] = reg_db
    
    # Create the registration key table
    from auth_postgres import Base
    Base.metadata.create_all(db.engine)
    
    # Add routes
    app.router.add_post('/api/printer-registration/keys', create_registration_key)
    app.router.add_get('/api/printer-registration/keys', get_registration_keys)
    app.router.add_post('/api/printer-registration/validate', validate_registration_key_endpoint)
    app.router.add_post('/api/printer-registration/register', register_printer_with_key)
    app.router.add_delete('/api/printers/{printer_id}', delete_printer)
    
    # Device-style pairing routes
    app.router.add_post('/api/pairing/code', create_pairing_code_endpoint)
    app.router.add_get('/api/pairing/status/{code}', check_pairing_status_endpoint)
    app.router.add_post('/api/pairing/claim', claim_pairing_code_endpoint)
    
    logger.info("Printer registration routes configured")
