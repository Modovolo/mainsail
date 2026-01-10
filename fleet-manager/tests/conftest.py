"""
Pytest configuration and fixtures for Fleet Manager tests
"""
import asyncio
import pytest
import json
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

# Add parent directory to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket connection"""
    ws = AsyncMock()
    ws.remote_address = ("127.0.0.1", 12345)
    ws.send = AsyncMock()
    ws.recv = AsyncMock()
    ws.close = AsyncMock()
    return ws


@pytest.fixture
def sample_printer_registration():
    """Sample printer registration data"""
    return {
        "type": "register",
        "printer_id": "test-printer-001",
        "hostname": "test-printer",
        "ip": "192.168.1.100",
        "capabilities": ["print", "pause", "cancel"],
        "firmware": "Klipper v0.12.0"
    }


@pytest.fixture
def sample_status_update():
    """Sample printer status update"""
    return {
        "type": "status_update",
        "data": {
            "state": "printing",
            "progress": 45.5,
            "temperature": {
                "bed": 60.0,
                "extruder": 210.0
            },
            "current_file": "test_print.gcode"
        }
    }


@pytest.fixture
def sample_heartbeat():
    """Sample heartbeat message"""
    return {"type": "heartbeat"}


@pytest.fixture
def sample_web_command():
    """Sample command from web client"""
    return {
        "type": "command",
        "printer_id": "test-printer-001",
        "action": "pause"
    }
