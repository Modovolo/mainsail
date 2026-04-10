/**
 * Toolpath-to-ParsedGcode Converter
 *
 * Converts structured slicer LayerToolpath[] directly to ParsedGcode,
 * bypassing the G-code text → parse roundtrip. This ensures the preview
 * shows exactly what the slicer produced with no information loss.
 */

import type { LayerToolpath, MoveType } from '../slicer/types'
import type { GcodeFeatureType, GcodeMove, GcodeLayer, ParsedGcode } from './types'

/** Map slicer MoveType to gcode GcodeFeatureType */
function mapMoveType(type: MoveType): GcodeFeatureType {
    switch (type) {
        case 'wall-outer': return 'outer-wall'
        case 'wall-inner': return 'inner-wall'
        case 'floor': return 'bottom-solid'
        case 'roof': return 'top-solid'
        case 'infill': return 'infill'
        case 'support': return 'support'
        case 'skirt': return 'skirt'
        case 'brim': return 'brim'
        case 'travel': return 'travel'
        default: return 'unknown'
    }
}

/**
 * Convert LayerToolpath[] directly to ParsedGcode.
 * This produces the exact same data structure that parseGcode() returns,
 * but sourced directly from the slicer's structured output.
 */
export function toolpathsToParsedGcode(toolpaths: LayerToolpath[]): ParsedGcode {
    const bounds = {
        xMin: Infinity, xMax: -Infinity,
        yMin: Infinity, yMax: -Infinity,
        zMin: Infinity, zMax: -Infinity,
    }

    let totalFilament = 0
    let estimatedTimeS = 0

    const layers: GcodeLayer[] = toolpaths.map((lt, idx) => {
        const layerBounds = {
            xMin: Infinity, xMax: -Infinity,
            yMin: Infinity, yMax: -Infinity,
        }

        const moves: GcodeMove[] = []
        let e = totalFilament

        for (const seg of lt.segments) {
            const type = mapMoveType(seg.type)
            const extruding = seg.type !== 'travel' && seg.extrusionAmount > 0

            e += seg.extrusionAmount
            const f = seg.feedrate // already mm/min

            // Estimate time from this segment
            const dx = seg.to.x - seg.from.x
            const dy = seg.to.y - seg.from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (f > 0) {
                estimatedTimeS += (dist / f) * 60
            }

            moves.push({
                x: seg.to.x,
                y: seg.to.y,
                z: lt.z,
                e,
                f,
                tool: 0,
                type,
                extruding,
            })

            // Update bounds for extruding moves
            if (extruding) {
                if (seg.to.x < layerBounds.xMin) layerBounds.xMin = seg.to.x
                if (seg.to.x > layerBounds.xMax) layerBounds.xMax = seg.to.x
                if (seg.to.y < layerBounds.yMin) layerBounds.yMin = seg.to.y
                if (seg.to.y > layerBounds.yMax) layerBounds.yMax = seg.to.y
                if (seg.from.x < layerBounds.xMin) layerBounds.xMin = seg.from.x
                if (seg.from.x > layerBounds.xMax) layerBounds.xMax = seg.from.x
                if (seg.from.y < layerBounds.yMin) layerBounds.yMin = seg.from.y
                if (seg.from.y > layerBounds.yMax) layerBounds.yMax = seg.from.y
            }
        }

        totalFilament = e

        // Update global bounds
        if (Number.isFinite(layerBounds.xMin)) {
            if (layerBounds.xMin < bounds.xMin) bounds.xMin = layerBounds.xMin
            if (layerBounds.xMax > bounds.xMax) bounds.xMax = layerBounds.xMax
            if (layerBounds.yMin < bounds.yMin) bounds.yMin = layerBounds.yMin
            if (layerBounds.yMax > bounds.yMax) bounds.yMax = layerBounds.yMax
        }
        if (lt.z < bounds.zMin) bounds.zMin = lt.z
        if (lt.z > bounds.zMax) bounds.zMax = lt.z

        return {
            z: lt.z,
            layerIndex: idx,
            moves,
            bounds: layerBounds,
        }
    })

    // Handle empty bounds
    if (bounds.xMin === Infinity) {
        bounds.xMin = 0; bounds.xMax = 0
        bounds.yMin = 0; bounds.yMax = 0
        bounds.zMin = 0; bounds.zMax = 0
    }

    return {
        layers,
        totalLayers: layers.length,
        bounds,
        filamentUsedMm: totalFilament,
        estimatedTimeS: Math.round(estimatedTimeS),
        metadata: { generator: 'Mainsail Slicer' },
    }
}
