/**
 * G-code Stitcher
 *
 * Combines multiple pre-sliced G-code files into a single sequential print job.
 * Each part is offset to its placement position on the build plate and printed
 * one after another, sharing a single start/end G-code wrapper.
 *
 * Key constraints:
 * - X/Y coordinates are offset; Z, E, F, temperatures are unchanged
 * - G28 (home) commands inside part bodies are replaced with safe travel moves
 * - I/J arc offsets (G2/G3) are relative to current position, so they stay unchanged
 * - G92 set-position X/Y values are offset
 * - Start G-code comes from the first part; end G-code from the last part
 * - Travel moves + retraction inserted between sequential parts
 */

export interface StitchOptions {
    /** Z-hop height during travel between parts (mm) */
    travelZHop: number
    /** Travel feedrate between parts (mm/min) */
    travelFeedrate: number
    /** Retraction length before travel (mm) */
    retractLength: number
    /** Retraction feedrate (mm/min) */
    retractFeedrate: number
    /** Whether to use relative extrusion (M83) - auto-detected if not set */
    relativeExtrusion?: boolean
}

const DEFAULT_OPTIONS: StitchOptions = {
    travelZHop: 5,
    travelFeedrate: 9000,
    retractLength: 1.0,
    retractFeedrate: 2400,
}

export interface StitchPart {
    /** Raw G-code text */
    gcode: string
    /** File name for comments */
    fileName: string
    /** X offset to apply (placement.x - originalCenter.x) */
    offsetX: number
    /** Y offset to apply (placement.y - originalCenter.y) */
    offsetY: number
    /** Rotation in degrees (0, 90, 180, 270) */
    rotation: 0 | 90 | 180 | 270
}

interface SplitGcode {
    preamble: string[]
    body: string[]
    postamble: string[]
}

const PARAM_REGEX = /([XYZIJEF])([+-]?\d*\.?\d+)/g

/**
 * Check if a line is a temperature command (part of start/end gcode).
 */
function isTemperatureCommand(cmd: string): boolean {
    return /^M(104|109|140|190|191)\b/.test(cmd)
}

/**
 * Check if a line is a start-gcode marker (home, ABL, fan, etc.).
 */
function isStartGcodeCommand(cmd: string): boolean {
    return /^(G28|G29|G32|M82|M83|M106|M107|M220|M221)\b/.test(cmd) ||
        isTemperatureCommand(cmd)
}

/**
 * Split G-code into preamble (start code), body (print layers), and postamble (end code).
 *
 * Heuristic: the preamble ends when we encounter the first extrusion move
 * (a G1 with an E parameter) after the first layer Z height.
 * The postamble starts after the last extrusion move.
 */
export function splitGcode(gcode: string): SplitGcode {
    const lines = gcode.split('\n')
    let firstExtrusionLine = -1
    let lastExtrusionLine = -1

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        const commentIdx = trimmed.indexOf(';')
        const cmd = commentIdx >= 0 ? trimmed.substring(0, commentIdx).trim() : trimmed
        if (!cmd) continue

        if (/^G[01]\b/.test(cmd) && /E[+-]?\d/.test(cmd)) {
            if (firstExtrusionLine === -1) firstExtrusionLine = i
            lastExtrusionLine = i
        }
    }

    if (firstExtrusionLine === -1) {
        // No extrusion found — entire file is preamble
        return { preamble: lines, body: [], postamble: [] }
    }

    // Walk backward from firstExtrusionLine to find a natural break point
    // (a ;LAYER_CHANGE, ;TYPE:, or the last start-gcode command)
    let preambleEnd = firstExtrusionLine
    for (let i = firstExtrusionLine - 1; i >= 0; i--) {
        const trimmed = lines[i].trim()
        if (trimmed.startsWith(';LAYER_CHANGE') ||
            trimmed.startsWith(';LAYER:') ||
            trimmed.startsWith(';TYPE:')) {
            preambleEnd = i
            break
        }
        const cmd = trimmed.replace(/;.*/, '').trim()
        if (cmd && !isStartGcodeCommand(cmd) && !/^G[01]\b/.test(cmd)) {
            continue
        }
    }

    // Postamble starts after the last extrusion line
    const postambleStart = lastExtrusionLine + 1

    return {
        preamble: lines.slice(0, preambleEnd),
        body: lines.slice(preambleEnd, postambleStart),
        postamble: lines.slice(postambleStart),
    }
}

/**
 * Apply X/Y coordinate offset to a single G-code line.
 * Handles G0/G1 moves, G2/G3 arcs (only X/Y endpoint, not I/J),
 * and G92 set-position.
 */
export function offsetLine(
    line: string,
    dx: number,
    dy: number,
    rotation: 0 | 90 | 180 | 270
): string {
    const trimmed = line.trim()
    const commentIdx = trimmed.indexOf(';')
    const cmd = commentIdx >= 0 ? trimmed.substring(0, commentIdx).trim() : trimmed
    const comment = commentIdx >= 0 ? trimmed.substring(commentIdx) : ''

    if (!cmd) return line

    const upper = cmd.split(' ')[0].toUpperCase()

    // Handle G28 — replace with comment (we don't want to re-home mid-print)
    if (upper === 'G28') {
        return '; G28 removed for sequential printing' + (comment ? ' ' + comment : '')
    }

    // Only offset move/arc/set-position commands
    if (upper !== 'G0' && upper !== 'G1' &&
        upper !== 'G2' && upper !== 'G3' &&
        upper !== 'G92') {
        return line
    }

    // Parse and transform parameters
    let result = cmd.replace(PARAM_REGEX, (match, param: string, value: string) => {
        const num = parseFloat(value)
        if (param === 'X') {
            const [rx, ] = applyRotationToOffset(num, 0, rotation)
            return `${param}${formatCoord(rx + dx)}`
        }
        if (param === 'Y') {
            const [, ry] = applyRotationToOffset(0, num, rotation)
            return `${param}${formatCoord(ry + dy)}`
        }
        // I/J are relative offsets for arcs — they need rotation but not translation
        if (param === 'I' && rotation !== 0) {
            const [ri, ] = applyRotationToOffset(num, 0, rotation)
            return `${param}${formatCoord(ri)}`
        }
        if (param === 'J' && rotation !== 0) {
            const [, rj] = applyRotationToOffset(0, num, rotation)
            return `${param}${formatCoord(rj)}`
        }
        return match
    })

    // For rotation, we need to handle X and Y together.
    // The regex approach above handles them independently which is wrong for rotation.
    // Re-do with paired X/Y extraction for non-zero rotation.
    if (rotation !== 0) {
        result = offsetLineWithRotation(cmd, dx, dy, rotation)
    }

    return result + (comment ? ' ' + comment : '')
}

/**
 * Offset a G-code line with rotation applied to paired X/Y coordinates.
 */
function offsetLineWithRotation(
    cmd: string,
    dx: number,
    dy: number,
    rotation: 0 | 90 | 180 | 270
): string {
    const parts = cmd.split(/\s+/)
    const command = parts[0]
    const params = new Map<string, number>()

    for (let i = 1; i < parts.length; i++) {
        const p = parts[i]
        if (p.length > 1) {
            const key = p[0].toUpperCase()
            const val = parseFloat(p.substring(1))
            if (!isNaN(val)) {
                params.set(key, val)
            }
        }
    }

    const upper = command.toUpperCase()

    // Rotate and offset X/Y
    if (params.has('X') || params.has('Y')) {
        const origX = params.get('X') ?? 0
        const origY = params.get('Y') ?? 0
        const [rx, ry] = applyRotationToOffset(origX, origY, rotation)
        if (params.has('X')) params.set('X', rx + dx)
        if (params.has('Y')) params.set('Y', ry + dy)
    }

    // Rotate I/J for arcs (relative, no translation)
    if ((upper === 'G2' || upper === 'G3') && (params.has('I') || params.has('J'))) {
        const origI = params.get('I') ?? 0
        const origJ = params.get('J') ?? 0
        const [ri, rj] = applyRotationToOffset(origI, origJ, rotation)
        if (params.has('I')) params.set('I', ri)
        if (params.has('J')) params.set('J', rj)
    }

    // Reconstruct
    let result = command
    for (const [key, val] of params) {
        result += ` ${key}${formatCoord(val)}`
    }
    return result
}

/**
 * Apply rotation to X/Y coordinates.
 * Rotation is in degrees (0, 90, 180, 270) around the origin.
 */
function applyRotationToOffset(
    x: number,
    y: number,
    rotation: 0 | 90 | 180 | 270
): [number, number] {
    switch (rotation) {
        case 0: return [x, y]
        case 90: return [-y, x]
        case 180: return [-x, -y]
        case 270: return [y, -x]
    }
}

/**
 * Format a coordinate value, avoiding unnecessary trailing zeros.
 */
function formatCoord(value: number): string {
    const fixed = value.toFixed(3)
    return fixed.replace(/\.?0+$/, '') || '0'
}

/**
 * Stitch multiple G-code parts into a single sequential print job.
 *
 * @param parts - Array of parts in print order (index 0 prints first)
 * @param options - Stitching configuration
 * @param onProgress - Progress callback (0-100)
 * @returns Combined G-code string
 */
export function stitchGcodes(
    parts: StitchPart[],
    options: Partial<StitchOptions> = {},
    onProgress?: (progress: number) => void
): string {
    if (parts.length === 0) return ''
    if (parts.length === 1) {
        // Single part — just offset and return
        return offsetEntireGcode(parts[0])
    }

    const opts = { ...DEFAULT_OPTIONS, ...options }
    const output: string[] = []

    // Split all parts
    const splits = parts.map((part, i) => {
        const split = splitGcode(part.gcode)
        if (onProgress) {
            onProgress(((i + 1) / parts.length) * 30)
        }
        return split
    })

    // 1. Use first part's preamble (start G-code: home, heat, ABL, etc.)
    output.push('; ========================================')
    output.push('; Sequential Build Plate Composite Job')
    output.push(`; Parts: ${parts.length}`)
    output.push(`; Generated: ${new Date().toISOString()}`)
    output.push('; ========================================')
    output.push('')

    for (const line of splits[0].preamble) {
        output.push(line)
    }

    // 2. Print each part's body with coordinate offsets
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const split = splits[i]

        output.push('')
        output.push(`; === SEQUENTIAL PART ${i + 1}/${parts.length}: ${part.fileName} ===`)
        output.push(`; Offset: X${formatCoord(part.offsetX)} Y${formatCoord(part.offsetY)} Rotation: ${part.rotation}°`)
        output.push('')

        // Insert travel move to part start (for parts after the first)
        if (i > 0) {
            // Retract
            output.push(`G1 E-${formatCoord(opts.retractLength)} F${opts.retractFeedrate}`)
            // Z-hop above tallest printed part so far
            const maxPrintedZ = parts.slice(0, i)
                .reduce((max, p) => Math.max(max, p.gcode.length > 0 ? 200 : 0), 0) // conservative
            output.push(`G0 Z${formatCoord(Math.max(maxPrintedZ, opts.travelZHop))} F${opts.travelFeedrate}`)
            // Travel to new part area
            output.push(`G0 X${formatCoord(part.offsetX)} Y${formatCoord(part.offsetY)} F${opts.travelFeedrate}`)
            // Un-retract
            output.push(`G1 E${formatCoord(opts.retractLength)} F${opts.retractFeedrate}`)
        }

        // Offset and write body lines
        for (let li = 0; li < split.body.length; li++) {
            output.push(offsetLine(split.body[li], part.offsetX, part.offsetY, part.rotation))
        }

        if (onProgress) {
            onProgress(30 + ((i + 1) / parts.length) * 60)
        }
    }

    // 3. Use last part's postamble (end G-code: cooldown, present bed)
    output.push('')
    output.push('; === END OF SEQUENTIAL JOB ===')
    output.push('')

    for (const line of splits[splits.length - 1].postamble) {
        output.push(line)
    }

    if (onProgress) {
        onProgress(100)
    }

    return output.join('\n')
}

/**
 * Offset an entire G-code file (single part, no splitting needed).
 */
function offsetEntireGcode(part: StitchPart): string {
    if (part.offsetX === 0 && part.offsetY === 0 && part.rotation === 0) {
        return part.gcode
    }

    const lines = part.gcode.split('\n')
    return lines
        .map((line) => offsetLine(line, part.offsetX, part.offsetY, part.rotation))
        .join('\n')
}
