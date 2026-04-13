"""
Route Handlers for Fleet Manager
"""
from routes.auth import setup_auth_routes
from routes.printers import setup_printer_routes
from routes.printer_profiles import setup_printer_profile_routes
from routes.groups import setup_group_routes
from routes.print_queue import setup_print_queue_routes
from routes.webcam_proxy import setup_webcam_proxy_routes
from routes.config_sync import setup_config_sync_routes
from routes.config_snapshot import setup_config_snapshot_routes
from routes.fleet_update import setup_fleet_update_routes
from routes.monitoring import setup_monitoring_routes
from routes.fleet_telemetry import setup_fleet_telemetry_routes
from routes.pmi import setup_pmi_routes
from routes.gcode_recipes import setup_gcode_recipe_routes
from routes.design_tree import setup_design_tree_routes

__all__ = [
    'setup_auth_routes',
    'setup_printer_routes',
    'setup_printer_profile_routes',
    'setup_group_routes',
    'setup_print_queue_routes',
    'setup_webcam_proxy_routes',
    'setup_config_sync_routes',
    'setup_config_snapshot_routes',
    'setup_fleet_update_routes',
    'setup_monitoring_routes',
    'setup_fleet_telemetry_routes',
    'setup_pmi_routes',
    'setup_gcode_recipe_routes',
    'setup_design_tree_routes',
]
