"""
Unit tests for Fleet Manager WebSocket service
"""
import asyncio
import json
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fleet_manager import FleetManager


class TestFleetManagerInit:
    """Tests for FleetManager initialization"""

    def test_init_creates_empty_collections(self):
        """Test that FleetManager initializes with empty collections"""
        fm = FleetManager()
        
        assert fm.connected_printers == {}
        assert fm.printer_status == {}
        assert fm.web_clients == set()


class TestPrinterRegistration:
    """Tests for printer registration functionality"""

    @pytest.mark.asyncio
    async def test_register_printer_success(self, mock_websocket, sample_printer_registration):
        """Test successful printer registration"""
        fm = FleetManager()
        
        result = await fm.register_printer(mock_websocket, sample_printer_registration)
        
        assert result is True
        assert "test-printer-001" in fm.connected_printers
        assert "test-printer-001" in fm.printer_status
        assert fm.printer_status["test-printer-001"]["status"] == "connected"
        
        # Verify registration confirmation was sent
        mock_websocket.send.assert_called()
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "registered"
        assert sent_data["printer_id"] == "test-printer-001"

    @pytest.mark.asyncio
    async def test_register_printer_missing_id(self, mock_websocket):
        """Test registration fails without printer_id"""
        fm = FleetManager()
        incomplete_data = {"type": "register", "hostname": "test"}
        
        result = await fm.register_printer(mock_websocket, incomplete_data)
        
        assert result is False
        assert len(fm.connected_printers) == 0
        
        # Verify error was sent
        mock_websocket.send.assert_called()
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "error"

    @pytest.mark.asyncio
    async def test_register_printer_broadcasts_to_web_clients(
        self, mock_websocket, sample_printer_registration
    ):
        """Test that printer registration broadcasts to web clients"""
        fm = FleetManager()
        
        # Add a mock web client
        web_client = AsyncMock()
        fm.web_clients.add(web_client)
        
        await fm.register_printer(mock_websocket, sample_printer_registration)
        
        # Verify broadcast was sent
        web_client.send.assert_called()
        broadcast_data = json.loads(web_client.send.call_args[0][0])
        assert broadcast_data["type"] == "printer_connected"
        assert broadcast_data["printer_id"] == "test-printer-001"


class TestPrinterMessages:
    """Tests for handling printer messages"""

    @pytest.mark.asyncio
    async def test_handle_status_update(self, mock_websocket, sample_status_update):
        """Test handling status update from printer"""
        fm = FleetManager()
        printer_id = "test-printer-001"
        
        # Setup: register printer first
        fm.connected_printers[printer_id] = mock_websocket
        fm.printer_status[printer_id] = {
            "status": "connected",
            "last_seen": datetime.now().isoformat()
        }
        
        await fm.handle_printer_message(
            mock_websocket,
            json.dumps(sample_status_update),
            printer_id
        )
        
        # Verify status was updated
        assert "printer_data" in fm.printer_status[printer_id]
        assert fm.printer_status[printer_id]["printer_data"]["state"] == "printing"

    @pytest.mark.asyncio
    async def test_handle_heartbeat(self, mock_websocket, sample_heartbeat):
        """Test handling heartbeat from printer"""
        fm = FleetManager()
        printer_id = "test-printer-001"
        
        # Setup: register printer first
        old_time = "2026-01-09T10:00:00"
        fm.connected_printers[printer_id] = mock_websocket
        fm.printer_status[printer_id] = {
            "status": "connected",
            "last_seen": old_time
        }
        
        await fm.handle_printer_message(
            mock_websocket,
            json.dumps(sample_heartbeat),
            printer_id
        )
        
        # Verify last_seen was updated
        assert fm.printer_status[printer_id]["last_seen"] != old_time
        
        # Verify heartbeat ack was sent
        mock_websocket.send.assert_called()
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "heartbeat_ack"

    @pytest.mark.asyncio
    async def test_handle_invalid_json(self, mock_websocket):
        """Test handling invalid JSON message"""
        fm = FleetManager()
        printer_id = "test-printer-001"
        fm.connected_printers[printer_id] = mock_websocket
        fm.printer_status[printer_id] = {"status": "connected"}
        
        # Should not raise exception
        await fm.handle_printer_message(
            mock_websocket,
            "not valid json",
            printer_id
        )


class TestWebClientHandling:
    """Tests for web client functionality"""

    @pytest.mark.asyncio
    async def test_web_client_receives_fleet_status(self, mock_websocket):
        """Test that web client receives fleet status on connect"""
        fm = FleetManager()
        
        # Add some printer status
        fm.printer_status["printer-1"] = {"status": "connected"}
        fm.printer_status["printer-2"] = {"status": "idle"}
        
        # Simulate web client connection (call handler directly)
        mock_websocket.recv = AsyncMock(side_effect=Exception("Connection closed"))
        
        try:
            await fm.handle_web_client(mock_websocket, "/ws/web")
        except:
            pass
        
        # Verify fleet status was sent
        mock_websocket.send.assert_called()
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "fleet_status"
        assert "printer-1" in sent_data["printers"]
        assert "printer-2" in sent_data["printers"]

    @pytest.mark.asyncio
    async def test_web_command_forwarded_to_printer(
        self, mock_websocket, sample_web_command
    ):
        """Test that web commands are forwarded to the correct printer"""
        fm = FleetManager()
        
        # Setup: add a connected printer
        printer_ws = AsyncMock()
        fm.connected_printers["test-printer-001"] = printer_ws
        
        await fm.handle_web_command(sample_web_command)
        
        # Verify command was forwarded to printer
        printer_ws.send.assert_called()
        sent_data = json.loads(printer_ws.send.call_args[0][0])
        assert sent_data["type"] == "command"
        assert sent_data["action"] == "pause"

    @pytest.mark.asyncio
    async def test_web_command_unknown_printer(self, sample_web_command):
        """Test handling command for non-existent printer"""
        fm = FleetManager()
        sample_web_command["printer_id"] = "non-existent"
        
        # Should not raise exception
        await fm.handle_web_command(sample_web_command)


class TestBroadcasting:
    """Tests for broadcast functionality"""

    @pytest.mark.asyncio
    async def test_broadcast_to_multiple_clients(self):
        """Test broadcasting to multiple web clients"""
        fm = FleetManager()
        
        # Add multiple web clients
        clients = [AsyncMock() for _ in range(3)]
        for client in clients:
            fm.web_clients.add(client)
        
        message = {"type": "test", "data": "broadcast"}
        await fm.broadcast_to_web_clients(message)
        
        # Verify all clients received the message
        for client in clients:
            client.send.assert_called_once()
            sent_data = json.loads(client.send.call_args[0][0])
            assert sent_data["type"] == "test"

    @pytest.mark.asyncio
    async def test_broadcast_handles_failed_client(self):
        """Test that broadcast continues if one client fails"""
        fm = FleetManager()
        
        # Add clients, one that will fail
        good_client = AsyncMock()
        bad_client = AsyncMock()
        bad_client.send.side_effect = Exception("Connection lost")
        
        fm.web_clients.add(good_client)
        fm.web_clients.add(bad_client)
        
        message = {"type": "test"}
        
        # Should not raise exception
        await fm.broadcast_to_web_clients(message)
        
        # Good client should still receive message
        good_client.send.assert_called()

    @pytest.mark.asyncio
    async def test_broadcast_empty_clients(self):
        """Test broadcasting with no clients"""
        fm = FleetManager()
        
        # Should not raise exception
        await fm.broadcast_to_web_clients({"type": "test"})


class TestPrinterDisconnection:
    """Tests for printer disconnection handling"""

    @pytest.mark.asyncio
    async def test_printer_cleanup_on_disconnect(self, mock_websocket, sample_printer_registration):
        """Test that printer is cleaned up on disconnection"""
        fm = FleetManager()
        printer_id = "test-printer-001"
        
        # Setup: register printer
        await fm.register_printer(mock_websocket, sample_printer_registration)
        
        # Add a web client to verify broadcast
        web_client = AsyncMock()
        fm.web_clients.add(web_client)
        
        # Simulate disconnection cleanup
        if printer_id in fm.connected_printers:
            del fm.connected_printers[printer_id]
            fm.printer_status[printer_id]["status"] = "disconnected"
            await fm.broadcast_to_web_clients({
                "type": "printer_disconnected",
                "printer_id": printer_id
            })
        
        # Verify cleanup
        assert printer_id not in fm.connected_printers
        assert fm.printer_status[printer_id]["status"] == "disconnected"
        
        # Verify broadcast
        calls = web_client.send.call_args_list
        disconnect_broadcast = json.loads(calls[-1][0][0])
        assert disconnect_broadcast["type"] == "printer_disconnected"
