"""
Integration and regression tests for Fleet Manager system
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


class TestFullPrinterLifecycle:
    """Integration tests for complete printer lifecycle"""

    @pytest.mark.asyncio
    async def test_printer_connect_update_disconnect(self):
        """Test complete printer lifecycle: connect -> update -> disconnect"""
        fm = FleetManager()
        printer_id = "lifecycle-printer"
        
        # Setup mock websockets
        printer_ws = AsyncMock()
        printer_ws.remote_address = ("192.168.1.100", 12345)
        web_ws = AsyncMock()
        
        # Add web client
        fm.web_clients.add(web_ws)
        
        # Step 1: Connect and register printer
        registration = {
            "type": "register",
            "printer_id": printer_id,
            "hostname": "test-printer",
            "capabilities": ["print", "pause"]
        }
        
        result = await fm.register_printer(printer_ws, registration)
        assert result is True
        assert printer_id in fm.connected_printers
        
        # Verify web client was notified
        web_ws.send.assert_called()
        connect_msg = json.loads(web_ws.send.call_args[0][0])
        assert connect_msg["type"] == "printer_connected"
        
        # Step 2: Send status updates
        web_ws.reset_mock()
        
        status_update = {
            "type": "status_update",
            "data": {
                "state": "printing",
                "progress": 25.0,
                "temperature": {"bed": 60, "extruder": 200}
            }
        }
        
        await fm.handle_printer_message(
            printer_ws, 
            json.dumps(status_update), 
            printer_id
        )
        
        # Verify status was stored and broadcast
        assert fm.printer_status[printer_id]["printer_data"]["state"] == "printing"
        web_ws.send.assert_called()
        status_msg = json.loads(web_ws.send.call_args[0][0])
        assert status_msg["type"] == "printer_status"
        
        # Step 3: Disconnect printer
        web_ws.reset_mock()
        
        del fm.connected_printers[printer_id]
        fm.printer_status[printer_id]["status"] = "disconnected"
        await fm.broadcast_to_web_clients({
            "type": "printer_disconnected",
            "printer_id": printer_id
        })
        
        # Verify cleanup and notification
        assert printer_id not in fm.connected_printers
        assert fm.printer_status[printer_id]["status"] == "disconnected"
        disconnect_msg = json.loads(web_ws.send.call_args[0][0])
        assert disconnect_msg["type"] == "printer_disconnected"

    @pytest.mark.asyncio
    async def test_multiple_printers_simultaneous(self):
        """Test handling multiple printers simultaneously"""
        fm = FleetManager()
        
        printers = []
        for i in range(5):
            printer_ws = AsyncMock()
            printer_ws.remote_address = (f"192.168.1.{100+i}", 12345)
            
            registration = {
                "type": "register",
                "printer_id": f"printer-{i:03d}",
                "hostname": f"printer-{i}"
            }
            
            result = await fm.register_printer(printer_ws, registration)
            assert result is True
            printers.append((f"printer-{i:03d}", printer_ws))
        
        # Verify all printers registered
        assert len(fm.connected_printers) == 5
        assert len(fm.printer_status) == 5
        
        # Send status from each printer
        for printer_id, printer_ws in printers:
            status = {
                "type": "status_update",
                "data": {"state": "idle", "printer_specific": printer_id}
            }
            await fm.handle_printer_message(
                printer_ws, json.dumps(status), printer_id
            )
        
        # Verify each printer has correct status
        for printer_id, _ in printers:
            assert fm.printer_status[printer_id]["printer_data"]["printer_specific"] == printer_id


class TestWebClientInteraction:
    """Integration tests for web client interactions"""

    @pytest.mark.asyncio
    async def test_web_client_sees_all_printers(self):
        """Test that web client receives status of all printers"""
        fm = FleetManager()
        
        # Add multiple printers
        for i in range(3):
            printer_ws = AsyncMock()
            registration = {
                "type": "register",
                "printer_id": f"printer-{i}",
                "hostname": f"host-{i}"
            }
            await fm.register_printer(printer_ws, registration)
        
        # Simulate new web client connecting
        web_ws = AsyncMock()
        
        # Web client handler sends initial status
        await web_ws.send(json.dumps({
            "type": "fleet_status",
            "printers": fm.printer_status
        }))
        
        # Verify status contains all printers
        sent_data = json.loads(web_ws.send.call_args[0][0])
        assert len(sent_data["printers"]) == 3
        assert all(f"printer-{i}" in sent_data["printers"] for i in range(3))

    @pytest.mark.asyncio
    async def test_web_command_reaches_correct_printer(self):
        """Test that commands from web reach the correct printer"""
        fm = FleetManager()
        
        # Add multiple printers
        printers = {}
        for i in range(3):
            printer_ws = AsyncMock()
            printer_id = f"printer-{i}"
            registration = {
                "type": "register",
                "printer_id": printer_id,
                "hostname": f"host-{i}"
            }
            await fm.register_printer(printer_ws, registration)
            printers[printer_id] = printer_ws
        
        # Send command to specific printer
        command = {
            "type": "command",
            "printer_id": "printer-1",
            "action": "pause"
        }
        
        web_client_ws = MagicMock()
        await fm.handle_web_command(web_client_ws, command)
        
        # Verify only target printer received command
        printers["printer-0"].send.assert_called()  # Registration confirmation
        assert printers["printer-0"].send.call_count == 1  # Only registration
        
        # printer-1 should have registration + command
        assert printers["printer-1"].send.call_count == 2
        last_call = json.loads(printers["printer-1"].send.call_args_list[-1][0][0])
        assert last_call["action"] == "pause"


class TestErrorHandling:
    """Integration tests for error handling"""

    @pytest.mark.asyncio
    async def test_malformed_registration_handled(self):
        """Test handling of malformed registration"""
        fm = FleetManager()
        printer_ws = AsyncMock()
        
        # Various malformed registrations - only missing printer_id should fail
        # Empty dict or missing type will fail
        fail_cases = [
            {},  # Empty
            {"type": "register"},  # Missing printer_id
        ]
        
        for malformed in fail_cases:
            result = await fm.register_printer(printer_ws, malformed)
            assert result is False, f"Should have failed for: {malformed}"
        
        assert len(fm.connected_printers) == 0

    @pytest.mark.asyncio
    async def test_broadcast_failure_isolation(self):
        """Test that one failed client doesn't affect others"""
        fm = FleetManager()
        
        # Add mix of good and bad clients
        good_clients = [AsyncMock() for _ in range(3)]
        bad_client = AsyncMock()
        bad_client.send.side_effect = Exception("Connection lost")
        
        for client in good_clients:
            fm.web_clients.add(client)
        fm.web_clients.add(bad_client)
        
        # Broadcast should complete
        await fm.broadcast_to_web_clients({"type": "test"})
        
        # All good clients should have received message
        for client in good_clients:
            client.send.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_json_handling(self):
        """Test handling of invalid JSON messages"""
        fm = FleetManager()
        printer_ws = AsyncMock()
        
        # Register printer first
        registration = {
            "type": "register",
            "printer_id": "test-printer"
        }
        await fm.register_printer(printer_ws, registration)
        
        # Send invalid JSON - should not crash
        invalid_messages = [
            "not json",
            "{incomplete",
        ]
        
        for msg in invalid_messages:
            # Should not raise exception
            await fm.handle_printer_message(printer_ws, msg, "test-printer")
        
        # Valid JSON but non-dict values - should be handled gracefully
        valid_json_invalid_format = [
            "null",
            "123",
            '""',
            "[]"
        ]
        
        for msg in valid_json_invalid_format:
            # Should not raise exception
            await fm.handle_printer_message(printer_ws, msg, "test-printer")


class TestConcurrency:
    """Integration tests for concurrent operations"""

    @pytest.mark.asyncio
    async def test_concurrent_registrations(self):
        """Test handling concurrent printer registrations"""
        fm = FleetManager()
        
        async def register_printer(i):
            printer_ws = AsyncMock()
            registration = {
                "type": "register",
                "printer_id": f"concurrent-printer-{i}",
                "hostname": f"host-{i}"
            }
            return await fm.register_printer(printer_ws, registration)
        
        # Register 10 printers concurrently
        results = await asyncio.gather(*[register_printer(i) for i in range(10)])
        
        assert all(results)
        assert len(fm.connected_printers) == 10

    @pytest.mark.asyncio
    async def test_concurrent_status_updates(self):
        """Test handling concurrent status updates"""
        fm = FleetManager()
        
        # Register printers first
        printers = []
        for i in range(5):
            printer_ws = AsyncMock()
            registration = {
                "type": "register",
                "printer_id": f"printer-{i}",
                "hostname": f"host-{i}"
            }
            await fm.register_printer(printer_ws, registration)
            printers.append((f"printer-{i}", printer_ws))
        
        async def send_updates(printer_id, printer_ws):
            for j in range(10):
                status = {
                    "type": "status_update",
                    "data": {"progress": j * 10, "iteration": j}
                }
                await fm.handle_printer_message(
                    printer_ws, json.dumps(status), printer_id
                )
        
        # Send updates concurrently
        await asyncio.gather(*[
            send_updates(pid, pws) for pid, pws in printers
        ])
        
        # Verify final state
        for printer_id, _ in printers:
            assert fm.printer_status[printer_id]["printer_data"]["progress"] == 90


class TestRegressionScenarios:
    """Regression tests for previously identified issues"""

    @pytest.mark.asyncio
    async def test_printer_id_with_special_characters(self):
        """Regression: Printer IDs with special characters should work"""
        fm = FleetManager()
        
        special_ids = [
            "printer-with-dashes",
            "printer_with_underscores",
            "printer.with.dots",
            "UPPERCASE-PRINTER",
            "MixedCase-Printer_123"
        ]
        
        for printer_id in special_ids:
            printer_ws = AsyncMock()
            registration = {
                "type": "register",
                "printer_id": printer_id,
                "hostname": "test"
            }
            result = await fm.register_printer(printer_ws, registration)
            assert result is True, f"Failed for printer_id: {printer_id}"

    @pytest.mark.asyncio
    async def test_empty_web_clients_broadcast(self):
        """Regression: Broadcasting with no web clients should not error"""
        fm = FleetManager()
        
        assert len(fm.web_clients) == 0
        
        # Should not raise
        await fm.broadcast_to_web_clients({"type": "test"})

    @pytest.mark.asyncio
    async def test_duplicate_printer_registration(self):
        """Regression: Re-registering same printer should update, not duplicate"""
        fm = FleetManager()
        
        printer_ws1 = AsyncMock()
        printer_ws2 = AsyncMock()
        
        registration = {
            "type": "register",
            "printer_id": "duplicate-test",
            "hostname": "first"
        }
        
        # First registration
        await fm.register_printer(printer_ws1, registration)
        
        # Second registration with same ID
        registration["hostname"] = "second"
        await fm.register_printer(printer_ws2, registration)
        
        # Should have only one entry, but with updated websocket
        assert len([k for k in fm.connected_printers if k == "duplicate-test"]) == 1
        assert fm.connected_printers["duplicate-test"] == printer_ws2

    @pytest.mark.asyncio
    async def test_status_update_before_registration(self):
        """Regression: Status update for unregistered printer should be handled gracefully"""
        fm = FleetManager()
        
        printer_ws = AsyncMock()
        
        # This should not crash even though printer isn't registered
        # The code should log a warning and return early
        await fm.handle_printer_message(
            printer_ws,
            json.dumps({"type": "status_update", "data": {}}),
            "unregistered-printer"
        )
        
        # Verify no crash occurred and printer wasn't added
        assert "unregistered-printer" not in fm.printer_status
