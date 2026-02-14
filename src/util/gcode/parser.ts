/**
 * G-code Parser
 *
 * Parses G-code text into structured layer data for toolpath visualization.
 * Handles standard Marlin/Klipper G-code with ;TYPE: and ;LAYER_CHANGE comments.
 *
 * Supported commands:
 * - G0/G1: Linear moves (with optional X Y Z E F parameters)
 * - G2/G3: Arc moves (converted to linear approximation)
 * - G28: Home
 * - G92: Set position
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
    let relativeE = false
    let currentType: GcodeFeatureType = 'unknown'
    let currentLayerZ = -1
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
                // Layer will be created when we see the next Z move
                continue
            }
            // Layer number
            if (comment.startsWith('LAYER:')) {
                // Informational only, we track layers by Z
                continue
            }
            // Z height from comment
            if (comment.startsWith('Z:')) {
                const cz = parseFloat(comment.substring(2))
                if (!isNaN(cz)) {
                    ensureLayer(cz)
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

        switch (cmd) {
            case 'G0':
            case 'G1': {
                const nx = extractParam(command, 'X') ?? x
                const ny = extractParam(command, 'Y') ?? y
                const nz = extractParam(command, 'Z') ?? z
                const nf = extractParam(command, 'F') ?? f
                let ne = e

                const eVal = extractParam(command, 'E')
                if (eVal !== null) {
                    ne = relativeE ? e + eVal : eVal
                }

                // Z change triggers new layer
                if (Math.abs(nz - z) > 0.001) {
                    ensureLayer(nz)
                }

                addMove(nx, ny, nz, ne, nf)
                break
            }

            case 'G28': {
                // Home — reset position
                x = 0; y = 0; z = 0
                break
            }

            case 'G92': {
                // Set position
                const nx = extractParam(command, 'X')
                const ny = extractParam(command, 'Y')
                const nz = extractParam(command, 'Z')
                const ne = extractParam(command, 'E')
                if (nx !== null) x = nx
                if (ny !== null) y = ny
                if (nz !== null) z = nz
                if (ne !== null) e = ne
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

            // We skip M104/M109/M140/M190 (temperatures),
            // M106/M107 (fan), M84 (motors), etc.
            // They don't affect toolpath visualization.
        }
    }

    // Push last layer
    if (currentLayer && currentLayer.moves.length > 0) {
        layers.push(currentLayer)
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
