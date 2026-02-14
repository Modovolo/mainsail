"""
Route Handlers for Fleet Manager
"""
from routes.auth import setup_auth_routes
from routes.printers import setup_printer_routes
from routes.printer_profiles import setup_printer_profile_routes
from routes.groups import setup_group_routes
from routes.print_queue import setup_print_queue_routes
from routes.webcam_proxy import setup_webcam_proxy_routes

__all__ = [
    'setup_auth_routes',
    'setup_printer_routes',
    'setup_printer_profile_routes',
    'setup_group_routes',
    'setup_print_queue_routes',
    'setup_webcam_proxy_routes',
]
