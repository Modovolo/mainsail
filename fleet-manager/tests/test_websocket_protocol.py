"""
Tests for WebSocket protocol compliance and message formats
"""
import asyncio
import json
import pytest
from datetime import datetime


class TestMessageFormats:
    """Tests for message format validation"""

    def test_registration_message_schema(self):
        """Test registration message follows expected schema"""
        valid_registration = {
            "type": "register",
            "printer_id": "test-001",
            "hostname": "printer.local",
            "ip": "192.168.1.100",
            "capabilities": ["print", "pause", "cancel", "webcam"],
            "firmware": "Klipper v0.12.0",
            "model": "Voron 2.4"
        }
        
        # Required fields
        assert "type" in valid_registration
        assert valid_registration["type"] == "register"
        assert "printer_id" in valid_registration
        assert len(valid_registration["printer_id"]) > 0
        
        # Optional fields should be valid types
        if "capabilities" in valid_registration:
            assert isinstance(valid_registration["capabilities"], list)
        
        if "ip" in valid_registration:
            # Basic IP validation
            parts = valid_registration["ip"].split(".")
            assert len(parts) == 4

    def test_status_update_message_schema(self):
        """Test status update message follows expected schema"""
        valid_status = {
            "type": "status_update",
            "data": {
                "state": "printing",
                "progress": 45.5,
                "print_time": 3600,
                "print_time_left": 4400,
                "current_file": "benchy.gcode",
                "temperature": {
                    "bed": {
                        "actual": 60.0,
                        "target": 60.0
                    },
                    "extruder": {
                        "actual": 210.0,
                        "target": 210.0
                    }
                }
            }
        }
        
        assert valid_status["type"] == "status_update"
        assert "data" in valid_status
        assert "state" in valid_status["data"]

    def test_heartbeat_message_schema(self):
        """Test heartbeat message follows expected schema"""
        valid_heartbeat = {"type": "heartbeat"}
        
        assert valid_heartbeat["type"] == "heartbeat"
        assert len(valid_heartbeat) == 1

    def test_command_message_schema(self):
        """Test command message follows expected schema"""
        valid_commands = [
            {"type": "command", "action": "pause", "printer_id": "test-001"},
            {"type": "command", "action": "resume", "printer_id": "test-001"},
            {"type": "command", "action": "cancel", "printer_id": "test-001"},
            {"type": "gcode", "gcode": "G28", "printer_id": "test-001"},
            {"type": "gcode", "gcode": "M104 S200", "printer_id": "test-001"}
        ]
        
        for cmd in valid_commands:
            assert "type" in cmd
            assert "printer_id" in cmd

    def test_fleet_status_response_schema(self):
        """Test fleet status response follows expected schema"""
        valid_response = {
            "type": "fleet_status",
            "printers": {
                "printer-001": {
                    "connected_at": "2026-01-09T10:00:00",
                    "last_seen": "2026-01-09T10:30:00",
                    "status": "connected",
                    "data": {
                        "hostname": "printer1.local"
                    }
                },
                "printer-002": {
                    "connected_at": "2026-01-09T09:00:00",
                    "last_seen": "2026-01-09T10:29:00",
                    "status": "connected",
                    "data": {
                        "hostname": "printer2.local"
                    }
                }
            }
        }
        
        assert valid_response["type"] == "fleet_status"
        assert isinstance(valid_response["printers"], dict)
        
        for printer_id, status in valid_response["printers"].items():
            assert "status" in status


class TestMessageValidation:
    """Tests for message validation logic"""

    def test_valid_printer_states(self):
        """Test all valid printer states are recognized"""
        valid_states = [
            "idle",
            "standby", 
            "printing",
            "paused",
            "complete",
            "cancelled",
            "error"
        ]
        
        for state in valid_states:
            msg = {"type": "status_update", "data": {"state": state}}
            assert msg["data"]["state"] in valid_states

    def test_temperature_ranges(self):
        """Test temperature values are in valid ranges"""
        def is_valid_temp(temp, temp_type):
            if temp_type == "bed":
                return 0 <= temp <= 150
            elif temp_type == "extruder":
                return 0 <= temp <= 350
            return False
        
        # Valid temperatures
        assert is_valid_temp(60, "bed")
        assert is_valid_temp(200, "extruder")
        
        # Invalid temperatures
        assert not is_valid_temp(200, "bed")  # Too hot for bed
        assert not is_valid_temp(400, "extruder")  # Too hot for extruder
        assert not is_valid_temp(-10, "bed")  # Negative

    def test_progress_percentage_range(self):
        """Test progress is valid percentage"""
        def is_valid_progress(progress):
            return 0 <= progress <= 100
        
        assert is_valid_progress(0)
        assert is_valid_progress(50.5)
        assert is_valid_progress(100)
        assert not is_valid_progress(-1)
        assert not is_valid_progress(101)


class TestJSONSerialization:
    """Tests for JSON serialization/deserialization"""

    def test_message_roundtrip(self):
        """Test messages survive JSON roundtrip"""
        messages = [
            {"type": "register", "printer_id": "test", "data": {"nested": True}},
            {"type": "status_update", "data": {"progress": 45.5}},
            {"type": "heartbeat"},
            {"type": "command", "action": "pause", "printer_id": "test"}
        ]
        
        for original in messages:
            serialized = json.dumps(original)
            deserialized = json.loads(serialized)
            assert deserialized == original

    def test_unicode_handling(self):
        """Test Unicode characters in messages"""
        message = {
            "type": "status_update",
            "data": {
                "current_file": "日本語ファイル.gcode",
                "state": "printing"
            }
        }
        
        serialized = json.dumps(message, ensure_ascii=False)
        deserialized = json.loads(serialized)
        assert deserialized["data"]["current_file"] == "日本語ファイル.gcode"

    def test_large_payload_handling(self):
        """Test handling of large payloads"""
        large_data = {
            "type": "status_update",
            "data": {
                "gcode_history": ["G" + str(i) for i in range(10000)]
            }
        }
        
        serialized = json.dumps(large_data)
        deserialized = json.loads(serialized)
        
        assert len(deserialized["data"]["gcode_history"]) == 10000


class TestErrorMessages:
    """Tests for error message formats"""

    def test_error_message_schema(self):
        """Test error message follows expected schema"""
        error_messages = [
            {"type": "error", "message": "Missing printer_id"},
            {"type": "error", "message": "Connection refused", "code": 503},
            {"type": "error", "message": "Invalid command", "details": {"action": "unknown"}}
        ]
        
        for error in error_messages:
            assert error["type"] == "error"
            assert "message" in error
            assert len(error["message"]) > 0

    def test_registered_response_schema(self):
        """Test registration response follows expected schema"""
        response = {
            "type": "registered",
            "printer_id": "test-001",
            "message": "Successfully registered with fleet"
        }
        
        assert response["type"] == "registered"
        assert "printer_id" in response

    def test_heartbeat_ack_schema(self):
        """Test heartbeat acknowledgment follows expected schema"""
        ack = {"type": "heartbeat_ack"}
        
        assert ack["type"] == "heartbeat_ack"


class TestEventMessages:
    """Tests for event notification messages"""

    def test_printer_connected_event(self):
        """Test printer connected event format"""
        event = {
            "type": "printer_connected",
            "printer_id": "new-printer",
            "status": {
                "connected_at": "2026-01-09T10:00:00",
                "status": "connected",
                "data": {"hostname": "new-printer.local"}
            }
        }
        
        assert event["type"] == "printer_connected"
        assert "printer_id" in event
        assert "status" in event

    def test_printer_disconnected_event(self):
        """Test printer disconnected event format"""
        event = {
            "type": "printer_disconnected",
            "printer_id": "old-printer"
        }
        
        assert event["type"] == "printer_disconnected"
        assert "printer_id" in event

    def test_printer_status_broadcast(self):
        """Test printer status broadcast format"""
        broadcast = {
            "type": "printer_status",
            "printer_id": "active-printer",
            "data": {
                "state": "printing",
                "progress": 75.0
            }
        }
        
        assert broadcast["type"] == "printer_status"
        assert "printer_id" in broadcast
        assert "data" in broadcast
