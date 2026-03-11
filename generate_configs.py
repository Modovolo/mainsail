#!/usr/bin/env python3
"""
Generate standardized printer.cfg files for BFP printers.

This script takes the running printer.cfg from each BFP, extracts all
hardware-specific values (UUIDs, pins, positions), and applies them to
a standardized template to produce consistent, version-controlled configs.

Usage:
    python generate_configs.py [hostname...]
    
Examples:
    python generate_configs.py bfp7
    python generate_configs.py bfp7 bfp8 bfp9
    python generate_configs.py  # Process all default printers
"""

import re
import sys
from pathlib import Path

# Default BFP printers (used when no argument provided)
DEFAULT_PRINTERS = ['bfp2', 'bfp3.local', 'bfp4', 'bfp5', 'bfp7', 'bfp8', 'bfp9', 'bfp10']

# Paths (relative to project root)
TEMPLATE_FILE = Path('output/config-dumps/templates/printer_cfg_BFP9_DualWipe_for_mainsail_idex_DELETE_COMMENTS_TEST3.cfg')
INPUT_DIR = Path('output/config-dumps')
OUTPUT_DIR = Path('version_controlled_configs')

# PIN-related parameters that must come from source configs
PIN_PARAMETERS = [
    'step_pin', 'dir_pin', 'enable_pin', 'endstop_pin',
    'heater_pin', 'sensor_pin', 'cs_pin', 'uart_pin',
    'diag_pin', 'diag0_pin', 'diag1_pin',
    'tx_pin', 'rx_pin', 'spi_bus', 'i2c_bus', 'i2c_mcu',
    'spi_software_mosi_pin', 'spi_software_miso_pin', 'spi_software_sclk_pin',
    'canbus_uuid', 'canbus_interface'
]

# Positional/geometry parameters that are printer-specific
POSITIONAL_PARAMETERS = [
    'position_endstop', 'position_min', 'position_max',
    'x_offset', 'y_offset', 'z_offset',
    'home_xy_position',
    'mesh_min', 'mesh_max',
    'horizontal_move_z',
    'safe_distance',
    'endstop_align_zero'
]

# All sections that need hardware-specific values extracted
HARDWARE_SECTIONS = [
    # MCU sections
    'mcu', 'mcu Kraken_bottom', 'mcu HermitCrab2_Board_1_left', 'mcu HermitCrab2_Board_2_right',
    # X-axis
    'stepper_x', 'tmc5160 stepper_x', 'endstop_phase stepper_x',
    'dual_carriage', 'tmc5160 dual_carriage', 'endstop_phase dual_carriage',
    # Y-axis
    'stepper_y', 'stepper_y1', 'stepper_y2', 'stepper_y3',
    'tmc5160 stepper_y', 'tmc5160 stepper_y1', 'tmc5160 stepper_y2', 'tmc5160 stepper_y3',
    # Extruders
    'extruder', 'extruder1',
    'tmc2209 extruder', 'tmc2209 extruder1',
    # Sensors
    'filament_switch_sensor filament_sensor_t0', 'filament_switch_sensor filament_sensor_t1',
    # Bed heaters
    'heater_generic heater_bed_FL', 'heater_generic heater_bed_FR',
    'heater_generic heater_bed_BL', 'heater_generic heater_bed_BR',
    # Probes and other hardware
    'probe_eddy_current btt_eddy',
    'temperature_sensor btt_eddy_mcu',
]


def get_printers_from_args():
    """Get printer list from command line arguments or use defaults."""
    if len(sys.argv) > 1:
        return sys.argv[1:]
    return DEFAULT_PRINTERS


def is_valid_pin_value(value):
    """
    Validate that a value looks like a PIN assignment.
    Handles various PIN patterns including MCU-prefixed pins, GPIO, CAN, etc.
    """
    if not value:
        return False
    
    pin_patterns = [
        r'^[!\^]*[A-Z]{2}\d+$',                                    # Simple: PF9, !PE6, ^!PC15
        r'^[!\^]*[\w_]+:[A-Z]{2}\d+$',                            # MCU-prefixed: !Kraken_bottom:PC14
        r'^[!\^]*[\w_]+:gpio\d+$',                                # GPIO: !HermitCrab2_Board_1_left:gpio25
        r'^[!\^]*[\w_]+:virtual_endstop$',                        # Virtual endstop
        r'^[!\^]*gpio\d+$',                                       # Direct GPIO: !gpio6
        r'^can\d+$',                                               # CAN interface: can0
        r'^(i2c|spi)\w*$',                                         # Bus: i2c0f, spi1
        r'^[a-f0-9]{12}$',                                         # CAN UUID: faa18fecc855
        r'^[A-Z][a-zA-Z0-9]*(?:_[A-Z][a-zA-Z0-9]*)*(?:_\d+)?$',  # MCU names
        r'^eddy$',                                                 # Eddy probe MCU
    ]
    
    for pattern in pin_patterns:
        if re.match(pattern, value):
            return True
    return False


def extract_section(content, section_name):
    """Extract a complete config section including all its parameters."""
    # Escape special regex characters in section name
    escaped_name = re.escape(section_name)
    pattern = rf'^\[{escaped_name}\].*?(?=\n\[|\Z)'
    match = re.search(pattern, content, re.DOTALL | re.MULTILINE)
    return match.group(0).strip() if match else None


def extract_hardware_values(section_content):
    """
    Extract PIN and positional parameter values from a config section.
    Returns a dict of parameter -> value.
    """
    values = {}
    if not section_content:
        return values
    
    all_params = PIN_PARAMETERS + POSITIONAL_PARAMETERS
    
    for line in section_content.split('\n'):
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('['):
            continue
        
        for param in all_params:
            if line.startswith(f'{param}:') or line.startswith(f'{param}='):
                # Extract value (after : or =)
                if ':' in line:
                    value = line.split(':', 1)[1].strip()
                else:
                    value = line.split('=', 1)[1].strip()
                
                # Remove inline comments
                if '#' in value:
                    value = value.split('#')[0].strip()
                
                # For PIN params, validate the value looks correct
                if param in PIN_PARAMETERS:
                    if is_valid_pin_value(value):
                        values[param] = value
                else:
                    # Positional params - just store the value
                    if value:
                        values[param] = value
                break
    
    return values


def apply_values_to_section(template_section, source_values):
    """
    Apply extracted hardware values to a template section.
    Preserves template structure and comments while replacing values.
    """
    if not source_values:
        return template_section
    
    result = template_section
    
    for param, value in source_values.items():
        # Pattern matches: param: old_value [optional comment]
        # We replace with: param: new_value [keep comment if exists]
        pattern = rf'^({re.escape(param)}[=:]\s*)[^\n#]*(#.*)?$'
        
        def replacement(match):
            prefix = match.group(1)
            comment = match.group(2)
            if comment:
                return f"{prefix}{value}  {comment}"
            return f"{prefix}{value}"
        
        result = re.sub(pattern, replacement, result, flags=re.MULTILINE)
    
    return result


def process_printer(printer, template_content):
    """
    Process a single printer: extract values from source, apply to template.
    Returns the generated config content or None if source not found.
    """
    printer_name = printer.replace('.local', '')
    input_dir = INPUT_DIR / printer
    source_cfg = input_dir / 'printer.cfg'
    
    if not source_cfg.exists():
        return None, f"printer.cfg not found in {input_dir}"
    
    with open(source_cfg, 'r') as f:
        source_content = f.read()
    
    # Start with template
    new_content = template_content
    
    # Update printer name in template
    new_content = re.sub(r'BFP9,?\s*Tucci Printer', f'{printer_name.upper()} Printer', new_content)
    new_content = re.sub(r'BFP9', printer_name.upper(), new_content)
    
    # Process each hardware section
    sections_updated = []
    
    for section_name in HARDWARE_SECTIONS:
        # Extract from source
        source_section = extract_section(source_content, section_name)
        if not source_section:
            continue
        
        # Extract hardware values
        hw_values = extract_hardware_values(source_section)
        if not hw_values:
            continue
        
        # Find and update in template
        template_section = extract_section(new_content, section_name)
        if not template_section:
            continue
        
        # Apply values
        updated_section = apply_values_to_section(template_section, hw_values)
        
        # Replace in new_content
        escaped_name = re.escape(section_name)
        new_content = re.sub(
            rf'^\[{escaped_name}\].*?(?=\n\[|\Z)',
            updated_section,
            new_content,
            flags=re.DOTALL | re.MULTILINE
        )
        
        sections_updated.append(section_name)
    
    return new_content, sections_updated


def main():
    bfp_printers = get_printers_from_args()
    
    if not TEMPLATE_FILE.exists():
        print(f"❌ Template not found: {TEMPLATE_FILE}")
        print("   Please ensure the template file exists.")
        return 1
    
    with open(TEMPLATE_FILE, 'r') as f:
        template_content = f.read()
    
    print("🚀 Generating standardized printer configs...")
    print(f"📄 Template: {TEMPLATE_FILE}")
    print(f"📂 Input: {INPUT_DIR}/")
    print(f"📂 Output: {OUTPUT_DIR}/")
    print(f"🖨️  Printers: {', '.join(bfp_printers)}\n")
    
    success_count = 0
    
    for printer in bfp_printers:
        printer_name = printer.replace('.local', '')
        print(f"📝 Processing {printer}...")
        
        result, info = process_printer(printer, template_content)
        
        if result is None:
            print(f"  ⚠️  Skipping: {info}")
            continue
        
        # Show what sections were updated
        if isinstance(info, list) and info:
            print(f"  ✓ Updated {len(info)} sections")
            # Show key sections
            key_sections = [s for s in info if 'mcu' in s.lower() or 'stepper_x' in s or 'dual_carriage' in s]
            for section in key_sections[:4]:
                print(f"    - {section}")
            if len(info) > 4:
                print(f"    ... and {len(info) - 4} more")
        
        # Ensure output directory exists
        output_dir = OUTPUT_DIR / printer_name
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Write output
        output_file = output_dir / 'printer.cfg'
        with open(output_file, 'w') as f:
            f.write(result)
        
        print(f"  ✅ Created: {output_file}\n")
        success_count += 1
    
    print(f"{'='*50}")
    print(f"✅ Generated {success_count}/{len(bfp_printers)} printer configs!")
    
    if success_count > 0:
        print("\n📋 Next steps:")
        print("1. Review generated configs: git diff version_controlled_configs/")
        print("2. Test on one printer first before deploying to all")
        print("3. Commit changes when verified: git add version_controlled_configs/ && git commit")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
