/**
 * G-code Export
 *
 * Converts ordered toolpath segments into G-code text.
 * Generates standard Marlin/Klipper-compatible G-code.
 */

import { LayerToolpath, SlicerConfig } from '../types'

/**
 * Format a G-code coordinate value
 */
function fmt(val: number, decimals = 3): string {
    return val.toFixed(decimals)
}

const PRIME_MAX_CROSS_SECTION_MM2 = 0.55
const MIN_GCODE_SEGMENT_LENGTH = 0.01

function normalizeChannelTemps(source: unknown, fallback: number): number[] {
    const values = Array.isArray(source) ? source : []
    const normalized = values
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v >= 0)
    if (normalized.length > 0) {
        return normalized
    }
    return [fallback]
}

function resolveNozzleTemps(config: SlicerConfig, firstLayer: boolean): number[] {
    const normalTemps = normalizeChannelTemps(config.nozzleTemps, config.nozzleTemp)
    if (!firstLayer) {
        return normalTemps
    }

    const explicitFirstLayer = Array.isArray(config.firstLayerNozzleTemps) ? config.firstLayerNozzleTemps : []
    if (explicitFirstLayer.length === normalTemps.length) {
        return explicitFirstLayer.map((v, idx) => {
            const num = Number(v)
            return Number.isFinite(num) && num >= 0 ? num : normalTemps[idx]
        })
    }

    const delta = (config.firstLayerNozzleTemp ?? config.nozzleTemp) - config.nozzleTemp
    return normalTemps.map((temp) => Math.max(0, temp + delta))
}

function resolveBedControllerTemps(config: SlicerConfig, firstLayer: boolean): number[] {
    const normalTemps = normalizeChannelTemps(config.bedControllerTemps, config.bedTemp)
    if (!firstLayer) {
        return normalTemps
    }

    const explicitFirstLayer = Array.isArray(config.firstLayerBedControllerTemps)
        ? config.firstLayerBedControllerTemps
        : []
    if (explicitFirstLayer.length === normalTemps.length) {
        return explicitFirstLayer.map((v, idx) => {
            const num = Number(v)
            return Number.isFinite(num) && num >= 0 ? num : normalTemps[idx]
        })
    }

    const delta = (config.firstLayerBedTemp ?? config.bedTemp) - config.bedTemp
    return normalTemps.map((temp) => Math.max(0, temp + delta))
}

function appendNozzleTempCommands(
    lines: string[],
    command: 'M104' | 'M109',
    temps: number[],
    actionComment: string,
    includeZero: boolean
): void {
    const multiTool = temps.length > 1
    const emitted = temps
        .map((temp, idx) => ({ temp, idx }))
        .filter(({ temp }) => includeZero || temp > 0)

    if (emitted.length === 0 && !includeZero) {
        return
    }

    for (const { temp, idx } of emitted) {
        const toolSuffix = multiTool ? ` T${idx}` : ''
        lines.push(`${command} S${temp}${toolSuffix} ; ${actionComment}`)
    }
}

function appendBedTempCommands(
    lines: string[],
    command: 'M140' | 'M190',
    temps: number[],
    actionComment: string,
    includeZero: boolean
): void {
    const multiController = temps.length > 1
    const emitted = temps
        .map((temp, idx) => ({ temp, idx }))
        .filter(({ temp }) => includeZero || temp > 0)

    if (emitted.length === 0 && !includeZero) {
        return
    }

    for (const { temp, idx } of emitted) {
        const controllerSuffix = multiController ? ` T${idx + 1}` : ''
        lines.push(`${command} S${temp}${controllerSuffix} ; ${actionComment}`)
    }
}

/**
 * Substitute template variables in custom G-code.
 *
 * Supported variables (case-insensitive, PrusaSlicer-compatible):
 *   {nozzle_temperature}        / {nozzle_temp}
 *   {first_layer_temperature}   / {first_layer_nozzle_temp}
 *   {bed_temperature}           / {bed_temp}
 *   {first_layer_bed_temperature} / {first_layer_bed_temp}
 *   {layer_height}
 *   {first_layer_height}
 *   {nozzle_diameter}
 *   {filament_diameter}
 *   {line_width}
 *   {print_speed}
 *   {travel_speed}
 *   {first_layer_speed}
 *   {total_layer_count}
 *
 * Layer-change only:
 *   {layer_num}
 *   {layer_z}
 */
function substituteGcodeVars(template: string, config: SlicerConfig, extra?: Record<string, string>): string {
    const vars: Record<string, string> = {
        nozzle_temperature: String(config.nozzleTemp),
        nozzle_temp: String(config.nozzleTemp),
        first_layer_temperature: String(config.firstLayerNozzleTemp),
        first_layer_nozzle_temp: String(config.firstLayerNozzleTemp),
        bed_temperature: String(config.bedTemp),
        bed_temp: String(config.bedTemp),
        first_layer_bed_temperature: String(config.firstLayerBedTemp),
        first_layer_bed_temp: String(config.firstLayerBedTemp),
        layer_height: String(config.layerHeight),
        first_layer_height: String(config.firstLayerHeight),
        nozzle_diameter: String(config.nozzleDiameter),
        filament_diameter: String(config.filamentDiameter),
        line_width: String(config.lineWidth),
        print_speed: String(config.printSpeed),
        travel_speed: String(config.travelSpeed),
        first_layer_speed: String(config.firstLayerSpeed),
        total_layer_count: '0', // filled by caller if available
        ...extra,
    }

    return template.replace(/\{(\w+)\}/gi, (match, key) => {
        const lower = key.toLowerCase()
        return vars[lower] !== undefined ? vars[lower] : match
    })
}

/**
 * Generate PrusaSlicer-compatible thumbnail block.
 * Embeds a base64-encoded PNG image as gcode comments.
 * Recognized by Moonraker, Mainsail, OctoPrint, etc.
 */
function generateThumbnailBlock(base64Data: string, width: number, height: number): string {
    const lines: string[] = []
    lines.push(`; thumbnail begin ${width} ${height} ${base64Data.length}`)
    for (let i = 0; i < base64Data.length; i += 78) {
        lines.push(`; ${base64Data.substring(i, i + 78)}`)
    }
    lines.push('; thumbnail end')
    return lines.join('\n')
}

/**
 * Generate the G-code start sequence.
 * Uses config.customStartGcode when provided, otherwise falls back
 * to a safe default sequence.
 */
function generateStartGcode(config: SlicerConfig, thumbnail?: string): string {
    const header = [
        '; Generated by Mainsail Slicer',
        `; Layer height: ${config.layerHeight}mm`,
        `; First layer height: ${config.firstLayerHeight}mm`,
        `; Nozzle diameter: ${config.nozzleDiameter}mm`,
        `; Filament diameter: ${config.filamentDiameter}mm`,
        `; Wall count: ${config.wallCount}`,
        `; Infill density: ${(config.infillDensity * 100).toFixed(0)}%`,
        `; Infill pattern: ${config.infillPattern}`,
        `; Print speed: ${config.printSpeed}mm/s`,
        `; Travel speed: ${config.travelSpeed}mm/s`,
        '',
    ].join('\n')

    // --- Thumbnail (PrusaSlicer-compatible, before any G-commands) ---
    let thumbnailBlock = ''
    if (thumbnail) {
        // Strip data URL prefix if present
        const raw = thumbnail.includes(',') ? thumbnail.substring(thumbnail.indexOf(',') + 1) : thumbnail
        thumbnailBlock = generateThumbnailBlock(raw, 300, 300) + '\n\n'
    }

    // --- Custom start G-code (template with variable substitution) ---
    if (config.customStartGcode && config.customStartGcode.trim()) {
        const body = substituteGcodeVars(config.customStartGcode, config)
        return header + thumbnailBlock + ';TYPE:Custom\n' + body + '\nG92 E0 ; Reset extruder\n'
    }

    // --- Default start G-code (generic printer, no macros) ---
    const primeStartX = 5
    const primeEndX = 60
    const primeY = 5
    const primeDistance = Math.abs(primeEndX - primeStartX)
    const filamentArea = Math.PI * (config.filamentDiameter / 2) ** 2
    const primeCrossSection = Math.min(config.lineWidth * config.firstLayerHeight, PRIME_MAX_CROSS_SECTION_MM2)
    const primeExtrusion = (primeCrossSection * primeDistance) / filamentArea

    const lines: string[] = [
        ';TYPE:Custom',
        'G90 ; Absolute positioning',
        'M82 ; Absolute extrusion',
        'G28 ; Home all axes',
    ]

    const firstLayerNozzleTemps = resolveNozzleTemps(config, true)
    const firstLayerBedControllerTemps = resolveBedControllerTemps(config, true)
    appendNozzleTempCommands(lines, 'M104', firstLayerNozzleTemps, 'Set nozzle temp', false)
    appendBedTempCommands(lines, 'M140', firstLayerBedControllerTemps, 'Set bed temp', true)
    appendNozzleTempCommands(lines, 'M109', firstLayerNozzleTemps, 'Wait for nozzle temp', false)
    appendBedTempCommands(lines, 'M190', firstLayerBedControllerTemps, 'Wait for bed temp', false)
    lines.push('')
    lines.push('; Prime line')
    lines.push('G1 Z2 F3000')
    lines.push(`G1 X${fmt(primeStartX)} Y${fmt(primeY)} F${config.travelSpeed * 60}`)
    lines.push(`G1 Z${fmt(config.firstLayerHeight)} F3000`)
    lines.push('G92 E0 ; Reset extruder before priming')
    lines.push(`G1 X${fmt(primeEndX)} Y${fmt(primeY)} E${fmt(primeExtrusion, 5)} F${config.firstLayerSpeed * 60} ; Prime`)
    lines.push('G1 E-0.5 F1800 ; Retract slightly')
    lines.push('G92 E0 ; Reset extruder')
    lines.push('')

    return header + thumbnailBlock + lines.join('\n')
}

/**
 * Generate the G-code end sequence.
 * Uses config.customEndGcode when provided.
 */
function generateEndGcode(config: SlicerConfig): string {
    if (config.customEndGcode && config.customEndGcode.trim()) {
        return '\n;TYPE:Custom\n' + substituteGcodeVars(config.customEndGcode, config)
    }

    const lines: string[] = [
        '',
        ';TYPE:Custom',
        'G91 ; Relative positioning',
        'G1 E-2 F1800 ; Retract',
        'G1 Z10 F3000 ; Lift',
        'G90 ; Absolute positioning',
        'G1 X5 Y200 F6000 ; Present print',
    ]

    const nozzleTemps = resolveNozzleTemps(config, false)
    const bedControllerTemps = resolveBedControllerTemps(config, false)
    appendNozzleTempCommands(lines, 'M104', nozzleTemps.map(() => 0), 'Turn off nozzle', true)
    appendBedTempCommands(lines, 'M140', bedControllerTemps.map(() => 0), 'Turn off bed', true)
    lines.push('M84 ; Disable motors')
    lines.push('M107 ; Fan off')

    return lines.join('\n')
}

/**
 * Map move type to ;TYPE: comment (for toolpath visualization)
 */
function typeComment(type: string): string {
    switch (type) {
        case 'wall-outer': return ';TYPE:Outer wall'
        case 'wall-inner': return ';TYPE:Inner wall'
        case 'floor': return ';TYPE:Bottom solid infill'
        case 'roof': return ';TYPE:Top solid infill'
        case 'infill': return ';TYPE:Sparse infill'
        case 'support': return ';TYPE:Support'
        case 'skirt': return ';TYPE:Skirt'
        case 'brim': return ';TYPE:Brim'
        case 'travel': return ''
        default: return ''
    }
}

/**
 * Export a sliced model to G-code string.
 */
export function exportGcode(layers: LayerToolpath[], config: SlicerConfig, thumbnail?: string): string {
    const lines: string[] = []
    lines.push(generateStartGcode(config, thumbnail))

    let currentE = 0
    let currentZ = 0
    let currentType = ''
    let lastFeedrate = 0
    let isRetracted = false
    // Track nozzle XY so we can insert missing travel moves.
    // Prime line ends at (60, 5).
    let curX = 60
    let curY = 5
    const travelFeedrate = config.travelSpeed * 60
    const minTravelForRetract = 1.5

    for (const layer of layers) {
        // Layer change
        lines.push(``)
        lines.push(`;LAYER_CHANGE`)
        lines.push(`;Z:${fmt(layer.z)}`)
        lines.push(`;LAYER:${layer.layerIndex}`)

        // Z-gap warning: detect jumps larger than 2× layer height
        const zJump = layer.z - currentZ
        if (currentZ > 0 && zJump > config.layerHeight * 2) {
            lines.push(`; WARNING: Z gap of ${fmt(zJump)}mm detected (expected ~${fmt(config.layerHeight)}mm)`)
        }

        lines.push(`G1 Z${fmt(layer.z)} F3000`)
        currentZ = layer.z

        // Custom layer change G-code (e.g. timelapse, pressure advance tuning)
        if (config.customLayerChangeGcode && config.customLayerChangeGcode.trim()) {
            const layerVars: Record<string, string> = {
                layer_num: String(layer.layerIndex),
                layer_z: fmt(layer.z),
                total_layer_count: String(layers.length),
            }
            lines.push(substituteGcodeVars(config.customLayerChangeGcode, config, layerVars))
        }

        // Periodic E reset every 50 layers to prevent floating-point drift
        if (layer.layerIndex > 0 && layer.layerIndex % 50 === 0) {
            lines.push(`G92 E0 ; reset E counter`)
            currentE = 0
        }

        // Set per-layer temperatures and fan
        if (layer.layerIndex === 1) {
            // Switch to normal temps after first layer
            const nozzleTemps = resolveNozzleTemps(config, false)
            const bedControllerTemps = resolveBedControllerTemps(config, false)
            appendNozzleTempCommands(lines, 'M104', nozzleTemps, 'Switch to normal nozzle temp', true)
            appendBedTempCommands(lines, 'M140', bedControllerTemps, 'Switch to normal bed temp', true)
        }
        if (layer.layerIndex === config.fanStartLayer) {
            lines.push(`M106 S${config.fanSpeed}`)
        }

        for (const seg of layer.segments) {
            const dx = seg.to.x - seg.from.x
            const dy = seg.to.y - seg.from.y
            const segLen = Math.sqrt(dx * dx + dy * dy)
            if (segLen < MIN_GCODE_SEGMENT_LENGTH && Math.abs(seg.extrusionAmount) < 1e-5) {
                continue
            }

            // Type comments
            const tc = typeComment(seg.type)
            if (tc && tc !== currentType) {
                lines.push(tc)
                currentType = tc
            }

            if (seg.type === 'travel') {
                // Handle retraction before travel
                if (seg.extrusionAmount < 0 && !isRetracted) {
                    currentE += seg.extrusionAmount
                    lines.push(`G1 E${fmt(currentE, 5)} F${config.retractSpeed * 60}`)
                    isRetracted = true
                    // Z-hop
                    if (config.retractLift > 0) {
                        lines.push(`G1 Z${fmt(currentZ + config.retractLift)} F3000`)
                    }
                }
                // Travel move
                const f = seg.feedrate !== lastFeedrate ? ` F${Math.round(seg.feedrate)}` : ''
                lines.push(`G0 X${fmt(seg.to.x)} Y${fmt(seg.to.y)}${f}`)
                lastFeedrate = seg.feedrate
                curX = seg.to.x
                curY = seg.to.y
            } else {
                // Safety: if nozzle isn't at seg.from, insert a travel first.
                const gapX = seg.from.x - curX
                const gapY = seg.from.y - curY
                const gap = Math.sqrt(gapX * gapX + gapY * gapY)
                if (gap > 0.01) {
                    // Retract for long gaps
                    if (gap > minTravelForRetract && !isRetracted) {
                        currentE -= config.retractDistance
                        lines.push(`G1 E${fmt(currentE, 5)} F${config.retractSpeed * 60}`)
                        isRetracted = true
                        if (config.retractLift > 0) {
                            lines.push(`G1 Z${fmt(currentZ + config.retractLift)} F3000`)
                        }
                    }
                    lines.push(`G0 X${fmt(seg.from.x)} Y${fmt(seg.from.y)} F${travelFeedrate}`)
                    lastFeedrate = travelFeedrate
                    curX = seg.from.x
                    curY = seg.from.y
                }

                // Un-retract if needed
                if (isRetracted) {
                    // Drop z-hop
                    if (config.retractLift > 0) {
                        lines.push(`G1 Z${fmt(currentZ)} F3000`)
                    }
                    currentE += config.retractDistance
                    lines.push(`G1 E${fmt(currentE, 5)} F${config.retractSpeed * 60}`)
                    isRetracted = false
                }

                // Extrusion move
                currentE += seg.extrusionAmount
                const f = seg.feedrate !== lastFeedrate ? ` F${Math.round(seg.feedrate)}` : ''
                lines.push(`G1 X${fmt(seg.to.x)} Y${fmt(seg.to.y)} E${fmt(currentE, 5)}${f}`)
                lastFeedrate = seg.feedrate
                curX = seg.to.x
                curY = seg.to.y
            }
        }
    }

    lines.push(generateEndGcode(config))

    return lines.join('\n')
}

/**
 * Compute summary statistics from the sliced result
 */
export function computeStats(layers: LayerToolpath[], config: SlicerConfig): {
    layerCount: number
    filamentUsedMm: number
    filamentUsedM: number
    filamentWeightG: number
    estimatedTimeS: number
    estimatedTimeFormatted: string
} {
    const layerCount = layers.length
    const filamentUsedMm = layers.length > 0 ? layers[layers.length - 1].filamentUsed : 0
    const filamentUsedM = filamentUsedMm / 1000

    // PLA density ~1.24 g/cm³
    const filamentRadius = config.filamentDiameter / 2
    const filamentVolumeMm3 = Math.PI * filamentRadius * filamentRadius * filamentUsedMm
    const filamentWeightG = (filamentVolumeMm3 / 1000) * 1.24 // mm³ → cm³ → g

    // Estimate print time from all segments
    let totalTimeS = 0
    for (const layer of layers) {
        for (const seg of layer.segments) {
            const dx = seg.to.x - seg.from.x
            const dy = seg.to.y - seg.from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (seg.feedrate > 0) {
                totalTimeS += (dist / seg.feedrate) * 60 // feedrate in mm/min
            }
        }
    }

    // Add time for layer changes, retractions, etc. (~10% overhead)
    totalTimeS *= 1.1

    const hours = Math.floor(totalTimeS / 3600)
    const mins = Math.round((totalTimeS % 3600) / 60)
    const estimatedTimeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

    return {
        layerCount,
        filamentUsedMm: Math.round(filamentUsedMm * 100) / 100,
        filamentUsedM: Math.round(filamentUsedM * 100) / 100,
        filamentWeightG: Math.round(filamentWeightG * 10) / 10,
        estimatedTimeS: Math.round(totalTimeS),
        estimatedTimeFormatted,
    }
}
