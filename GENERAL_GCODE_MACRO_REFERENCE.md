# General G-code and Macro Reference (Marlin + Klipper)

Reviewed: 2026-04-25
Scope: Non-heating motion, state, fan/flow/speed, persistence/safety, toolchange, and macro systems.

## Source-backed review summary

### Summary verdict
- The core motion and state commands used by slicers are broadly compatible between Marlin and Klipper.
- Major differences are around macro systems, toolchange workflows, and firmware-specific extended commands.
- In Klipper, many advanced workflows are expected to use extended commands/macros instead of Marlin-style one-letter M/G command families.

### Project default profile assumptions
- Printer profiles default firmware to `klipper`.
- Printer profiles default gcode flavor to `marlin`.
- Existing profiles that do not yet include these fields should be treated as `klipper` + `marlin` defaults.

## Command families reviewed

### 1) Motion and coordinate-state commands

#### Confirmed behavior (Marlin)
- `G0` and `G1` enqueue linear moves.
- Feedrate (`F`) set on a move becomes the feedrate for following moves.
- `G90` sets absolute positioning.
- `G91` sets relative positioning.
- `M82` sets extruder (`E`) absolute mode.
- `M83` sets extruder (`E`) relative mode.
- `G92` sets the current logical axis position(s).
- `G28` homes one or more axes.

#### Important Marlin nuances
- On Cartesians/Deltas, `G0` is an alias for `G1`; on SCARA, `G0` can be handled as a distinct fast non-linear move.
- `M82` and `M83` are cleared by `G90`/`G91`.
- `G28` typically disables bed leveling unless restored by config behavior or followed by `M420 S`.
- `G92` in newer Marlin preserves software endstop boundaries.

#### Klipper mapping
- Klipper supports standard `G0/G1/G28/G90/G91/G92/M82/M83` compatibility commands.
- Klipper recommends extended commands for many non-trivial stateful workflows.

### 2) Runtime modifiers and planner synchronization

#### Confirmed behavior (Marlin)
- `M220` adjusts global feedrate percentage (speed factor) and can back up/restore values.
- `M221` adjusts extrusion flow percentage (optionally per target extruder with `T`).
- `M106` sets fan speed.
- `M107` turns fan off.
- `M400` waits for all queued moves to complete.

#### Important nuances
- `M106` fan changes apply to upcoming planner blocks; effect may be delayed while moves are queued.
- `M400` is commonly used before beeps/messages/actions that must happen after motion completion.

#### Klipper mapping
- Klipper supports `M220`, `M221`, `M106`, `M107`, and `M400` compatibility commands.
- Klipper-native alternatives include module-specific commands like `SET_FAN_SPEED` for configured generic fans.

### 3) Persistence, reset, reporting, and emergency stop

#### Confirmed behavior (Marlin)
- `M500` saves configurable runtime settings to EEPROM.
- `M501` restores settings from EEPROM.
- `M502` resets configurable settings to factory defaults in memory; use `M500` to persist.
- `M503` reports runtime-configurable settings to host.
- `M112` performs immediate shutdown of machine functions.

#### Important safety nuance
- Marlin explicitly documents that `M112` is not a formal safety-rated emergency stop category; it is a control-stop function and machine safety must be designed separately.

#### Klipper mapping
- Klipper supports `M112` and also exposes `RESTART`/`FIRMWARE_RESTART` as extended operational control commands.

### 4) Toolchange and filament-change workflows

#### Confirmed behavior (Marlin)
- `T0` ... `T7` selects a tool.
- `M600` starts the filament change workflow (Advanced Pause feature dependent).

#### Important nuances
- `T` without a number can report current tool index in newer Marlin versions.
- `M600` behavior and availability depend on Marlin feature configuration (`ADVANCED_PAUSE_FEATURE`, LCD/controller expectations).

#### Klipper mapping
- Klipper commonly uses extended command `ACTIVATE_EXTRUDER` for multi-extruder tool activation.
- For print interruption/recovery, Klipper provides `PAUSE`, `RESUME`, `CLEAR_PAUSE`, and `CANCEL_PRINT`.
- Marlin-style toolchange/filament-change commands can be emulated in Klipper via macros where needed.

### 5) Macro and repeat-loop systems

#### Marlin macro/repeat commands
- `M810` ... `M819`: define or execute ten stored macros.
- Macro definitions can include multiple commands separated by the pipe (`|`) character.
- `M808`: repeat markers for looped regions (SD printing use-case; supports finite and infinite loop markers).

#### Klipper macro system
- `[gcode_macro]` provides macro commands using Jinja2 templating.
- `SET_GCODE_VARIABLE` updates macro variables at runtime.
- `[delayed_gcode]` with `UPDATE_DELAYED_GCODE` supports scheduled or repeating actions.
- `[save_variables]` with `SAVE_VARIABLE` persists macro state across restarts.
- `[sdcard_loop]` provides native loop primitives: `SDCARD_LOOP_BEGIN`, `SDCARD_LOOP_END`, `SDCARD_LOOP_DESIST`.

#### Critical Klipper macro nuance
- Macro templates are evaluated in full before generated commands are executed, which matters for state-dependent logic.

## Quick compatibility map

| Intent | Marlin style | Klipper compatibility | Klipper-native pattern |
| --- | --- | --- | --- |
| Absolute/relative moves | `G90` / `G91` | Yes | Same + state-safe macros with `SAVE_GCODE_STATE` / `RESTORE_GCODE_STATE` |
| Extruder absolute/relative | `M82` / `M83` | Yes | Same |
| Set current position | `G92` | Yes | For offsets, often `SET_GCODE_OFFSET` |
| Home axes | `G28` | Yes | Same; can be customized with homing override/macros |
| Speed/flow overrides | `M220` / `M221` | Yes | Same (or macro-managed tuning workflows) |
| Fan control | `M106` / `M107` | Yes | `SET_FAN_SPEED` for configured generic fans |
| Wait for planner drain | `M400` | Yes | Same |
| Emergency stop | `M112` | Yes | Also `FIRMWARE_RESTART`/`RESTART` for recovery workflows |
| Toolchange | `Tn` | Not a universal native workflow | `ACTIVATE_EXTRUDER` + macros |
| Filament change | `M600` | Usually macro-defined if desired | `PAUSE`/`RESUME` + custom macros |
| Stored macros | `M810`-`M819` | Not native equivalents by command number | `[gcode_macro]`, `SET_GCODE_VARIABLE` |
| Loop markers | `M808` | Usually macro/emulation | `SDCARD_LOOP_*` |

## Practical command patterns

### Marlin patterns
- Coordinate and extruder state setup:
  - `G90`
  - `M83`
- Runtime scaling:
  - `M220 S90`
  - `M221 S98`
- Ensure motion finished before action:
  - `M400`
  - `M300 S440 P100`
- Persist/reset cycle:
  - `M503`
  - `M502`
  - `M500`
- Define and run macro slot:
  - `M815 G0 X0 Y0|G0 Z10|M300 S440 P50`
  - `M815`

### Klipper-native style patterns
- Tool activation and pause workflow:
  - `ACTIVATE_EXTRUDER EXTRUDER=extruder1`
  - `PAUSE`
  - `RESUME`
- Macro state and scheduling:
  - `SET_GCODE_VARIABLE MACRO=my_macro VARIABLE=my_state VALUE=1`
  - `UPDATE_DELAYED_GCODE ID=my_timer DURATION=10`
  - `SAVE_VARIABLE VARIABLE=my_state VALUE=1`
- Looping from virtual SD:
  - `SDCARD_LOOP_BEGIN COUNT=5`
  - `SDCARD_LOOP_END`

## Primary sources

### Marlin G-code docs
- https://marlinfw.org/meta/gcode/
- https://marlinfw.org/docs/gcode/G000-G001.html
- https://marlinfw.org/docs/gcode/G028.html
- https://marlinfw.org/docs/gcode/G090.html
- https://marlinfw.org/docs/gcode/G091.html
- https://marlinfw.org/docs/gcode/G092.html
- https://marlinfw.org/docs/gcode/M082.html
- https://marlinfw.org/docs/gcode/M083.html
- https://marlinfw.org/docs/gcode/M106.html
- https://marlinfw.org/docs/gcode/M107.html
- https://marlinfw.org/docs/gcode/M112.html
- https://marlinfw.org/docs/gcode/M220.html
- https://marlinfw.org/docs/gcode/M221.html
- https://marlinfw.org/docs/gcode/M400.html
- https://marlinfw.org/docs/gcode/M500.html
- https://marlinfw.org/docs/gcode/M501.html
- https://marlinfw.org/docs/gcode/M502.html
- https://marlinfw.org/docs/gcode/M503.html
- https://marlinfw.org/docs/gcode/M600.html
- https://marlinfw.org/docs/gcode/M808.html
- https://marlinfw.org/docs/gcode/M810-M819.html
- https://marlinfw.org/docs/gcode/T.html

### Klipper docs
- https://www.klipper3d.org/G-Codes.html
- https://www.klipper3d.org/Command_Templates.html
- https://www.klipper3d.org/Config_Reference.html#gcode_macro
