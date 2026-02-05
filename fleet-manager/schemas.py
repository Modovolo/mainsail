#!/usr/bin/env python3
"""
Pydantic models for API request/response validation
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, field_validator


# Request Models
class LoginRequest(BaseModel):
    """Login request model"""
    username: str = Field(..., min_length=3, max_length=255, description="Username")
    password: str = Field(..., min_length=8, description="Password")


class RegisterRequest(BaseModel):
    """Registration request model"""
    username: str = Field(..., min_length=3, max_length=255, description="Username")
    password: str = Field(..., min_length=8, description="Password")
    email: Optional[str] = Field(None, max_length=255, description="Email address")

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        """Validate username format"""
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Username can only contain letters, numbers, dashes and underscores')
        return v


class RefreshTokenRequest(BaseModel):
    """Refresh token request model"""
    refreshToken: str = Field(..., description="Refresh token")


class ChangePasswordRequest(BaseModel):
    """Change password request model"""
    currentPassword: str = Field(..., min_length=8, description="Current password")
    newPassword: str = Field(..., min_length=8, description="New password")


# Response Models
class UserResponse(BaseModel):
    """User response model"""
    id: str
    username: str
    email: Optional[str] = None
    role: str
    createdAt: datetime
    lastLogin: Optional[datetime] = None
    isActive: bool = True

    class Config:
        from_attributes = True  # Allows initialization from SQLAlchemy models


class LoginResponse(BaseModel):
    """Login response model"""
    token: str
    refreshToken: str
    user: UserResponse


class UserInfoResponse(BaseModel):
    """User info response model"""
    user: UserResponse


class TokenResponse(BaseModel):
    """Token response model"""
    token: str
    refreshToken: Optional[str] = None


class MessageResponse(BaseModel):
    """Generic message response"""
    message: str


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str


class PrinterResponse(BaseModel):
    """Printer response model"""
    id: str
    ownerId: str
    printerId: str
    name: str
    host: Optional[str] = None
    port: Optional[int] = None
    createdAt: datetime
    lastConnected: Optional[datetime] = None
    isActive: bool = True

    class Config:
        from_attributes = True


class PrinterListResponse(BaseModel):
    """Printer list response model"""
    printers: list[PrinterResponse]
    total: int
