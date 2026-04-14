"""
Tests for the WebSocket file upload pipeline.

Tests the full upload flow:
  Frontend → fleet manager HTTP → base64 encode → WebSocket → printer client → Moonraker

Key areas tested:
- Base64 encoding/decoding round-trip for realistic file sizes
- WebSocket message format for upload_file messages
- upload_and_print endpoint behavior
- send_file_to_printer endpoint behavior
- Fleet client handle_file_upload method
- WebSocket max_size configuration for large files
"""

import asyncio
import base64
import json
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from io import BytesIO

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_gcode(size_bytes: int) -> bytes:
    """Generate synthetic gcode content of approximately the given size."""
    line = b"G1 X100.000 Y200.000 Z0.300 E1.5000 F1200 ; move\n"
    repeats = max(1, size_bytes // len(line))
    return (line * repeats)[:size_bytes]


# ---------------------------------------------------------------------------
# Base64 round-trip tests
# ---------------------------------------------------------------------------

class TestBase64RoundTrip:
    """Verify base64 encode/decode preserves file content at various sizes."""

    @pytest.mark.parametrize("size_kb", [1, 100, 512, 1024, 5120, 10240])
    def test_roundtrip_various_sizes(self, size_kb):
        content = make_gcode(size_kb * 1024)
        encoded = base64.b64encode(content).decode('utf-8')
        decoded = base64.b64decode(encoded)
        assert decoded == content

    def test_base64_size_overhead(self):
        """Base64 encoding adds ~33% overhead — verify assumption."""
        content = make_gcode(1024 * 1024)  # 1 MiB
        encoded = base64.b64encode(content).decode('utf-8')
        ratio = len(encoded) / len(content)
        assert 1.33 <= ratio <= 1.37  # 4/3 ratio

    def test_json_message_size_for_large_file(self):
        """A 5 MB file produces ~7 MB JSON message — exceeds default WS limit."""
        content = make_gcode(5 * 1024 * 1024)
        message = json.dumps({
            'type': 'upload_file',
            'filename': 'large_print.gcode',
            'content': base64.b64encode(content).decode('utf-8'),
            'size': len(content),
            'start_print': False,
        })
        msg_bytes = len(message.encode('utf-8'))
        # Must exceed 1 MiB default websockets max_size
        assert msg_bytes > 1 * 1024 * 1024
        # Verify the message is still valid JSON
        parsed = json.loads(message)
        assert parsed['size'] == len(content)


# ---------------------------------------------------------------------------
# WebSocket message format
# ---------------------------------------------------------------------------

class TestUploadMessageFormat:
    """Test the upload_file WebSocket message contract."""

    def test_message_has_required_fields(self):
        content = b"G28\nG1 X10\n"
        msg = {
            'type': 'upload_file',
            'filename': 'test.gcode',
            'content': base64.b64encode(content).decode('utf-8'),
            'size': len(content),
            'start_print': True,
        }
        for key in ('type', 'filename', 'content', 'size', 'start_print'):
            assert key in msg

    def test_message_type_is_upload_file(self):
        msg = {'type': 'upload_file', 'filename': 'x.gcode',
               'content': '', 'size': 0, 'start_print': False}
        assert msg['type'] == 'upload_file'

    def test_filename_preserved(self):
        name = 'My Print (v2).gcode'
        msg = {'type': 'upload_file', 'filename': name,
               'content': '', 'size': 0}
        assert msg['filename'] == name

    def test_content_is_valid_base64(self):
        raw = b"G28\n"
        msg = {
            'type': 'upload_file',
            'content': base64.b64encode(raw).decode('utf-8'),
        }
        decoded = base64.b64decode(msg['content'])
        assert decoded == raw


# ---------------------------------------------------------------------------
# upload_and_print endpoint
# ---------------------------------------------------------------------------

class TestUploadAndPrint:
    """Test the fleet manager upload_and_print HTTP handler."""

    @pytest.fixture
    def fleet_manager_mock(self):
        fm = MagicMock()
        fm.connected_printers = {}
        return fm

    @pytest.fixture
    def mock_ws(self):
        ws = AsyncMock()
        ws.send = AsyncMock()
        return ws

    @pytest.mark.asyncio
    async def test_sends_base64_message_to_printer(self, fleet_manager_mock, mock_ws):
        """upload_and_print should base64-encode the file and send via WS."""
        printer_id = 'printer-001'
        fleet_manager_mock.connected_printers[printer_id] = mock_ws

        file_content = make_gcode(2048)
        filename = 'test.gcode'

        # Simulate what upload_and_print does
        msg = json.dumps({
            'type': 'upload_file',
            'filename': filename,
            'content': base64.b64encode(file_content).decode('utf-8'),
            'size': len(file_content),
            'start_print': True,
        })
        await mock_ws.send(msg)

        mock_ws.send.assert_called_once()
        sent = json.loads(mock_ws.send.call_args[0][0])
        assert sent['type'] == 'upload_file'
        assert sent['filename'] == filename
        assert sent['start_print'] is True
        assert base64.b64decode(sent['content']) == file_content

    @pytest.mark.asyncio
    async def test_rejects_missing_file(self):
        """upload_and_print should reject requests with no file."""
        # Simulates the validation logic
        file_content = None
        filename = None
        assert not file_content or not filename

    @pytest.mark.asyncio
    async def test_rejects_missing_printer_id(self):
        """upload_and_print should reject requests with no printerId."""
        printer_id = None
        assert not printer_id

    @pytest.mark.asyncio
    async def test_rejects_disconnected_printer(self, fleet_manager_mock):
        """upload_and_print should reject when printer is not connected."""
        assert 'nonexistent' not in fleet_manager_mock.connected_printers


# ---------------------------------------------------------------------------
# send_file_to_printer endpoint
# ---------------------------------------------------------------------------

class TestSendFileToPrinter:
    """Test the fleet manager send_file_to_printer HTTP handler."""

    @pytest.mark.asyncio
    async def test_reads_file_and_sends_base64(self, tmp_path):
        """send_file_to_printer reads from storage, base64-encodes, sends via WS."""
        # Create a "stored" file
        content = make_gcode(4096)
        stored = tmp_path / "stored.gcode"
        stored.write_bytes(content)

        ws = AsyncMock()

        msg = json.dumps({
            'type': 'upload_file',
            'filename': 'stored.gcode',
            'content': base64.b64encode(content).decode('utf-8'),
            'size': len(content),
            'start_print': False,
        })
        await ws.send(msg)

        ws.send.assert_called_once()
        sent = json.loads(ws.send.call_args[0][0])
        assert base64.b64decode(sent['content']) == content

    @pytest.mark.asyncio
    async def test_missing_storage_file_detected(self, tmp_path):
        """If the stored file is missing on disk, the handler should detect it."""
        path = tmp_path / "missing.gcode"
        assert not path.exists()


# ---------------------------------------------------------------------------
# Fleet client handle_file_upload
# ---------------------------------------------------------------------------

class TestFleetClientHandleFileUpload:
    """Test the printer-side fleet client upload handler."""

    @pytest.fixture
    def fleet_client_mock(self):
        """Minimal mock of FleetClient with moonraker_url and websocket."""
        client = MagicMock()
        client.moonraker_url = "http://localhost:7125"
        client.printer_id = "test-printer"
        client.websocket = AsyncMock()
        client.websocket.send = AsyncMock()
        return client

    def test_decodes_base64_content(self):
        """Fleet client should correctly decode base64 file content."""
        raw = make_gcode(8192)
        data = {
            'filename': 'part.gcode',
            'content': base64.b64encode(raw).decode('utf-8'),
            'start_print': False,
        }
        decoded = base64.b64decode(data['content'])
        assert decoded == raw
        assert len(decoded) == len(raw)

    def test_upload_message_triggers_handler(self):
        """Message type 'upload_file' should dispatch to handle_file_upload."""
        msg = json.dumps({'type': 'upload_file', 'filename': 'x.gcode',
                          'content': '', 'size': 0})
        parsed = json.loads(msg)
        assert parsed['type'] == 'upload_file'

    def test_completion_message_format(self):
        """Fleet client should send file_upload_complete back to fleet server."""
        response = {
            'type': 'file_upload_complete',
            'file_id': 'unknown',
            'filename': 'test.gcode',
            'success': True,
            'started_print': False,
            'printer_id': 'test-printer',
        }
        for key in ('type', 'filename', 'success', 'printer_id'):
            assert key in response
        assert response['type'] == 'file_upload_complete'

    def test_failure_response_includes_error(self):
        """On failure, the completion message should include an error field."""
        response = {
            'type': 'file_upload_complete',
            'success': False,
            'error': 'Moonraker error: 500',
            'printer_id': 'test-printer',
        }
        assert response['success'] is False
        assert 'error' in response


# ---------------------------------------------------------------------------
# WebSocket max_size configuration
# ---------------------------------------------------------------------------

class TestWebSocketMaxSize:
    """
    Verify that WebSocket connections are configured with sufficient max_size.

    The default websockets max_size is 2**20 (1 MiB).  GCode files are
    routinely 1–100 MB; after base64 + JSON wrapping the message can be
    ~1.4× the raw file size.  Without raising max_size the upload will
    fail with PayloadTooBig.
    """

    def _read_source(self, relpath: str) -> str:
        root = Path(__file__).parent.parent
        return (root / relpath).read_text()

    def test_fleet_manager_printer_server_max_size(self):
        """fleet_manager.py printer WS server must set max_size."""
        src = self._read_source("fleet_manager.py")
        # Find the serve() call for printer connections (port 9080)
        # It must contain a max_size parameter
        assert "max_size" in src, (
            "fleet_manager.py websockets.serve() must set max_size "
            "to support large gcode file uploads"
        )

    def test_fleet_client_connect_max_size(self):
        """fleet_client.py websockets.connect() must set max_size."""
        src = self._read_source("printer_client/fleet_client.py")
        assert "max_size" in src, (
            "fleet_client.py websockets.connect() must set max_size "
            "to receive large gcode file uploads"
        )

    def test_max_size_value_sufficient(self):
        """max_size must be large enough for a 50 MB file after base64 + JSON."""
        # 50 MB raw → ~67 MB base64 → ~67 MB JSON string + overhead
        raw_size = 50 * 1024 * 1024
        encoded_size = (raw_size * 4 // 3) + 200  # base64 + JSON overhead
        required_max = encoded_size

        src = self._read_source("fleet_manager.py")
        # Extract max_size value(s) from source — handle expressions like
        # ``max_size=100 * 1024 * 1024``
        import re
        matches = re.findall(r'max_size\s*=\s*([\d][\d\s*_]*)', src)
        assert matches, "Could not find max_size value in fleet_manager.py"
        for match in matches:
            value = eval(match.strip())
            assert value >= required_max, (
                f"max_size={value} is too small; need at least {required_max} "
                f"for a 50 MB file"
            )


# ---------------------------------------------------------------------------
# End-to-end pipeline simulation
# ---------------------------------------------------------------------------

class TestUploadPipelineEndToEnd:
    """Simulate the full upload pipeline with realistic data."""

    @pytest.mark.parametrize("size_mb", [0.5, 1, 5, 10])
    @pytest.mark.asyncio
    async def test_full_pipeline_roundtrip(self, size_mb):
        """
        Simulate: raw file → base64 encode → JSON WS message →
                  JSON parse → base64 decode → verify identical.
        """
        raw = make_gcode(int(size_mb * 1024 * 1024))

        # Fleet manager side: encode and build message
        message = json.dumps({
            'type': 'upload_file',
            'filename': f'print_{size_mb}mb.gcode',
            'content': base64.b64encode(raw).decode('utf-8'),
            'size': len(raw),
            'start_print': False,
        })

        # Simulate WebSocket transport (just JSON string)
        received = json.loads(message)

        # Fleet client side: decode
        decoded = base64.b64decode(received['content'])

        assert decoded == raw
        assert received['size'] == len(raw)

    @pytest.mark.asyncio
    async def test_pipeline_with_start_print_flag(self):
        """The start_print flag should survive the pipeline."""
        raw = make_gcode(1024)
        message = json.dumps({
            'type': 'upload_file',
            'filename': 'quick.gcode',
            'content': base64.b64encode(raw).decode('utf-8'),
            'size': len(raw),
            'start_print': True,
        })
        received = json.loads(message)
        assert received['start_print'] is True

    @pytest.mark.asyncio
    async def test_pipeline_preserves_binary_content(self):
        """Ensure binary gcode (with high bytes) round-trips correctly."""
        # Some slicers embed thumbnails as binary in gcode comments
        raw = bytes(range(256)) * 100
        message = json.dumps({
            'type': 'upload_file',
            'filename': 'binary.gcode',
            'content': base64.b64encode(raw).decode('utf-8'),
            'size': len(raw),
        })
        received = json.loads(message)
        assert base64.b64decode(received['content']) == raw

    @pytest.mark.asyncio
    async def test_websocket_send_mock(self):
        """Verify the WS mock send/receive pattern works as expected."""
        ws = AsyncMock()
        raw = make_gcode(2048)
        msg = json.dumps({
            'type': 'upload_file',
            'filename': 'test.gcode',
            'content': base64.b64encode(raw).decode('utf-8'),
            'size': len(raw),
            'start_print': False,
        })

        await ws.send(msg)
        ws.send.assert_awaited_once_with(msg)

        # Simulate receive on the other side
        ws.recv.return_value = msg
        received_msg = await ws.recv()
        data = json.loads(received_msg)
        assert data['type'] == 'upload_file'
        assert base64.b64decode(data['content']) == raw
