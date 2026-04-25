# Heating G-code Reference (Marlin + Klipper)

Reviewed: 2026-04-25
Scope: Extruder and bed heating commands, parameters, wait behavior, and multi-extruder considerations.

## Source-backed review of the provided passage

### Summary verdict
The passage is broadly correct for Marlin-flavor G-code and compatible Klipper usage.

### Confirmed correct points
- Extruder heating commands:
  - `M104` sets hotend target temperature without waiting.
  - `M109` sets hotend target and waits.
- Bed heating commands:
  - `M140` sets bed target temperature without waiting.
  - `M190` sets bed target and waits.
- Common examples are valid:
  - `M104 S200`
  - `M140 S60`
  - `M109 S200`
  - `M190 S60`
  - Heater off examples: `M104 S0`, `M140 S0`
- Multi-extruder targeting with `T` on hotend commands is valid in Marlin:
  - Example: `M104 T1 S210`

### Important nuances missing from the passage
- `M109` and `M190` in Marlin also support `R`:
  - `S` means wait only when heating up.
  - `R` means wait for both heating and cooling.
- `T` is not used for bed commands (`M140`, `M190`) in the same way as hotend selection.
- Marlin also has direct tool select commands (`T0`, `T1`, etc.), and then a following `M104/M109` can apply to the active tool when `T` is omitted.
- Klipper supports these common M-codes for compatibility, but generally prefers extended commands (e.g. `SET_HEATER_TEMPERATURE`, `TEMPERATURE_WAIT`, `TURN_OFF_HEATERS`) for clarity and configurability.
- In Klipper docs, `M109` and `M190` explicitly note they always wait for temperature to settle.

## Primary-source notes

### Marlin
- `M104`: Set hotend temperature, no wait. Supports `S` and optional `T` (hotend index).
- `M109`: Set/wait hotend temperature. Supports `S` (wait on heat-up) and `R` (wait on heat-up/cool-down), and optional `T`.
- `M140`: Set bed temperature, no wait. Uses `S`.
- `M190`: Set/wait bed temperature. Supports `S` and `R`.
- `T0..T7`: Tool selection commands.

References:
- https://marlinfw.org/docs/gcode/M104.html
- https://marlinfw.org/docs/gcode/M109.html
- https://marlinfw.org/docs/gcode/M140.html
- https://marlinfw.org/docs/gcode/M190.html
- https://marlinfw.org/docs/gcode/T.html

### Klipper
- Standard compatibility commands include:
  - `M104 [T<index>] [S<temperature>]`
  - `M109 [T<index>] S<temperature>`
  - `M140 [S<temperature>]`
  - `M190 S<temperature>`
- Klipper recommends extended commands for non-trivial workflows:
  - `SET_HEATER_TEMPERATURE HEATER=<name> TARGET=<temp>`
  - `TEMPERATURE_WAIT SENSOR=<name> MINIMUM=<temp>` (or bounds)
  - `TURN_OFF_HEATERS`

Reference:
- https://www.klipper3d.org/G-Codes.html

## Practical command patterns

### Marlin-focused
- Heat active tool without waiting:
  - `M104 S205`
- Heat tool 1 without waiting:
  - `M104 T1 S210`
- Heat and wait (only if heating):
  - `M109 S205`
- Heat and wait (including cool-down):
  - `M109 R180`
- Bed heat without waiting:
  - `M140 S60`
- Bed heat and wait:
  - `M190 S60`
- Bed wait including cool-down:
  - `M190 R45`
- Turn off:
  - `M104 S0`
  - `M140 S0`

### Klipper-native style (preferred in macros)
- Set extruder target:
  - `SET_HEATER_TEMPERATURE HEATER=extruder TARGET=205`
- Wait for extruder:
  - `TEMPERATURE_WAIT SENSOR=extruder MINIMUM=205`
- Set bed target:
  - `SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=60`
- Wait for bed:
  - `TEMPERATURE_WAIT SENSOR=heater_bed MINIMUM=60`
- Turn off all heaters:
  - `TURN_OFF_HEATERS`

## Implementation guidance for slicer/start-gcode templates
- For broad host firmware compatibility, `M104/M109/M140/M190` remain safe defaults.
- For multi-extruder templates, either:
  - Explicitly set tool via `Tn` then issue heating commands, or
  - Include `Tn` on `M104/M109` where firmware supports it.
- If waiting during cooling is required (material changes, annealing flows), prefer `R` variants where supported.
- In Klipper macro-heavy environments, extended commands are often clearer than legacy M-code compatibility commands.
