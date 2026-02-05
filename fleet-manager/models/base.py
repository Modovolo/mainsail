"""
SQLAlchemy Base and common utilities
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session

# PostgreSQL connection
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'fleet_manager')
DB_USER = os.environ.get('DB_USER', 'fleet_admin')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'fleet_password')

DATABASE_URL = f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'

Base = declarative_base()


def get_engine():
    """Get SQLAlchemy engine"""
    return create_engine(DATABASE_URL, pool_pre_ping=True)


def get_session_factory(engine=None):
    """Get scoped session factory"""
    if engine is None:
        engine = get_engine()
    return scoped_session(sessionmaker(bind=engine))
