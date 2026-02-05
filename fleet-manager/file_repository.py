"""
Central File Repository API

Provides endpoints for managing shared G-Code files across the fleet:
- GET /api/files - List all files
- POST /api/files/upload - Upload files
- GET /api/files/download/:id - Download a file
- DELETE /api/files/:id - Delete a file
- POST /api/files/send - Send file to a printer
- GET /api/printers - List available printers for file sending
"""

import os
import uuid
import json
import logging
import aiohttp
from datetime import datetime
from typing import Dict, List, Optional, Any
from aiohttp import web
from functools import wraps

logger = logging.getLogger(__name__)

# Storage configuration
FILES_STORAGE_DIR = os.environ.get('FILES_STORAGE_DIR', '/data/files')
FILES_METADATA_FILE = os.path.join(FILES_STORAGE_DIR, 'metadata.json')


class FileRepository:
    """Manages the central file repository"""
    
    def __init__(self, storage_dir: str = FILES_STORAGE_DIR):
        self.storage_dir = storage_dir
        self.metadata_file = os.path.join(storage_dir, 'metadata.json')
        self._ensure_storage_dir()
        self.files: Dict[str, Dict[str, Any]] = self._load_metadata()
    
    def _ensure_storage_dir(self):
        """Create storage directory if it doesn't exist"""
        os.makedirs(self.storage_dir, exist_ok=True)
    
    def _load_metadata(self) -> Dict[str, Dict[str, Any]]:
        """Load file metadata from JSON file"""
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading metadata: {e}")
        return {}
    
    def _save_metadata(self):
        """Save file metadata to JSON file"""
        try:
            with open(self.metadata_file, 'w') as f:
                json.dump(self.files, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving metadata: {e}")
    
    def add_file(self, filename: str, size: int, user_id: str, username: str, 
                 version: str = None, category: str = None, print_time: str = None) -> Dict[str, Any]:
        """Add a file to the repository"""
        file_id = str(uuid.uuid4())
        file_info = {
            'id': file_id,
            'name': filename,
            'size': size,
            'uploadedAt': datetime.now().isoformat(),
            'uploadedBy': username,
            'userId': user_id,
            'version': version or '1.0',
            'category': category,  # e.g., 'propeller', 'truss', 'control-box', or None
            'printTime': print_time,
            'featured': category is not None,  # Auto-feature if category is set
            'storagePath': os.path.join(self.storage_dir, file_id)
        }
        self.files[file_id] = file_info
        self._save_metadata()
        return file_info
    
    def get_file(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file metadata by ID"""
        return self.files.get(file_id)
    
    def get_all_files(self) -> List[Dict[str, Any]]:
        """Get all files (without storage paths)"""
        return [
            {k: v for k, v in f.items() if k != 'storagePath'}
            for f in self.files.values()
        ]
    
    def delete_file(self, file_id: str) -> bool:
        """Delete a file from the repository"""
        if file_id not in self.files:
            return False
        
        file_info = self.files[file_id]
        storage_path = file_info.get('storagePath')
        
        # Delete the actual file
        if storage_path and os.path.exists(storage_path):
            try:
                os.remove(storage_path)
            except Exception as e:
                logger.error(f"Error deleting file {storage_path}: {e}")
        
        # Remove from metadata
        del self.files[file_id]
        self._save_metadata()
        return True
    
    def get_file_path(self, file_id: str) -> Optional[str]:
        """Get the storage path for a file"""
        file_info = self.files.get(file_id)
        if file_info:
            return file_info.get('storagePath')
        return None


# Global repository instance
file_repository: Optional[FileRepository] = None


def get_file_repository() -> FileRepository:
    """Get or create the file repository instance"""
    global file_repository
    if file_repository is None:
        file_repository = FileRepository()
    return file_repository


def setup_file_routes(app: web.Application, fleet_manager=None):
    """Setup file repository routes"""
    from routes.common import require_auth
    from services.database import DatabaseService
    
    repo = get_file_repository()
    
    @require_auth
    async def list_files(request: web.Request):
        """GET /api/files - List all files in repository"""
        files = repo.get_all_files()
        return web.json_response({'files': files})
    
    @require_auth
    async def upload_files(request: web.Request):
        """POST /api/files/upload - Upload files to repository"""
        user = request['user']
        user_id = user.get('user_id', user.get('sub', 'unknown'))
        username = user.get('email', user.get('username', 'Unknown'))
        
        try:
            reader = await request.multipart()
            uploaded_files = []
            
            # Metadata fields from form
            version = None
            category = None
            print_time = None
            file_contents = []  # Store files temporarily until we have all metadata
            
            async for field in reader:
                if field.name == 'version':
                    version = (await field.read()).decode('utf-8').strip() or None
                elif field.name == 'category':
                    category = (await field.read()).decode('utf-8').strip() or None
                elif field.name == 'printTime':
                    print_time = (await field.read()).decode('utf-8').strip() or None
                elif field.name == 'files':
                    filename = field.filename
                    if not filename:
                        continue
                    
                    # Sanitize filename
                    safe_filename = os.path.basename(filename)
                    
                    # Read file content
                    content = await field.read()
                    size = len(content)
                    
                    file_contents.append({
                        'filename': safe_filename,
                        'content': content,
                        'size': size
                    })
            
            # Now process all files with the collected metadata
            for file_data in file_contents:
                # Add to repository with metadata
                file_info = repo.add_file(
                    file_data['filename'], 
                    file_data['size'], 
                    user_id, 
                    username,
                    version=version,
                    category=category,
                    print_time=print_time
                )
                
                # Save file to storage
                storage_path = file_info['storagePath']
                with open(storage_path, 'wb') as f:
                    f.write(file_data['content'])
                
                uploaded_files.append({
                    'id': file_info['id'],
                    'name': file_info['name'],
                    'size': file_info['size'],
                    'version': file_info['version'],
                    'category': file_info['category']
                })
                
                logger.info(f"File uploaded: {file_data['filename']} v{version} ({category}) by {username}")
            
            return web.json_response({
                'success': True,
                'files': uploaded_files
            })
            
        except Exception as e:
            logger.error(f"Error uploading files: {e}")
            return web.json_response({
                'error': f'Upload failed: {str(e)}'
            }, status=500)
    
    @require_auth
    async def download_file(request: web.Request):
        """GET /api/files/download/:id - Download a file"""
        file_id = request.match_info.get('id')
        
        file_info = repo.get_file(file_id)
        if not file_info:
            return web.json_response({'error': 'File not found'}, status=404)
        
        storage_path = file_info.get('storagePath')
        if not storage_path or not os.path.exists(storage_path):
            return web.json_response({'error': 'File data not found'}, status=404)
        
        return web.FileResponse(
            storage_path,
            headers={
                'Content-Disposition': f'attachment; filename="{file_info["name"]}"'
            }
        )
    
    @require_auth
    async def delete_file(request: web.Request):
        """DELETE /api/files/:id - Delete a file"""
        file_id = request.match_info.get('id')
        user = request['user']
        
        file_info = repo.get_file(file_id)
        if not file_info:
            return web.json_response({'error': 'File not found'}, status=404)
        
        # Optional: Check if user owns the file or is admin
        # user_id = user.get('user_id', user.get('sub'))
        # if file_info.get('userId') != user_id and user.get('role') != 'admin':
        #     return web.json_response({'error': 'Permission denied'}, status=403)
        
        if repo.delete_file(file_id):
            logger.info(f"File deleted: {file_info['name']} by {user.get('email', 'unknown')}")
            return web.json_response({'success': True})
        else:
            return web.json_response({'error': 'Failed to delete file'}, status=500)
    
    @require_auth
    async def send_file_to_printer(request: web.Request):
        """POST /api/files/send - Send a file to a printer"""
        try:
            data = await request.json()
            file_id = data.get('fileId')
            printer_id = data.get('printerId')
            
            if not file_id or not printer_id:
                return web.json_response({
                    'error': 'fileId and printerId are required'
                }, status=400)
            
            file_info = repo.get_file(file_id)
            if not file_info:
                return web.json_response({'error': 'File not found'}, status=404)
            
            storage_path = file_info.get('storagePath')
            if not storage_path or not os.path.exists(storage_path):
                return web.json_response({'error': 'File data not found'}, status=404)
            
            # Check if printer is connected
            if fleet_manager and printer_id not in fleet_manager.connected_printers:
                return web.json_response({
                    'error': 'Printer not connected'
                }, status=400)
            
            # Read file content
            with open(storage_path, 'rb') as f:
                file_content = f.read()
            
            # Send upload command to printer via WebSocket
            if fleet_manager and printer_id in fleet_manager.connected_printers:
                import base64
                ws = fleet_manager.connected_printers[printer_id]
                
                # Send file upload command
                await ws.send(json.dumps({
                    'type': 'upload_file',
                    'filename': file_info['name'],
                    'content': base64.b64encode(file_content).decode('utf-8'),
                    'size': file_info['size']
                }))
                
                logger.info(f"File {file_info['name']} sent to printer {printer_id}")
                
                return web.json_response({
                    'success': True,
                    'message': f"File sent to printer"
                })
            else:
                return web.json_response({
                    'error': 'Printer not connected'
                }, status=400)
            
        except Exception as e:
            logger.error(f"Error sending file to printer: {e}")
            return web.json_response({
                'error': f'Failed to send file: {str(e)}'
            }, status=500)
    
    @require_auth
    async def list_printers(request: web.Request):
        """GET /api/printers - List available printers with status"""
        user = request['user']
        user_id = user.get('user_id', user.get('sub', 'unknown'))
        
        try:
            # Get printers from database (includes group printers)
            db: DatabaseService = request.app['db']
            printers = db.get_user_accessible_printers(user_id)
            
            # Add online status and print data from fleet manager
            printers_with_status = []
            for p in printers:
                printer_id = p.printer_id if hasattr(p, 'printer_id') else p.get('printer_id') or p.get('id')
                printer_name = p.name if hasattr(p, 'name') else p.get('name', 'Unknown')
                printer_group_id = p.group_id if hasattr(p, 'group_id') else p.get('group_id')
                printer_data = {
                    'id': printer_id,
                    'name': printer_name,
                    'groupId': printer_group_id,
                    'online': False,
                    'state': 'offline',
                    'progress': 0,
                    'eta': None,
                    'filename': None,
                }
                
                # Check if connected and get status
                if fleet_manager:
                    is_online = printer_id in fleet_manager.connected_printers
                    printer_data['online'] = is_online
                    
                    if is_online and printer_id in fleet_manager.printer_status:
                        status = fleet_manager.printer_status[printer_id]
                        printer_data_info = status.get('printer_data', {})
                        print_stats = printer_data_info.get('print_stats', {})
                        display_status = printer_data_info.get('display_status', {})
                        
                        # Get print state
                        state = print_stats.get('state', 'standby')
                        printer_data['state'] = state
                        
                        # Get filename
                        printer_data['filename'] = print_stats.get('filename', '')
                        
                        # Get progress (from display_status or calculate from print_stats)
                        if 'progress' in display_status:
                            printer_data['progress'] = display_status['progress']
                        elif print_stats.get('print_duration', 0) > 0:
                            # Can calculate from file position if available
                            pass
                        
                        # Calculate ETA
                        if state == 'printing' and printer_data['progress'] > 0:
                            print_duration = print_stats.get('print_duration', 0)
                            if print_duration > 0 and printer_data['progress'] > 0:
                                total_time = print_duration / printer_data['progress']
                                remaining = total_time - print_duration
                                # ETA as Unix timestamp
                                import time
                                printer_data['eta'] = int(time.time() + remaining) * 1000
                    else:
                        printer_data['state'] = 'offline'
                
                printers_with_status.append(printer_data)
            
            return web.json_response({'printers': printers_with_status})
            
        except Exception as e:
            logger.error(f"Error listing printers: {e}")
            return web.json_response({
                'error': f'Failed to list printers: {str(e)}'
            }, status=500)
    
    # Register routes
    app.router.add_get('/api/files', list_files)
    app.router.add_post('/api/files/upload', upload_files)
    app.router.add_get('/api/files/download/{id}', download_file)
    app.router.add_delete('/api/files/{id}', delete_file)
    app.router.add_post('/api/files/send', send_file_to_printer)
    app.router.add_get('/api/printers', list_printers)
    
    logger.info("File repository routes registered")
