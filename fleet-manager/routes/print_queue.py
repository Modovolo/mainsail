"""
Print Queue Routes
"""
import logging

from aiohttp import web

from services.database import DatabaseService
from routes.common import require_auth

logger = logging.getLogger(__name__)


def get_real_time_printer_status(fleet_manager, printer_id: str) -> dict:
    """Get real-time printer status from fleet manager"""
    if not fleet_manager:
        return {'online': False, 'state': 'offline', 'progress': 0}
    
    is_online = printer_id in fleet_manager.connected_printers
    status_data = fleet_manager.printer_status.get(printer_id, {})
    printer_data = status_data.get('printer_data', {})
    print_stats = printer_data.get('print_stats', {})
    display_status = printer_data.get('display_status', {})
    
    # Get state from Klipper print_stats
    state = print_stats.get('state', 'standby')
    if not is_online:
        state = 'offline'
    
    # Get progress from display_status
    progress = display_status.get('progress', 0)
    if isinstance(progress, float):
        progress = int(progress * 100)
    
    # Get filename
    filename = print_stats.get('filename', '')
    
    # Calculate time remaining
    time_remaining = None
    print_duration = print_stats.get('print_duration', 0)
    if state == 'printing' and progress > 0 and print_duration > 0:
        total_time = print_duration / (progress / 100) if progress > 0 else 0
        remaining_seconds = total_time - print_duration
        if remaining_seconds > 0:
            hours = int(remaining_seconds // 3600)
            minutes = int((remaining_seconds % 3600) // 60)
            if hours > 0:
                time_remaining = f"{hours}h {minutes}m"
            else:
                time_remaining = f"{minutes}m"
    
    return {
        'online': is_online,
        'state': state,
        'progress': progress,
        'filename': filename,
        'timeRemaining': time_remaining,
        'printDuration': print_stats.get('print_duration', 0),
        'totalDuration': print_stats.get('total_duration', 0),
    }


@require_auth
async def get_print_queue(request: web.Request):
    """Get the print queue status with real-time printer data"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    queued_jobs = db.get_queued_jobs()
    printing_jobs = db.get_printing_jobs()
    completed_today = db.get_completed_today_count()
    
    # Get printer statuses with real-time data from fleet manager
    printers = db.get_user_accessible_printers(user_id)
    printer_statuses = []
    
    for p in printers:
        printer_id = p.printer_id
        real_time = get_real_time_printer_status(fleet_manager, printer_id)
        
        # Check if there's a print queue job for this printer
        printing_job = next(
            (j for j in printing_jobs if j.printer_id == printer_id),
            None
        )
        
        # Determine status: prefer real-time data from Klipper
        if real_time['state'] == 'printing':
            status = 'printing'
            current_job = real_time['filename'] or (printing_job.file_name if printing_job else None)
        elif real_time['state'] == 'offline':
            status = 'offline'
            current_job = None
        elif printing_job:
            status = 'printing'
            current_job = printing_job.file_name
        else:
            status = 'idle'
            current_job = None
        
        printer_statuses.append({
            'id': printer_id,
            'name': p.name,
            'status': status,
            'online': real_time['online'],
            'state': real_time['state'],  # Raw Klipper state
            'currentJob': current_job,
            'progress': real_time['progress'],
            'timeRemaining': real_time['timeRemaining'],
        })
    
    # Enhance printing jobs with real-time progress data
    # First, build a map of queue jobs by printer_id
    queue_job_by_printer = {j.printer_id: j for j in printing_jobs if j.printer_id}
    enhanced_printing_jobs = []
    seen_printer_ids = set()
    
    # Add queue jobs enhanced with real-time data
    for j in printing_jobs:
        real_time = get_real_time_printer_status(fleet_manager, j.printer_id) if j.printer_id else {}
        enhanced_printing_jobs.append({
            'id': j.id,
            'fileId': j.file_id,
            'fileName': j.file_name,
            'printerName': j.printer_name,
            'printerId': j.printer_id,
            'progress': real_time.get('progress', j.progress or 0),
            'timeRemaining': real_time.get('timeRemaining') or j.time_remaining or 'Calculating...',
            'status': j.status,
            'isQueued': True,
        })
        if j.printer_id:
            seen_printer_ids.add(j.printer_id)
    
    # Add real-time active prints that aren't in the queue (started directly on printer)
    if fleet_manager:
        user_printer_ids = {p.printer_id for p in printers}
        printer_names = {p.printer_id: p.name for p in printers}
        
        for printer_id, status_data in fleet_manager.printer_status.items():
            # Skip if not user's printer or already in queue jobs
            if printer_id not in user_printer_ids or printer_id in seen_printer_ids:
                continue
            
            printer_data = status_data.get('printer_data', {})
            print_stats = printer_data.get('print_stats', {})
            display_status = printer_data.get('display_status', {})
            state = print_stats.get('state', 'standby')
            
            # Only add if actually printing
            if state not in ('printing', 'paused'):
                continue
            
            progress = display_status.get('progress', 0)
            if isinstance(progress, float):
                progress = int(progress * 100)
            
            time_remaining = None
            print_duration = print_stats.get('print_duration', 0)
            if progress > 0 and print_duration > 0:
                total_time = print_duration / (progress / 100)
                remaining_seconds = total_time - print_duration
                if remaining_seconds > 0:
                    hours = int(remaining_seconds // 3600)
                    minutes = int((remaining_seconds % 3600) // 60)
                    time_remaining = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
            
            enhanced_printing_jobs.append({
                'id': printer_id,  # Use printer_id as job ID for non-queued prints
                'fileId': None,
                'fileName': print_stats.get('filename', 'Unknown'),
                'printerName': printer_names.get(printer_id, printer_id),
                'printerId': printer_id,
                'progress': progress,
                'timeRemaining': time_remaining or 'Calculating...',
                'status': state,
                'isQueued': False,
            })
    
    return web.json_response({
        'queued': [{
            'id': j.id,
            'fileId': j.file_id,
            'fileName': j.file_name,
            'position': j.position,
            'priority': j.priority,
            'addedAt': j.added_at.isoformat() if j.added_at else None,
            'addedBy': j.user_id,
            'estimatedStart': None,
            'status': j.status,
        } for j in queued_jobs],
        'printing': enhanced_printing_jobs,
        'printers': printer_statuses,
        'completedToday': completed_today,
    })


@require_auth
async def add_job_to_queue(request: web.Request):
    """Add a job to the print queue"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    file_id = data.get('fileId')
    copies = data.get('copies', 1)
    priority = data.get('priority', 'Normal')
    file_name = data.get('fileName', f'file_{file_id[:8] if file_id else "unknown"}')
    
    if not file_id:
        return web.json_response({'error': 'fileId is required'}, status=400)
    
    # Add jobs for each copy
    for _ in range(copies):
        db.add_queue_job(user_id, file_id, file_name, priority)
    
    return web.json_response({'message': f'Added {copies} job(s) to queue'})


@require_auth
async def update_job_position(request: web.Request):
    """Update a job's position in the queue"""
    job_id = request.match_info['job_id']
    db: DatabaseService = request.app['db']
    
    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)
    
    new_position = data.get('position')
    if new_position is None or new_position < 1:
        return web.json_response({'error': 'Valid position is required'}, status=400)
    
    if not db.update_job_position(job_id, new_position):
        return web.json_response({'error': 'Job not found'}, status=404)
    
    return web.json_response({'message': 'Position updated'})


@require_auth
async def remove_job_from_queue(request: web.Request):
    """Remove a job from the queue"""
    job_id = request.match_info['job_id']
    db: DatabaseService = request.app['db']
    
    if not db.remove_queue_job(job_id):
        return web.json_response({'error': 'Job not found'}, status=404)
    
    return web.json_response({'message': 'Job removed from queue'})


@require_auth
async def cancel_print_job(request: web.Request):
    """Cancel an active print job"""
    job_id = request.match_info['job_id']
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    # If job_id looks like a printer_id (for direct printer cancellation)
    if fleet_manager and job_id in fleet_manager.connected_printers:
        # Send cancel command to printer
        try:
            import json
            ws = fleet_manager.connected_printers[job_id]
            await ws.send(json.dumps({
                'type': 'gcode',
                'command': 'CANCEL_PRINT'
            }))
            return web.json_response({'message': 'Cancel command sent to printer'})
        except Exception as e:
            logger.error(f"Error sending cancel to printer {job_id}: {e}")
            return web.json_response({'error': 'Failed to send cancel command'}, status=500)
    
    # Otherwise treat as queue job ID
    if not db.cancel_print_job(job_id):
        return web.json_response({'error': 'Active print job not found'}, status=404)
    
    return web.json_response({'message': 'Print cancelled'})


@require_auth
async def get_active_prints(request: web.Request):
    """Get all currently active prints from connected printers (real-time data)"""
    user_id = request['user']['sub']
    db: DatabaseService = request.app['db']
    fleet_manager = request.app.get('fleet_manager')
    
    active_prints = []
    
    if fleet_manager:
        # Get user's accessible printers
        user_printers = db.get_user_accessible_printers(user_id)
        user_printer_ids = {p.printer_id for p in user_printers}
        printer_names = {p.printer_id: p.name for p in user_printers}
        
        # Check each connected printer for active prints
        for printer_id, status_data in fleet_manager.printer_status.items():
            # Only include printers the user has access to
            if printer_id not in user_printer_ids:
                continue
            
            printer_data = status_data.get('printer_data', {})
            print_stats = printer_data.get('print_stats', {})
            display_status = printer_data.get('display_status', {})
            
            state = print_stats.get('state', 'standby')
            
            # Only include if actually printing or paused
            if state not in ('printing', 'paused'):
                continue
            
            # Calculate progress
            progress = display_status.get('progress', 0)
            if isinstance(progress, float):
                progress = int(progress * 100)
            
            # Calculate time remaining
            time_remaining = None
            print_duration = print_stats.get('print_duration', 0)
            if progress > 0 and print_duration > 0:
                total_time = print_duration / (progress / 100) if progress > 0 else 0
                remaining_seconds = total_time - print_duration
                if remaining_seconds > 0:
                    hours = int(remaining_seconds // 3600)
                    minutes = int((remaining_seconds % 3600) // 60)
                    if hours > 0:
                        time_remaining = f"{hours}h {minutes}m"
                    else:
                        time_remaining = f"{minutes}m"
            
            # Get filename
            filename = print_stats.get('filename', 'Unknown')
            
            # Get filament used and layer info if available
            filament_used = print_stats.get('filament_used', 0)
            
            active_prints.append({
                'id': printer_id,  # Use printer_id as the job ID for active prints
                'printerId': printer_id,
                'printerName': printer_names.get(printer_id, printer_id),
                'fileName': filename,
                'state': state,
                'progress': progress,
                'timeRemaining': time_remaining or 'Calculating...',
                'printDuration': print_duration,
                'filamentUsed': round(filament_used, 2),
                'isQueued': False,  # Indicates this came from real-time data, not queue
            })
    
    # Also include any queue jobs that are marked as printing (for tracking purposes)
    printing_jobs = db.get_printing_jobs()
    for job in printing_jobs:
        # Check if we already have this printer in active_prints
        existing = next((p for p in active_prints if p['printerId'] == job.printer_id), None)
        if existing:
            # Enhance with queue job ID
            existing['queueJobId'] = job.id
            existing['isQueued'] = True
        else:
            # Add queue job (printer might be offline now)
            active_prints.append({
                'id': job.id,
                'printerId': job.printer_id,
                'printerName': job.printer_name,
                'fileName': job.file_name,
                'state': 'printing',
                'progress': job.progress or 0,
                'timeRemaining': job.time_remaining or 'Unknown',
                'printDuration': 0,
                'filamentUsed': 0,
                'isQueued': True,
                'queueJobId': job.id,
            })
    
    return web.json_response({
        'activePrints': active_prints,
        'count': len(active_prints),
    })


@require_auth
async def pause_print(request: web.Request):
    """Pause an active print on a printer"""
    printer_id = request.match_info['printer_id']
    fleet_manager = request.app.get('fleet_manager')
    
    if not fleet_manager or printer_id not in fleet_manager.connected_printers:
        return web.json_response({'error': 'Printer not connected'}, status=400)
    
    try:
        import json
        ws = fleet_manager.connected_printers[printer_id]
        await ws.send(json.dumps({
            'type': 'gcode',
            'command': 'PAUSE'
        }))
        return web.json_response({'message': 'Pause command sent'})
    except Exception as e:
        logger.error(f"Error sending pause to printer {printer_id}: {e}")
        return web.json_response({'error': 'Failed to send pause command'}, status=500)


@require_auth
async def resume_print(request: web.Request):
    """Resume a paused print on a printer"""
    printer_id = request.match_info['printer_id']
    fleet_manager = request.app.get('fleet_manager')
    
    if not fleet_manager or printer_id not in fleet_manager.connected_printers:
        return web.json_response({'error': 'Printer not connected'}, status=400)
    
    try:
        import json
        ws = fleet_manager.connected_printers[printer_id]
        await ws.send(json.dumps({
            'type': 'gcode',
            'command': 'RESUME'
        }))
        return web.json_response({'message': 'Resume command sent'})
    except Exception as e:
        logger.error(f"Error sending resume to printer {printer_id}: {e}")
        return web.json_response({'error': 'Failed to send resume command'}, status=500)


def setup_print_queue_routes(app: web.Application):
    """Setup print queue routes"""
    app.router.add_get('/api/print-queue', get_print_queue)
    app.router.add_get('/api/print-queue/active', get_active_prints)
    app.router.add_post('/api/print-queue/add', add_job_to_queue)
    app.router.add_put('/api/print-queue/{job_id}/position', update_job_position)
    app.router.add_delete('/api/print-queue/{job_id}', remove_job_from_queue)
    app.router.add_post('/api/print-queue/{job_id}/cancel', cancel_print_job)
    app.router.add_post('/api/print-queue/{printer_id}/pause', pause_print)
    app.router.add_post('/api/print-queue/{printer_id}/resume', resume_print)
    
    logger.info("Print queue routes configured")
