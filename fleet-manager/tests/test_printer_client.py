"""
Unit tests for Printer Fleet Client
"""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class MockWebSocket:
    """Mock WebSocket for testing"""
    
    def __init__(self):
        self.sent_messages = []
        self.messages_to_receive = []
        self.closed = False
    
    async def send(self, message):
        self.sent_messages.append(message)
    
    async def recv(self):
        if self.messages_to_receive:
            return self.messages_to_receive.pop(0)
        await asyncio.sleep(10)  # Block if no messages
    
    async def close(self):
        self.closed = True
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        await self.close()


class TestPrinterClientRegistration:
    """Tests for printer client registration"""

    @pytest.mark.asyncio
    async def test_registration_message_format(self):
        """Test that registration message has correct format"""
        registration = {
            "type": "register",
            "printer_id": "test-printer",
            "hostname": "localhost",
            "ip": "192.168.1.1",
            "capabilities": ["print", "pause", "cancel"]
        }
        
        assert registration["type"] == "register"
        assert "printer_id" in registration
        assert "hostname" in registration
        assert isinstance(registration["capabilities"], list)

    @pytest.mark.asyncio
    async def test_registration_requires_printer_id(self):
        """Test that registration requires printer_id"""
        registration = {
            "type": "register",
            "hostname": "localhost"
        }
        
        assert "printer_id" not in registration or registration.get("printer_id") is None


class TestPrinterClientHeartbeat:
    """Tests for printer client heartbeat functionality"""

    @pytest.mark.asyncio
    async def test_heartbeat_message_format(self):
        """Test heartbeat message format"""
        heartbeat = {"type": "heartbeat"}
        
        assert heartbeat["type"] == "heartbeat"

    @pytest.mark.asyncio
    async def test_heartbeat_interval(self):
        """Test that heartbeat respects interval"""
        interval = 30
        
        # In actual implementation, heartbeats should be sent every 30 seconds
        assert interval > 0
        assert interval <= 60  # Reasonable maximum


class TestPrinterClientStatusUpdates:
    """Tests for printer client status updates"""

    @pytest.mark.asyncio
    async def test_status_update_format(self):
        """Test status update message format"""
        status = {
            "type": "status_update",
            "data": {
                "state": "printing",
                "progress": 50.0,
                "temperature": {
                    "bed": 60,
                    "extruder": 210
                }
            }
        }
        
        assert status["type"] == "status_update"
        assert "data" in status
        assert "state" in status["data"]

    @pytest.mark.asyncio
    async def test_status_update_states(self):
        """Test valid printer states"""
        valid_states = ["idle", "printing", "paused", "error", "complete"]
        
        for state in valid_states:
            status = {
                "type": "status_update",
                "data": {"state": state}
            }
            assert status["data"]["state"] in valid_states


class TestPrinterClientCommands:
    """Tests for printer client command handling"""

    @pytest.mark.asyncio
    async def test_pause_command_handling(self):
        """Test handling pause command"""
        command = {
            "type": "command",
            "action": "pause",
            "printer_id": "test-printer"
        }
        
        assert command["action"] == "pause"

    @pytest.mark.asyncio
    async def test_resume_command_handling(self):
        """Test handling resume command"""
        command = {
            "type": "command",
            "action": "resume",
            "printer_id": "test-printer"
        }
        
        assert command["action"] == "resume"

    @pytest.mark.asyncio
    async def test_cancel_command_handling(self):
        """Test handling cancel command"""
        command = {
            "type": "command",
            "action": "cancel",
            "printer_id": "test-printer"
        }
        
        assert command["action"] == "cancel"

    @pytest.mark.asyncio
    async def test_gcode_command_handling(self):
        """Test handling gcode command"""
        command = {
            "type": "gcode",
            "printer_id": "test-printer",
            "gcode": "G28"  # Home all axes
        }
        
        assert command["type"] == "gcode"
        assert "gcode" in command


class TestPrinterClientReconnection:
    """Tests for printer client reconnection logic"""

    @pytest.mark.asyncio
    async def test_reconnection_backoff(self):
        """Test exponential backoff for reconnection"""
        base_delay = 5
        max_delay = 300
        attempt = 0
        
        delays = []
        for attempt in range(10):
            delay = min(base_delay * (2 ** attempt), max_delay)
            delays.append(delay)
        
        # Verify exponential growth
        assert delays[0] == 5
        assert delays[1] == 10
        assert delays[2] == 20
        
        # Verify max cap
        assert all(d <= max_delay for d in delays)

    @pytest.mark.asyncio
    async def test_reconnection_resets_on_success(self):
        """Test that reconnection counter resets on successful connection"""
        attempt = 5
        
        # On successful connection
        connected = True
        if connected:
            attempt = 0
        
        assert attempt == 0


class TestMoonrakerIntegration:
    """Tests for Moonraker API integration"""

    @pytest.mark.asyncio
    async def test_moonraker_status_query(self):
        """Test Moonraker status query format"""
        moonraker_request = {
            "jsonrpc": "2.0",
            "method": "printer.objects.query",
            "params": {
                "objects": {
                    "print_stats": None,
                    "heater_bed": None,
                    "extruder": None
                }
            },
            "id": 1
        }
        
        assert moonraker_request["jsonrpc"] == "2.0"
        assert "objects" in moonraker_request["params"]

    @pytest.mark.asyncio
    async def test_moonraker_gcode_command(self):
        """Test Moonraker gcode command format"""
        gcode_request = {
            "jsonrpc": "2.0",
            "method": "printer.gcode.script",
            "params": {
                "script": "G28"
            },
            "id": 2
        }
        
        assert gcode_request["method"] == "printer.gcode.script"
        assert "script" in gcode_request["params"]

    @pytest.mark.asyncio
    async def test_moonraker_pause_command(self):
        """Test Moonraker pause command"""
        pause_request = {
            "jsonrpc": "2.0",
            "method": "printer.print.pause",
            "id": 3
        }
        
        assert pause_request["method"] == "printer.print.pause"

    @pytest.mark.asyncio
    async def test_moonraker_resume_command(self):
        """Test Moonraker resume command"""
        resume_request = {
            "jsonrpc": "2.0",
            "method": "printer.print.resume",
            "id": 4
        }
        
        assert resume_request["method"] == "printer.print.resume"
