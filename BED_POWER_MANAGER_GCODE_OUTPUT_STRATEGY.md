# Bed Power Manager G-code Output Strategy

Reviewed: 2026-04-25
Scope: Web slicer temperature command emission for profiles with N extruders and N bed heater controllers.

## Goal

Ensure generated G-code is compatible with Klipper + Marlin-flavor command paths, and works correctly with `bed_power_manager` zone routing.

## Implemented Behavior

### 1. Per-extruder temperatures (N extruders)

The slicer now carries and emits per-tool nozzle temperatures:
- Start (set): `M104 S<temp> T<tool_index>`
- Start (wait): `M109 S<temp> T<tool_index>`
- Layer 1 switch to normal temps: `M104 S<temp> T<tool_index>`
- End: `M104 S0 T<tool_index>`

Rules:
- Tool indexing is zero-based (`T0`, `T1`, `T2`, ...).
- Zero/disabled tool temps are skipped for start wait (`M109`) and start set (`M104`) to avoid unnecessary waits.
- End G-code always emits tool-off commands for all configured tools.

### 2. Per-bed-controller temperatures (N bed controllers)

The slicer now emits per-bed-controller bed commands when more than one controller exists:
- Start (set): `M140 S<temp> T<zone_index>`
- Start (wait): `M190 S<temp> T<zone_index>`
- Layer 1 switch to normal temps: `M140 S<temp> T<zone_index>`
- End: `M140 S0 T<zone_index>`

Rules:
- Bed zone indexing is one-based for `bed_power_manager` routing (`T1`, `T2`, `T3`, ...).
- Zone `T0` is "all zones" and is not used for multi-zone per-controller emission.
- `M190` waits are only emitted for zones with target temp > 0.
- `M140` set/off commands include zero targets so disabled zones are explicit.

### 3. Single-channel fallback

For single extruder/single bed profiles, output remains compatible with classic command style:
- Nozzle lines omit `T` when only one tool exists.
- Bed lines omit `T` when only one bed controller exists.

## Data Flow

Temperature channels are mapped from prepare settings into slicer config:
- `nozzleTemps`
- `firstLayerNozzleTemps`
- `bedControllerTemps`
- `firstLayerBedControllerTemps`

These are consumed by G-code export for start/layer/end temperature command generation.

## Bed Power Manager Compatibility Notes

From `bed_power_manager` behavior:
- `M140`/`M190` with `T1..T4` route to explicit bed zones.
- `M140`/`M190` with `T0` apply to all zones.
- Waiting behavior is controlled by manager-side tolerance logic.

Practical recommendation:
- Emit explicit `S` on all `M140`/`M190` commands.
- Emit per-zone `Tn` commands for multi-zone beds.
- Avoid bare `M140`/`M190` with omitted `S`.

## File References

Implementation:
- `src/util/slicer/settingsMapper.ts`
- `src/util/slicer/types.ts`
- `src/util/slicer/algorithms/gcodeExport.ts`

Validation:
- `tests/unit/slicer/settingsMapper.test.ts`
- `tests/unit/slicer/gcodeExport.test.ts`
