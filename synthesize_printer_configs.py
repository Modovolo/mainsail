#!/usr/bin/env python3
"""
Synthesize complete printer.cfg files from modular config dumps.
This merges the template with printer-specific pin configurations from:
- printer_Kraken_bottom.cfg (Y-steppers, sometimes X-steppers)
- hermit-crab-2-board_left.cfg (T0 extruder, probe, accelerometer)
- hermit-crab-2-board_right.cfg (T1 extruder, accelerometer)
"""

import re
import os
import sys
from pathlib import Path

# Default BFP printers
DEFAULT_PRINTERS = ['bfp2', 'bfp3.local', 'bfp4', 'bfp5', 'bfp7', 'bfp8', 'bfp9', 'bfp10']

INPUT_ROOT = Path(os.environ.get('BFP_CONFIG_DUMPS_DIR', 'output/config-dumps'))
TEMPLATE_PATH = Path(
    os.environ.get(
        'BFP_TEMPLATE_FILE',
        str(INPUT_ROOT / 'templates' / 'printer_cfg_BFP9_DualWipe_for_mainsail_idex_DELETE_COMMENTS_TEST2.cfg')
    )
)
OUTPUT_ROOT = Path(os.environ.get('BFP_SYNTH_OUTPUT_DIR', 'version_controlled_configs'))

# PIN-related parameters that should be extracted from source configs
PIN_PARAMETERS = [
    'step_pin', 'dir_pin', 'enable_pin', 'endstop_pin',
    'heater_pin', 'sensor_pin', 'cs_pin', 'uart_pin',
    'diag_pin', 'diag0_pin', 'diag1_pin',
    'tx_pin', 'rx_pin', 'spi_bus', 'i2c_bus', 'i2c_mcu',
    'spi_software_mosi_pin', 'spi_software_miso_pin', 'spi_software_sclk_pin',
    'canbus_uuid', 'canbus_interface'
]

# Positional/geometry parameters that are printer-specific and must come from sources
POSITIONAL_PARAMETERS = [
    'position_endstop', 'position_min', 'position_max',
    'x_offset', 'y_offset', 'z_offset',
    'home_xy_position',
    'mesh_min', 'mesh_max',
    'horizontal_move_z',
    'speed', 'lift_speed', 'samples_tolerance',
    'endstop_align_zero'
]

def is_valid_pin_value(value):
    """
    Validate that a value looks like a PIN assignment.
    PIN patterns:
    - Simple: PF9, PB1, PC5 (2 capital letters + digit(s))
    - With modifiers: !PE6, ^!PC15, ^PF0
    - MCU-prefixed: Kraken_bottom:PC14, HermitCrab2_Board_1_left:gpio25
    - Virtual/Special: tmc5160_stepper_x:virtual_endstop
    - GPIO: gpio6, gpio25, gpio26
    - CAN: can0, can1
    - Bus: i2c0f, spi1, i2c_mcu, spi_bus
    - UUID: hexadecimal strings for canbus_uuid
    - MCU names for i2c_mcu: eddy (lowercase, used as MCU reference)
    """
    if not value:
        return False
    
    # Common PIN patterns (order matters - more specific first)
    # NOTE: Logical inversion tokens (!, ^, ^!) can prefix any PIN value
    pin_patterns = [
        r'^[!\^]*[A-Z]{2}\d+$',                                    # Simple: PF9, !PE6, ^!PC15
        r'^[!\^]*[\w_]+:[A-Z]{2}\d+$',                            # MCU-prefixed: !Kraken_bottom:PC14, ^!Kraken_bottom:PE4
        r'^[!\^]*[\w_]+:gpio\d+$',                                # GPIO: !HermitCrab2_Board_1_left:gpio25
        r'^[!\^]*[\w_]+:virtual_endstop$',                        # Virtual endstop: tmc5160_stepper_x:virtual_endstop
        r'^[!\^]*gpio\d+$',                                       # Direct GPIO: !gpio6, ^gpio25
        r'^can\d+$',                                               # CAN interface: can0, can1
        r'^(i2c|spi)\w+$',                                         # Bus: i2c0f, spi1, i2c_mcu
        r'^[a-f0-9]{12}$',                                         # CAN UUID: faa18fecc855
        r'^[A-Z][a-zA-Z0-9]*(?:_[A-Z][a-zA-Z0-9]*)*(?:_\d+)?$',  # MCU: Kraken_bottom, HermitCrab2_Board_1_left
        r'^eddy$',                                                 # Specific MCU name for Eddy probe
    ]
    
    import re
    for pattern in pin_patterns:
        if re.match(pattern, value):
            return True
    
    return False

def extract_pin_values(source_section):
    """Extract only PIN-related parameter values from a config section"""
    pin_values = {}
    for line in source_section.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        # Check if line contains a PIN parameter
        for pin_param in PIN_PARAMETERS:
            if line.startswith(f'{pin_param}:') or line.startswith(f'{pin_param}='):
                # Extract the value (everything after : or =)
                value = line.split(':', 1)[-1].split('=', 1)[-1].strip()
                # Remove inline comments
                if '#' in value:
                    value = value.split('#')[0].strip()
                # Validate it looks like a PIN value
                if is_valid_pin_value(value):
                    pin_values[pin_param] = value
                break
    return pin_values

def extract_positional_values(source_section):
    """Extract positional/geometry parameter values from a config section"""
    positional_values = {}
    for line in source_section.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        # Check if line contains a positional parameter
        for pos_param in POSITIONAL_PARAMETERS:
            if line.startswith(f'{pos_param}:') or line.startswith(f'{pos_param}='):
                # Extract the value (everything after : or =)
                value = line.split(':', 1)[-1].split('=', 1)[-1].strip()
                # Remove inline comments
                if '#' in value:
                    value = value.split('#')[0].strip()
                positional_values[pos_param] = value
                break
    return positional_values

def overlay_pins_in_section(template_section, source_section, section_name):
    """
    Keep template section structure but overlay PIN and positional values from source.
    Non-PIN, non-positional parameters (temps, speeds, currents, etc.) stay from template.
    Comments from template are preserved.
    """
    # Extract PIN values from source
    pin_values = extract_pin_values(source_section)
    
    # Extract positional/geometry values from source
    positional_values = extract_positional_values(source_section)
    
    # Combine both dictionaries
    source_values = {**pin_values, **positional_values}
    
    if not source_values:
        return template_section
    
    # Replace PIN and positional values in template section, preserving template comments
    result_section = template_section
    for param, value in source_values.items():
        # Match parameter and capture any existing comment from template
        # Pattern: param: value [optional comment]
        pattern = rf'^({re.escape(param)}[=:]\s*)[^\n#]*(#.*)?$'
        
        def replacement(match):
            param_prefix = match.group(1)  # "step_pin: " or "position_max: "
            template_comment = match.group(2)  # " # comment" or None
            # Use template comment if it exists, otherwise just the value
            if template_comment:
                return f"{param_prefix}{value}  {template_comment}"
            else:
                return f"{param_prefix}{value}"
        
        result_section = re.sub(pattern, replacement, result_section, flags=re.MULTILINE)
    
    return result_section

def strip_inline_comments(content):
    """
    Remove inline comments from config content.
    Preserves full-line comments (starting with #) and section headers.
    """
    lines = []
    for line in content.split('\n'):
        stripped = line.strip()
        # Keep empty lines, full-line comments, and section headers as-is
        if not stripped or stripped.startswith('#') or stripped.startswith('['):
            lines.append(line)
        else:
            # Remove inline comments from parameter lines
            if '#' in line:
                # Split on # and keep only the parameter part
                param_part = line.split('#')[0].rstrip()
                lines.append(param_part)
            else:
                lines.append(line)
    return '\n'.join(lines)

def read_config_section(content, section_name):
    """Extract a complete config section including all its parameters"""
    pattern = rf'(\[{re.escape(section_name)}[^\]]*\].*?)(?=\n\[|\Z)'
    match = re.search(pattern, content, re.DOTALL)
    return match.group(1).strip() if match else None


def get_printers_from_args():
    """Get printer list from command line arguments or use defaults."""
    if len(sys.argv) > 1:
        return sys.argv[1:]
    return DEFAULT_PRINTERS


def read_file_if_exists(path: Path) -> str:
    if not path.exists():
        return ""
    with open(path, 'r') as f:
        return f.read()


def first_existing_file(base_dir: Path, candidates: list[str]) -> Path | None:
    for candidate in candidates:
        path = base_dir / candidate
        if path.exists():
            return path
    return None


def build_combined_source_content(printer_dir: Path) -> str:
    """Merge all cfg files for a printer so split-schema configs can be synthesized."""
    cfg_files = sorted(printer_dir.glob('*.cfg'), key=lambda p: p.name.lower())
    chunks = []
    for cfg_file in cfg_files:
        content = read_file_if_exists(cfg_file)
        if content:
            chunks.append(content)
    return '\n\n'.join(chunks)

def main():
    bfp_printers = get_printers_from_args()
    template_file = TEMPLATE_PATH
    
    if not template_file.exists():
        print(f"❌ Template not found: {template_file}")
        return
    
    with open(template_file, 'r') as f:
        template_content = f.read()
    
    print("🚀 Synthesizing complete printer configs from modular/split sources...")
    print(f"📄 Template: {template_file}\n")
    print(f"🖨️  Printers: {', '.join(bfp_printers)}\n")
    
    for printer in bfp_printers:
        printer_dir = INPUT_ROOT / printer
        kraken_bottom_cfg = printer_dir / 'printer_Kraken_bottom.cfg'
        hermit_left_cfg = first_existing_file(
            printer_dir,
            ['hermit-crab-2-board_left.cfg', 'hermit-crab2-board_left.cfg']
        )
        hermit_right_cfg = first_existing_file(
            printer_dir,
            ['hermit-crab-2-board_right.cfg', 'hermit-crab2-board_right.cfg']
        )
        
        if not kraken_bottom_cfg.exists():
            print(f"⚠️  Skipping {printer}: printer_Kraken_bottom.cfg not found")
            continue
        
        print(f"📝 Processing {printer}...")
        
        # Read modular configs
        with open(kraken_bottom_cfg, 'r') as f:
            kraken_content = f.read()

        combined_source_content = build_combined_source_content(printer_dir)
        
        hermit_left_content = read_file_if_exists(hermit_left_cfg) if hermit_left_cfg else ""
        
        hermit_right_content = read_file_if_exists(hermit_right_cfg) if hermit_right_cfg else ""
        
        # Read original printer.cfg (or printer_old.cfg if it exists) for hardware-specific values
        # printer_old.cfg is the known-good working config before synthesis
        original_printer_cfg = printer_dir / 'printer_old.cfg'
        if not original_printer_cfg.exists():
            original_printer_cfg = printer_dir / 'printer.cfg'
        
        original_content = read_file_if_exists(original_printer_cfg)

        source_pool_content = combined_source_content or original_content
        
        # Check if this printer has X-steppers on bottom Kraken (like BFP8)
        has_x_on_bottom = 'stepper_x' in kraken_content and 'Kraken_bottom:PC14' in kraken_content
        
        # Start with template structure
        new_content = template_content
        
        if has_x_on_bottom:
            print(f"  ⚡ {printer} has X-steppers on BOTTOM Kraken (hardware variation)")
            # For BFP8 and similar: Overlay PINs from bottom Kraken
            
            # Overlay PINs for stepper_x, tmc5160 stepper_x, endstop_phase stepper_x
            for section_name in ['stepper_x', 'tmc5160 stepper_x', 'endstop_phase stepper_x']:
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                # Find section in bottom Kraken source
                source_section_match = re.search(
                    rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                    kraken_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
            
            # Overlay PINs for dual_carriage, tmc5160 dual_carriage, endstop_phase dual_carriage
            for section_name in ['dual_carriage', 'tmc5160 dual_carriage', 'endstop_phase dual_carriage']:
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                # Find section in bottom Kraken source
                source_section_match = re.search(
                    rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                    kraken_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
        else:
            print(f"  ✓ {printer} uses standard configuration (X on top Kraken)")
            # Overlay PINs from original printer.cfg
            if original_content:
                # Overlay PINs for X-axis sections
                for section_name in ['stepper_x', 'tmc5160 stepper_x', 'endstop_phase stepper_x',
                                    'dual_carriage', 'tmc5160 dual_carriage', 'endstop_phase dual_carriage']:
                    # Find section in template
                    template_section_match = re.search(
                        rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####)',
                        new_content,
                        re.DOTALL | re.MULTILINE
                    )
                    # Find section in source
                    source_section_match = re.search(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                        source_pool_content,
                        re.DOTALL | re.MULTILINE
                    )
                    
                    if template_section_match and source_section_match:
                        template_section = template_section_match.group(1)
                        source_section = source_section_match.group(0)
                        # Overlay PINs from source onto template
                        overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                        # Replace in synthesized config
                        new_content = re.sub(
                            rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                            overlaid,
                            new_content,
                            flags=re.DOTALL | re.MULTILINE
                        )
        
        # Overlay PINs for Y-steppers from bottom Kraken (only if not using X on bottom)
        # If X is on bottom, Y-steppers remain on top Kraken (overlay from original)
        if not has_x_on_bottom:
            # Overlay PINs for each Y-stepper from bottom Kraken
            for stepper_name in ['stepper_y', 'stepper_y1', 'stepper_y2', 'stepper_y3']:
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{stepper_name}\].*?)(?=\n\[)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                # Find section in bottom Kraken source
                source_section_match = re.search(
                    rf'^\[{stepper_name}\].*?(?=\n\[)',
                    kraken_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, stepper_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{stepper_name}\].*?(?=\n\[)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
                
                # Overlay PINs for TMC section
                tmc_section_name = f'tmc5160 {stepper_name}'
                template_tmc_match = re.search(
                    rf'^(\[{re.escape(tmc_section_name)}\].*?)(?=\n\[)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                source_tmc_match = re.search(
                    rf'^\[{re.escape(tmc_section_name)}\].*?(?=\n\[)',
                    kraken_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_tmc_match and source_tmc_match:
                    template_tmc = template_tmc_match.group(1)
                    source_tmc = source_tmc_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid_tmc = overlay_pins_in_section(template_tmc, source_tmc, tmc_section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(tmc_section_name)}\].*?(?=\n\[)',
                        overlaid_tmc,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
        else:
            print(f"  ⚠️  {printer} keeps Y-steppers on TOP Kraken (X using bottom slots)")
            # For BFP8: Y-steppers are on TOP Kraken, overlay PINs from original
            
            if source_pool_content:
                # Overlay PINs for each Y-stepper from original config
                for stepper_name in ['stepper_y', 'stepper_y1', 'stepper_y2', 'stepper_y3']:
                    # Find section in template
                    template_section_match = re.search(
                        rf'^(\[{stepper_name}\].*?)(?=\n\[)',
                        new_content,
                        re.DOTALL | re.MULTILINE
                    )
                    # Find section in original source
                    source_section_match = re.search(
                        rf'^\[{stepper_name}\].*?(?=\n\[)',
                        source_pool_content,
                        re.DOTALL | re.MULTILINE
                    )
                    
                    if template_section_match and source_section_match:
                        template_section = template_section_match.group(1)
                        source_section = source_section_match.group(0)
                        # Overlay PINs from source onto template
                        overlaid = overlay_pins_in_section(template_section, source_section, stepper_name)
                        # Replace in synthesized config
                        new_content = re.sub(
                            rf'^\[{stepper_name}\].*?(?=\n\[)',
                            overlaid,
                            new_content,
                            flags=re.DOTALL | re.MULTILINE
                        )
                    
                    # Overlay PINs for TMC section
                    tmc_section_name = f'tmc5160 {stepper_name}'
                    template_tmc_match = re.search(
                        rf'^(\[{re.escape(tmc_section_name)}\].*?)(?=\n\[)',
                        new_content,
                        re.DOTALL | re.MULTILINE
                    )
                    source_tmc_match = re.search(
                        rf'^\[{re.escape(tmc_section_name)}\].*?(?=\n\[)',
                        source_pool_content,
                        re.DOTALL | re.MULTILINE
                    )
                    
                    if template_tmc_match and source_tmc_match:
                        template_tmc = template_tmc_match.group(1)
                        source_tmc = source_tmc_match.group(0)
                        # Overlay PINs from source onto template
                        overlaid_tmc = overlay_pins_in_section(template_tmc, source_tmc, tmc_section_name)
                        # Replace in synthesized config
                        new_content = re.sub(
                            rf'^\[{re.escape(tmc_section_name)}\].*?(?=\n\[)',
                            overlaid_tmc,
                            new_content,
                            flags=re.DOTALL | re.MULTILINE
                        )
        
        # Overlay PINs for T0 (left HermitCrab) sections if available
        if hermit_left_content:
            # Overlay PINs for extruder and related sections
            for section_name in ['extruder', 'tmc2209 extruder', 'filament_switch_sensor filament_sensor_t0']:
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                # Find section in HermitCrab source
                source_section_match = re.search(
                    rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                    hermit_left_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
        
        # Overlay PINs for T1 (right HermitCrab) sections if available
        if hermit_right_content:
            # Overlay PINs for extruder1 and related sections
            for section_name in ['extruder1', 'tmc2209 extruder1', 'filament_switch_sensor filament_sensor_t1']:
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                # Find section in HermitCrab source
                source_section_match = re.search(
                    rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                    hermit_right_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PINs from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
        
        # Overlay PIN values for heater_generic sections from original printer.cfg
        if source_pool_content:
            heater_names = ['heater_bed_FL', 'heater_bed_FR', 'heater_bed_BL', 'heater_bed_BR']
            for heater_name in heater_names:
                # Extract source heater_generic section
                source_heater_match = re.search(
                    rf'^(\[heater_generic {heater_name}\].*?)(?=\n\[)',
                    source_pool_content,
                    re.DOTALL | re.MULTILINE
                )
                
                # Extract template heater_generic section
                template_heater_match = re.search(
                    rf'^(\[heater_generic {heater_name}\].*?)(?=\n\[)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if source_heater_match and template_heater_match:
                    source_heater = source_heater_match.group(1).strip()
                    template_heater = template_heater_match.group(1).strip()
                    
                    # Overlay only PIN values from source onto template
                    updated_heater = overlay_pins_in_section(template_heater, source_heater, f'heater_generic {heater_name}')
                    
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[heater_generic {heater_name}\].*?(?=\n\[)',
                        updated_heater,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
                
                # verify_heater sections don't have PINs, keep from template
        
        # Overlay MCU block values from original printer.cfg or printer.cfg
        # Use printer.cfg if available (has all active UUIDs), otherwise printer_old.cfg
        mcu_source_cfg = printer_dir / 'printer.cfg'
        mcu_source_content = read_file_if_exists(mcu_source_cfg) or source_pool_content or original_content
        
        if mcu_source_content:
            # Extract all [mcu] section names from template
            template_mcu_sections = re.findall(r'\[mcu[^\]]*\]', new_content)
            
            for mcu_header in template_mcu_sections:
                # Get MCU section name
                mcu_name_match = re.search(r'\[mcu([^\]]*)\]', mcu_header)
                if not mcu_name_match:
                    continue
                
                mcu_name = mcu_name_match.group(1).strip()
                section_name = 'mcu' + (f' {mcu_name}' if mcu_name else '')
                
                # Find section in template
                template_section_match = re.search(
                    rf'^(\[{re.escape(section_name)}\].*?)(?=\n\[|\n#####|\Z)',
                    new_content,
                    re.DOTALL | re.MULTILINE
                )
                
                # Find section in source
                source_section_match = re.search(
                    rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\Z)',
                    mcu_source_content,
                    re.DOTALL | re.MULTILINE
                )
                
                if template_section_match and source_section_match:
                    template_section = template_section_match.group(1)
                    source_section = source_section_match.group(0)
                    # Overlay PIN values (canbus_uuid, canbus_interface) from source onto template
                    overlaid = overlay_pins_in_section(template_section, source_section, section_name)
                    # Replace in synthesized config
                    new_content = re.sub(
                        rf'^\[{re.escape(section_name)}\].*?(?=\n\[|\n#####|\Z)',
                        overlaid,
                        new_content,
                        flags=re.DOTALL | re.MULTILINE
                    )
        
        # Write synthesized config to version_controlled_configs
        output_file = OUTPUT_ROOT / printer.replace('.local', '') / 'printer.cfg'
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, 'w') as f:
            f.write(new_content)
        
        print(f"  ✅ Synthesized: {output_file}\n")
    
    print("✅ All printer configs synthesized from modular sources!")
    print("\n📋 Next steps:")
    print("1. Review synthesized configs in version_controlled_configs/")
    print("2. Test on one printer first (e.g., BFP8)")
    print("3. Commit to git repository")

if __name__ == '__main__':
    main()
