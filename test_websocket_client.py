#!/usr/bin/env python3
"""
Test WebSocket client to verify fleet manager connectivity
"""
import asyncio
import json
import logging
import websockets
import ssl

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_web_client():
    """Test connecting as a web client"""
    uri = "wss://fleet.modovolo.com/ws/web/"
    
    # Create SSL context that doesn't verify certificates for testing
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    try:
        async with websockets.connect(uri, ssl=ssl_context) as websocket:
            logger.info("✓ Connected as web client")
            
            # Wait for initial fleet status message
            initial_message = await websocket.recv()
            data = json.loads(initial_message)
            logger.info(f"Received initial message: {data}")
            
            # Send a test message
            test_message = {
                "type": "test",
                "message": "Hello from test client"
            }
            await websocket.send(json.dumps(test_message))
            logger.info("✓ Sent test message")
            
    except Exception as e:
        logger.error(f"✗ Web client connection failed: {e}")

async def test_printer_client():
    """Test connecting as a printer"""
    uri = "wss://fleet.modovolo.com/ws/printer/"
    
    # Create SSL context that doesn't verify certificates for testing
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    try:
        async with websockets.connect(uri, ssl=ssl_context) as websocket:
            logger.info("✓ Connected as printer")
            
            # Send registration message
            registration = {
                "type": "register",
                "printer_id": "test-printer-001",
                "hostname": "test-printer",
                "ip": "192.168.1.100",
                "capabilities": ["print", "pause", "cancel"]
            }
            await websocket.send(json.dumps(registration))
            logger.info("✓ Sent registration")
            
            # Wait for registration response
            response = await websocket.recv()
            data = json.loads(response)
            logger.info(f"Registration response: {data}")
            
            # Send a status update
            status_update = {
                "type": "status_update",
                "data": {
                    "state": "idle",
                    "temperature": {"bed": 25, "extruder": 28}
                }
            }
            await websocket.send(json.dumps(status_update))
            logger.info("✓ Sent status update")
            
    except Exception as e:
        logger.error(f"✗ Printer client connection failed: {e}")

async def main():
    """Run both test clients"""
    logger.info("Starting WebSocket connectivity tests...")
    
    await asyncio.gather(
        test_web_client(),
        test_printer_client(),
        return_exceptions=True
    )
    
    logger.info("WebSocket tests completed")

if __name__ == "__main__":
    asyncio.run(main())