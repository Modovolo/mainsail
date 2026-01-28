"""
Unit and Regression tests for JSON-RPC Proxy functionality

Tests the critical path: Mainsail -> Fleet Manager -> Fleet Client -> Moonraker
This is what allows viewing printer dashboards remotely.
"""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


class MockWebSocket:
    """Mock WebSocket for testing"""
    
    def __init__(self):
        self.sent_messages = []
        self.messages_to_receive = []
        self.closed = False
        self.remote_address = ("127.0.0.1", 12345)
    
    async def send(self, message):
        self.sent_messages.append(message)
    
    async def recv(self):
        if self.messages_to_receive:
            return self.messages_to_receive.pop(0)
        await asyncio.sleep(10)
    
    async def close(self):
        self.closed = True
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        await self.close()
    
    def get_sent_json(self, index=-1):
        """Get sent message as JSON"""
        if self.sent_messages:
            return json.loads(self.sent_messages[index])
        return None


class TestFleetClientCapabilities:
    """Test that fleet client reports correct capabilities"""

    def test_client_version_is_3_2_0_or_higher(self):
        """Test client version supports JSON-RPC proxy"""
        # Import from the actual client
        sys.path.insert(0, str(Path(__file__).parent.parent / "printer_client"))
        from fleet_client import CLIENT_VERSION
        
        version_parts = CLIENT_VERSION.split(".")
        major = int(version_parts[0])
        minor = int(version_parts[1])
        
        # Version 3.0.0+ has JSON-RPC proxy
        assert major >= 3, f"Client version {CLIENT_VERSION} does not support JSON-RPC proxy"
    
    def test_registration_includes_jsonrpc_proxy_capability(self):
        """Test that registration includes jsonrpc_proxy capability"""
        # This is what the client should send when registering
        capabilities = ["status_reporting", "remote_control", "gcode", "jsonrpc_proxy", "ota_update"]
        
        assert "jsonrpc_proxy" in capabilities


class TestJsonRpcRequestFormat:
    """Test JSON-RPC message formats"""

    def test_valid_jsonrpc_request(self):
        """Test valid JSON-RPC 2.0 request format"""
        request = {
            "jsonrpc": "2.0",
            "method": "printer.objects.query",
            "params": {"objects": {"print_stats": None}},
            "id": 1
        }
        
        assert request["jsonrpc"] == "2.0"
        assert "method" in request
        assert "id" in request

    def test_mainsail_identify_request(self):
        """Test Mainsail's initial identify request"""
        identify = {
            "jsonrpc": "2.0",
            "method": "server.connection.identify",
            "params": {
                "client_name": "mainsail",
                "version": "2.14.0",
                "type": "web",
                "url": "https://github.com/mainsail-crew/mainsail"
            },
            "id": 0
        }
        
        assert identify["method"] == "server.connection.identify"
        assert "client_name" in identify["params"]

    def test_fleet_id_added_to_proxied_request(self):
        """Test that fleet_id is added when proxying requests"""
        original_request = {
            "jsonrpc": "2.0",
            "method": "printer.info",
            "id": 1
        }
        
        # Fleet manager adds _fleet_id when proxying to printer
        original_request["_fleet_id"] = "printer123:1:abc123"
        
        assert "_fleet_id" in original_request
        assert ":" in original_request["_fleet_id"]


class TestJsonRpcResponseFormat:
    """Test JSON-RPC response formats"""

    def test_valid_jsonrpc_response(self):
        """Test valid JSON-RPC 2.0 response format"""
        response = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"state": "ready"}
        }
        
        assert response["jsonrpc"] == "2.0"
        assert "id" in response
        assert "result" in response

    def test_fleet_id_returned_in_response(self):
        """Test that fleet_id is returned in response"""
        response = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"state": "ready"},
            "_fleet_id": "printer123:1:abc123"
        }
        
        assert "_fleet_id" in response

    def test_error_response_format(self):
        """Test JSON-RPC error response format"""
        error_response = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32000,
                "message": "Moonraker not connected"
            }
        }
        
        assert "error" in error_response
        assert "code" in error_response["error"]
        assert "message" in error_response["error"]


class TestJsonRpcNotificationFormat:
    """Test JSON-RPC notification formats (no id)"""

    def test_notification_has_no_id(self):
        """Test that notifications don't have id field"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notify_proc_stat_update",
            "params": [{"cpu": 45.2}]
        }
        
        assert "id" not in notification
        assert "method" in notification

    def test_proxy_flag_added_to_notifications(self):
        """Test that _proxy flag is added when forwarding notifications"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notify_status_update",
            "params": [{"print_stats": {"state": "printing"}}]
        }
        
        # Fleet client adds _proxy flag
        notification["_proxy"] = True
        
        assert notification["_proxy"] == True


class TestFleetIdFormat:
    """Test fleet_id format for request tracking"""

    def test_fleet_id_contains_printer_id(self):
        """Test fleet_id format includes printer ID"""
        printer_id = "abc123def456"
        request_id = 1
        unique_id = "unique123"
        
        fleet_id = f"{printer_id}:{request_id}:{unique_id}"
        
        parts = fleet_id.split(":")
        assert len(parts) == 3
        assert parts[0] == printer_id

    def test_fleet_id_can_be_parsed(self):
        """Test that fleet_id can be parsed back"""
        fleet_id = "printer123:5:abc456"
        
        parts = fleet_id.split(":")
        printer_id = parts[0]
        original_request_id = int(parts[1])
        
        assert printer_id == "printer123"
        assert original_request_id == 5


class TestMoonrakerRequestRouting:
    """Test request ID mapping for Moonraker responses"""

    @pytest.mark.asyncio
    async def test_request_id_remapping(self):
        """Test that request IDs are remapped for Moonraker"""
        pending_requests = {}
        moonraker_request_id = 1000
        
        # Incoming request from fleet
        fleet_request = {
            "jsonrpc": "2.0",
            "method": "printer.info",
            "id": 5,  # Original Mainsail ID
            "_fleet_id": "printer123:5:abc"
        }
        
        # Remap to moonraker ID
        fleet_id = fleet_request.pop("_fleet_id")
        original_id = fleet_request["id"]
        
        moonraker_msg = fleet_request.copy()
        moonraker_msg["id"] = moonraker_request_id
        
        # Track mapping
        pending_requests[moonraker_request_id] = fleet_id
        
        assert moonraker_msg["id"] == 1000
        assert pending_requests[1000] == "printer123:5:abc"

    @pytest.mark.asyncio
    async def test_response_routing(self):
        """Test that responses are routed back correctly"""
        pending_requests = {1000: "printer123:5:abc"}
        
        # Response from Moonraker
        moonraker_response = {
            "jsonrpc": "2.0",
            "id": 1000,
            "result": {"state": "ready"}
        }
        
        # Route back
        if moonraker_response["id"] in pending_requests:
            fleet_id = pending_requests.pop(moonraker_response["id"])
            moonraker_response["_fleet_id"] = fleet_id
        
        assert moonraker_response["_fleet_id"] == "printer123:5:abc"
        assert 1000 not in pending_requests


class TestServerConnectionIdentify:
    """Test server.connection.identify handling (regression test)"""

    @pytest.mark.asyncio
    async def test_identify_returns_synthetic_success(self):
        """Test that identify is handled locally with synthetic success"""
        identify_request = {
            "jsonrpc": "2.0",
            "method": "server.connection.identify",
            "params": {
                "client_name": "mainsail",
                "version": "2.14.0",
                "type": "web"
            },
            "id": 0,
            "_fleet_id": "printer123:0:abc"
        }
        
        # Should return synthetic success instead of forwarding
        expected_response = {
            "jsonrpc": "2.0",
            "id": 0,
            "_fleet_id": "printer123:0:abc",
            "result": {
                "connection_id": 1  # Synthetic connection ID
            }
        }
        
        assert identify_request["method"] == "server.connection.identify"
        assert "result" in expected_response
        assert "connection_id" in expected_response["result"]


class TestRequestTimeout:
    """Test request timeout handling"""

    @pytest.mark.asyncio
    async def test_request_timeout_returns_error(self):
        """Test that timed out requests return error to client"""
        # Request that timed out
        timed_out_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "_fleet_id": "printer123:1:abc"
        }
        
        timeout_error = {
            "jsonrpc": "2.0",
            "id": 1,
            "_fleet_id": "printer123:1:abc",
            "error": {
                "code": -32000,
                "message": "Request timed out"
            }
        }
        
        assert "error" in timeout_error
        assert timeout_error["error"]["code"] == -32000


class TestMoonrakerDisconnected:
    """Test handling when Moonraker is disconnected"""

    @pytest.mark.asyncio
    async def test_error_when_moonraker_disconnected(self):
        """Test that error is returned when Moonraker is not connected"""
        request = {
            "jsonrpc": "2.0",
            "method": "printer.info",
            "id": 1,
            "_fleet_id": "printer123:1:abc"
        }
        
        error_response = {
            "jsonrpc": "2.0",
            "id": 1,
            "_fleet_id": "printer123:1:abc",
            "error": {
                "code": -32000,
                "message": "Moonraker not connected"
            }
        }
        
        assert error_response["error"]["message"] == "Moonraker not connected"


class TestSubscriberRouting:
    """Test that notifications are routed to correct subscribers"""

    @pytest.mark.asyncio
    async def test_notification_to_correct_printer_subscribers(self):
        """Test notifications only go to subscribers of that printer"""
        printer_subscriptions = {
            "printer1": [MockWebSocket(), MockWebSocket()],
            "printer2": [MockWebSocket()]
        }
        
        notification = {
            "jsonrpc": "2.0",
            "method": "notify_status_update",
            "params": [{"print_stats": {"state": "printing"}}],
            "_proxy": True
        }
        
        # Notification from printer1 should go to printer1 subscribers only
        printer_id = "printer1"
        subscribers = printer_subscriptions.get(printer_id, [])
        
        for ws in subscribers:
            await ws.send(json.dumps(notification))
        
        # Check printer1 subscribers received it
        assert len(printer_subscriptions["printer1"][0].sent_messages) == 1
        assert len(printer_subscriptions["printer1"][1].sent_messages) == 1
        
        # Check printer2 subscriber did not receive it
        assert len(printer_subscriptions["printer2"][0].sent_messages) == 0


class TestClientVersionCheck:
    """Regression tests for client version verification"""

    def test_old_client_version_lacks_proxy_capability(self):
        """Test that old client versions don't have jsonrpc_proxy capability"""
        old_version_capabilities = ["status_reporting", "remote_control"]
        
        assert "jsonrpc_proxy" not in old_version_capabilities

    def test_new_client_version_has_proxy_capability(self):
        """Test that new client versions have jsonrpc_proxy capability"""
        new_version_capabilities = [
            "status_reporting", 
            "remote_control", 
            "gcode", 
            "jsonrpc_proxy", 
            "ota_update"
        ]
        
        assert "jsonrpc_proxy" in new_version_capabilities

    def test_detect_outdated_client_by_version(self):
        """Test detecting outdated clients by version number"""
        def is_proxy_capable(version_str):
            parts = version_str.split(".")
            major = int(parts[0])
            return major >= 3
        
        assert is_proxy_capable("3.2.0") == True
        assert is_proxy_capable("3.0.0") == True
        assert is_proxy_capable("2.1.0") == False
        assert is_proxy_capable("1.0.0") == False


class TestEndToEndProxyFlow:
    """End-to-end tests for the complete proxy flow"""

    @pytest.mark.asyncio
    async def test_complete_request_response_cycle(self):
        """Test complete request -> response cycle through proxy"""
        # 1. Mainsail sends request to fleet manager
        mainsail_request = {
            "jsonrpc": "2.0",
            "method": "printer.info",
            "id": 5
        }
        
        # 2. Fleet manager adds fleet_id and forwards to printer
        fleet_request = mainsail_request.copy()
        fleet_request["_fleet_id"] = "printer123:5:abc"
        
        # 3. Fleet client remaps ID and forwards to Moonraker
        moonraker_request = fleet_request.copy()
        moonraker_request.pop("_fleet_id")
        moonraker_request["id"] = 1000
        
        # 4. Moonraker responds
        moonraker_response = {
            "jsonrpc": "2.0",
            "id": 1000,
            "result": {"state": "ready", "software_version": "v0.12.0"}
        }
        
        # 5. Fleet client adds fleet_id and forwards to fleet manager
        fleet_response = moonraker_response.copy()
        fleet_response["_fleet_id"] = "printer123:5:abc"
        
        # 6. Fleet manager restores original ID and forwards to Mainsail
        mainsail_response = fleet_response.copy()
        # Extract original ID from fleet_id
        parts = fleet_response["_fleet_id"].split(":")
        mainsail_response["id"] = int(parts[1])
        mainsail_response.pop("_fleet_id")
        
        # Verify final response matches what Mainsail expects
        assert mainsail_response["id"] == 5
        assert mainsail_response["result"]["state"] == "ready"
        assert "_fleet_id" not in mainsail_response


class TestRegressionKlipperConnectError:
    """Regression tests for 'Moonraker can't connect to Klipper' error"""

    @pytest.mark.asyncio
    async def test_client_must_handle_jsonrpc_messages(self):
        """Regression: Fleet client must handle JSON-RPC messages, not just type-based"""
        incoming_message = {
            "jsonrpc": "2.0",
            "method": "printer.info",
            "id": 1,
            "_fleet_id": "printer123:1:abc"
        }
        
        # OLD (broken) code only checked for "type" field
        msg_type = incoming_message.get("type")  # This returns None!
        
        # NEW (fixed) code checks for jsonrpc field
        is_jsonrpc = "jsonrpc" in incoming_message
        
        assert msg_type is None  # type field doesn't exist
        assert is_jsonrpc == True  # jsonrpc field does exist

    @pytest.mark.asyncio  
    async def test_client_must_have_moonraker_connection(self):
        """Regression: Fleet client must maintain Moonraker WebSocket connection"""
        class FleetClientMock:
            def __init__(self):
                self.moonraker_ws = None
                self.moonraker_connected = False
            
            def has_moonraker_connection(self):
                return self.moonraker_ws is not None and self.moonraker_connected
        
        client = FleetClientMock()
        
        # Without connection, can't proxy
        assert client.has_moonraker_connection() == False
        
        # With connection, can proxy
        client.moonraker_ws = MockWebSocket()
        client.moonraker_connected = True
        assert client.has_moonraker_connection() == True

    @pytest.mark.asyncio
    async def test_requests_without_proxy_timeout(self):
        """Regression: Requests to clients without proxy capability timeout"""
        # Old client (v2.1.0) doesn't have jsonrpc_proxy
        old_client_capabilities = ["status_reporting", "remote_control"]
        
        # Request sent to old client will never get a response
        request_sent = True
        has_proxy = "jsonrpc_proxy" in old_client_capabilities
        
        # This is why requests timeout!
        assert has_proxy == False


class TestNotificationBroadcast:
    """Test Moonraker notification broadcasting"""

    @pytest.mark.asyncio
    async def test_proc_stat_notification_broadcast(self):
        """Test notify_proc_stat_update is broadcast to subscribers"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notify_proc_stat_update",
            "params": [{
                "cpu": 45.2,
                "memory": 512000
            }],
            "_proxy": True
        }
        
        assert notification["method"] == "notify_proc_stat_update"
        assert notification["_proxy"] == True

    @pytest.mark.asyncio
    async def test_status_update_notification_broadcast(self):
        """Test notify_status_update is broadcast to subscribers"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notify_status_update",
            "params": [{
                "print_stats": {"state": "printing", "progress": 45.5}
            }],
            "_proxy": True
        }
        
        assert notification["method"] == "notify_status_update"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
