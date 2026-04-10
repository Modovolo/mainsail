/**
 * G-code Parser
 *
 * Parses G-code text into structured layer data for toolpath visualization.
 * Handles standard Marlin/Klipper G-code with ;TYPE: and ;LAYER_CHANGE comments.
 *
 * Supported commands:
 * - G0/G1: Linear moves (with optional X Y Z E F parameters)
 * - G2/G3: Arc moves (converted to linear approximation)
 * - G20/G21: Inch/mm units
 * - G28: Home
 * - G92: Set position
 * - G90/G91: Absolute/relative XYZ coordinates
 * - Tn/M6: Tool change
 * - M82/M83: Absolute/relative extrusion
 * - ;TYPE: Feature type comments
 * - ;LAYER_CHANGE / ;LAYER: Layer markers
 */

import {
    GcodeFeatureType,
    GcodeMove,
    GcodeLayer,
    ParsedGcode,
} from './types'

/**
 * Map ;TYPE: comment values to our feature type enum.
 * Covers PrusaSlicer/SuperSlicer/OrcaSlicer/Cura/Kiri:Moto comment styles.
 */
function parseFeatureType(typeStr: string): GcodeFeatureType {
    const t = typeStr.toLowerCase().trim()

    // Outer wall / external perimeter
    if (t.includes('outer wall') || t.includes('external perimeter') || t.includes('outer perimeter')) {
        return 'outer-wall'
    }
    // Inner wall / internal perimeter
    if (t.includes('inner wall') || t.includes('internal perimeter') || t.includes('perimeter')) {
        return 'inner-wall'
    }
    // Top surface
    if (t.includes('top solid') || t.includes('top surface') || t.includes('roof') || t === 'skin') {
        return 'top-solid'
    }
    // Bottom surface
    if (t.includes('bottom solid') || t.includes('bottom surface') || t.includes('floor')) {
        return 'bottom-solid'
    }
    // Solid infill (generic)
    if (t.includes('solid infill') || t.includes('solid fill')) {
        return 'top-solid' // treat as solid
    }
    // Sparse infill
    if (t.includes('infill') || t.includes('fill') || t.includes('sparse')) {
        return 'infill'
    }
    // Support
    if (t.includes('support')) {
        return 'support'
    }
    // Skirt
    if (t.includes('skirt')) {
        return 'skirt'
    }
    // Brim
    if (t.includes('brim')) {
        return 'brim'
    }
    // Travel
    if (t.includes('travel') || t.includes('move')) {
        return 'travel'
    }
    // Custom / other
    if (t.includes('custom') || t.includes('wipe')) {
        return 'custom'
    }

    return 'unknown'
}

/**
 * Parse a single G-code parameter from a command string.
 * e.g., extractParam('G1 X10.5 Y20 E1.23', 'X') → 10.5
 */
function extractParam(line: string, param: string): number | null {
    const regex = new RegExp(`${param}([+-]?[0-9]*\\.?[0-9]+)`)
    const match = line.match(regex)
    return match ? parseFloat(match[1]) : null
}

function normalizeAngle(angle: number): number {
    while (angle <= -Math.PI) angle += Math.PI * 2
    while (angle > Math.PI) angle -= Math.PI * 2
    return angle
}

function computeArcCenterFromRadius(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    radius: number,
    clockwise: boolean
): { cx: number; cy: number } | null {
    const dx = ex - sx
    const dy = ey - sy
    const chord = Math.sqrt(dx * dx + dy * dy)
    if (chord === 0 || chord > 2 * Math.abs(radius)) return null

    const mx = (sx + ex) / 2
    const my = (sy + ey) / 2
    const h = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4))

    const ux = -dy / chord
    const uy = dx / chord

    const c1 = { cx: mx + ux * h, cy: my + uy * h }
    const c2 = { cx: mx - ux * h, cy: my - uy * h }

    const selectCenter = (center: { cx: number; cy: number }) => {
        const a0 = Math.atan2(sy - center.cy, sx - center.cx)
        const a1 = Math.atan2(ey - center.cy, ex - center.cx)
        let delta = normalizeAngle(a1 - a0)
        if (clockwise && delta > 0) delta -= Math.PI * 2
        if (!clockwise && delta < 0) delta += Math.PI * 2
        return { center, delta }
    }

    const o1 = selectCenter(c1)
    const o2 = selectCenter(c2)
    return Math.abs(o1.delta) <= Math.abs(o2.delta) ? o1.center : o2.center
}

/**
 * Parse G-code text into structured layer data.
 *
 * @param gcode - Raw G-code text
 * @param onProgress - Optional progress callback (0-100)
 * @returns Parsed G-code with layers and metadata
 */
export function parseGcode(
    gcode: string,
    onProgress?: (progress: number) => void
): ParsedGcode {
    const lines = gcode.split('\n')
    const totalLines = lines.length

    // Parser state
    let x = 0, y = 0, z = 0, e = 0, f = 1000
    let unitScale = 1
    let relativeXYZ = false
    let relativeE = false
    let currentTool = 0
    let currentType: GcodeFeatureType = 'unknown'
    let currentLayerZ = -1
    let pendingLayerFromComment = false
    let pendingLayerZ: number | null = null
    const metadata: Record<string, string> = {}

    // Result
    const layers: GcodeLayer[] = []
    let currentLayer: GcodeLayer | null = null

    // Bounds tracking
    const bounds = {
        xMin: Infinity, xMax: -Infinity,
        yMin: Infinity, yMax: -Infinity,
        zMin: Infinity, zMax: -Infinity,
    }

    let maxE = 0

    function ensureLayer(newZ: number) {
        if (currentLayer === null || Math.abs(newZ - currentLayerZ) > 0.001) {
            // Finalize current layer bounds
            if (currentLayer && currentLayer.moves.length > 0) {
                layers.push(currentLayer)
            }
            currentLayerZ = newZ
            currentLayer = {
                z: newZ,
                layerIndex: layers.length,
                moves: [],
                bounds: { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity },
            }
        }
    }

    function addMove(nx: number, ny: number, nz: number, ne: number, nf: number) {
        const extruding = ne > e + 0.0001
        const type = extruding ? currentType : 'travel'

        const move: GcodeMove = {
            x: nx, y: ny, z: nz,
            e: ne, f: nf,
            tool: currentTool,
            type,
            extruding,
        }

        if (currentLayer) {
            currentLayer.moves.push(move)
            if (extruding) {
                if (nx < currentLayer.bounds.xMin) currentLayer.bounds.xMin = nx
                if (nx > currentLayer.bounds.xMax) currentLayer.bounds.xMax = nx
                if (ny < currentLayer.bounds.yMin) currentLayer.bounds.yMin = ny
                if (ny > currentLayer.bounds.yMax) currentLayer.bounds.yMax = ny
            }
        }

        // Update global bounds
        if (extruding) {
            if (nx < bounds.xMin) bounds.xMin = nx
            if (nx > bounds.xMax) bounds.xMax = nx
            if (ny < bounds.yMin) bounds.yMin = ny
            if (ny > bounds.yMax) bounds.yMax = ny
            if (nz < bounds.zMin) bounds.zMin = nz
            if (nz > bounds.zMax) bounds.zMax = nz
        }

        if (ne > maxE) maxE = ne
        x = nx; y = ny; z = nz; e = ne; f = nf
    }

    // Parse each line
    for (let i = 0; i < totalLines; i++) {
        const rawLine = lines[i].trim()
        if (rawLine.length === 0) continue

        // Progress reporting
        if (onProgress && i % 10000 === 0) {
            onProgress((i / totalLines) * 100)
        }

        // Strip inline comments (after ;)
        const commentIdx = rawLine.indexOf(';')
        const command = commentIdx >= 0 ? rawLine.substring(0, commentIdx).trim() : rawLine
        const comment = commentIdx >= 0 ? rawLine.substring(commentIdx + 1).trim() : ''

        // Parse comments for metadata and type info
        if (comment) {
            // Feature type
            if (comment.startsWith('TYPE:')) {
                currentType = parseFeatureType(comment.substring(5))
                continue
            }
            // Layer change marker
            if (comment === 'LAYER_CHANGE' || comment.startsWith('LAYER_CHANGE')) {
                // Promote to a new layer on the next extrusion move.
                pendingLayerFromComment = true
                continue
            }
            // Layer number
            if (comment.startsWith('LAYER:')) {
                // Promote to a new layer on the next extrusion move.
                pendingLayerFromComment = true
                continue
            }
            // Z height from comment
            if (comment.startsWith('Z:')) {
                const cz = parseFloat(comment.substring(2))
                if (!isNaN(cz)) {
                    pendingLayerZ = cz
                    pendingLayerFromComment = true
                }
                continue
            }
            // Metadata (header comments)
            if (comment.includes(':') && layers.length === 0) {
                const [key, ...val] = comment.split(':')
                metadata[key.trim()] = val.join(':').trim()
            }

            // If no command part, skip
            if (!command) continue
        }

        if (!command) continue

        // Parse G-code commands
        const cmd = command.split(' ')[0].toUpperCase()

        if (cmd.startsWith('T') && cmd.length > 1) {
            const tool = parseInt(cmd.slice(1), 10)
            if (!Number.isNaN(tool)) {
                currentTool = tool
            }
            continue
        }

        switch (cmd) {
            case 'G0':
            case 'G1': {
                const xVal = extractParam(command, 'X')
                const yVal = extractParam(command, 'Y')
                const zVal = extractParam(command, 'Z')

                const sx = unitScale
                const nx = xVal === null ? x : (relativeXYZ ? x + xVal * sx : xVal * sx)
                const ny = yVal === null ? y : (relativeXYZ ? y + yVal * sx : yVal * sx)
                const nz = zVal === null ? z : (relativeXYZ ? z + zVal * sx : zVal * sx)
                const nf = (extractParam(command, 'F') ?? f / sx) * sx
                let ne = e

                const eVal = extractParam(command, 'E')
                if (eVal !== null) {
                    const se = unitScale
                    ne = relativeE ? e + eVal * se : eVal * se
                }

                const extruding = ne > e + 0.0001
                const zChanged = Math.abs(nz - z) > 0.001

                // Layer advancement should follow print layers, not travel Z-hops.
                if (pendingLayerFromComment && extruding) {
                    const targetZ = pendingLayerZ !== null ? pendingLayerZ : nz
                    ensureLayer(targetZ)
                    pendingLayerFromComment = false
                    pendingLayerZ = null
                } else if (extruding && (currentLayer === null || zChanged)) {
                    ensureLayer(nz)
                }

                addMove(nx, ny, nz, ne, nf)
                break
            }

            case 'G2':
            case 'G3': {
                const clockwise = cmd === 'G2'
                const sx = unitScale

                const xVal = extractParam(command, 'X')
                const yVal = extractParam(command, 'Y')
                const zVal = extractParam(command, 'Z')
                const iVal = extractParam(command, 'I')
                const jVal = extractParam(command, 'J')
                const rVal = extractParam(command, 'R')

                const nx = xVal === null ? x : (relativeXYZ ? x + xVal * sx : xVal * sx)
                const ny = yVal === null ? y : (relativeXYZ ? y + yVal * sx : yVal * sx)
                const nz = zVal === null ? z : (relativeXYZ ? z + zVal * sx : zVal * sx)
                const nf = (extractParam(command, 'F') ?? f / sx) * sx

                let ne = e
                const eVal = extractParam(command, 'E')
                if (eVal !== null) {
                    const se = unitScale
                    ne = relativeE ? e + eVal * se : eVal * se
                }

                const extruding = ne > e + 0.0001
                const zChanged = Math.abs(nz - z) > 0.001

                if (pendingLayerFromComment && extruding) {
                    const targetZ = pendingLayerZ !== null ? pendingLayerZ : nz
                    ensureLayer(targetZ)
                    pendingLayerFromComment = false
                    pendingLayerZ = null
                } else if (extruding && (currentLayer === null || zChanged)) {
                    ensureLayer(nz)
                }

                let cx: number | null = null
                let cy: number | null = null

                if (iVal !== null || jVal !== null) {
                    cx = x + (iVal ?? 0) * sx
                    cy = y + (jVal ?? 0) * sx
                } else if (rVal !== null) {
                    const center = computeArcCenterFromRadius(x, y, nx, ny, rVal * sx, clockwise)
                    if (center) {
                        cx = center.cx
                        cy = center.cy
                    }
                }

                if (cx === null || cy === null) {
                    addMove(nx, ny, nz, ne, nf)
                    break
                }

                const startAngle = Math.atan2(y - cy, x - cx)
                const endAngle = Math.atan2(ny - cy, nx - cx)
                let delta = normalizeAngle(endAngle - startAngle)
                if (clockwise && delta > 0) delta -= Math.PI * 2
                if (!clockwise && delta < 0) delta += Math.PI * 2

                const radius = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
                const arcLength = Math.abs(delta) * radius
                const segments = Math.max(8, Math.min(512, Math.ceil(arcLength / 1.0)))

                for (let step = 1; step <= segments; step++) {
                    const t = step / segments
                    const angle = startAngle + delta * t
                    const px = cx + Math.cos(angle) * radius
                    const py = cy + Math.sin(angle) * radius
                    const pz = z + (nz - z) * t
                    const pe = e + (ne - e) * t
                    addMove(px, py, pz, pe, nf)
                }

                break
            }

            case 'G28': {
                // Home — reset position
                x = 0; y = 0; z = 0
                break
            }

            case 'G20': {
                unitScale = 25.4
                break
            }

            case 'G21': {
                unitScale = 1
                break
            }

            case 'G92': {
                // Set position
                const nx = extractParam(command, 'X')
                const ny = extractParam(command, 'Y')
                const nz = extractParam(command, 'Z')
                const ne = extractParam(command, 'E')
                if (nx !== null) x = nx * unitScale
                if (ny !== null) y = ny * unitScale
                if (nz !== null) z = nz * unitScale
                if (ne !== null) e = ne * unitScale
                break
            }

            case 'M6': {
                const tool = extractParam(command, 'T')
                if (tool !== null) {
                    currentTool = Math.max(0, Math.floor(tool))
                }
                break
            }

            case 'M82': {
                relativeE = false
                break
            }

            case 'M83': {
                relativeE = true
                break
            }

            case 'G90': {
                relativeXYZ = false
                break
            }

            case 'G91': {
                relativeXYZ = true
                break
            }

            // We skip M104/M109/M140/M190 (temperatures),
            // M106/M107 (fan), M84 (motors), etc.
            // They don't affect toolpath visualization.
        }
    }

    // Push last layer
    const lastLayer = currentLayer as GcodeLayer | null
    if (lastLayer !== null && lastLayer.moves.length > 0) {
        layers.push(lastLayer)
    }

    // Fix layer indices after collecting all layers
    for (let i = 0; i < layers.length; i++) {
        layers[i].layerIndex = i
    }

    // Estimate time from moves
    let estimatedTimeS = 0
    let prevX = 0, prevY = 0, prevZ2 = 0
    for (const layer of layers) {
        for (const move of layer.moves) {
            const dx = move.x - prevX
            const dy = move.y - prevY
            const dz = move.z - prevZ2
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (move.f > 0) {
                estimatedTimeS += (dist / move.f) * 60
            }
            prevX = move.x
            prevY = move.y
            prevZ2 = move.z
        }
    }

    // Handle infinite bounds (no extrusion moves)
    if (bounds.xMin === Infinity) {
        bounds.xMin = 0; bounds.xMax = 0
        bounds.yMin = 0; bounds.yMax = 0
        bounds.zMin = 0; bounds.zMax = 0
    }

    return {
        layers,
        totalLayers: layers.length,
        bounds,
        filamentUsedMm: maxE,
        estimatedTimeS: Math.round(estimatedTimeS),
        metadata,
    }
}
