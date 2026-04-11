/**
 * G-code Footprint Extraction
 *
 * Extracts a lightweight spatial footprint from parsed G-code data.
 * Used by the Build Plate Composer to arrange pre-sliced parts on the bed.
 */

import { parseGcode } from './parser'
import type { ParsedGcode } from './types'

/** Spatial footprint of a G-code file on the build plate */
export interface GcodeFootprint {
    /** XY bounding box of all extrusion moves */
    bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
    /** Width (X extent) in mm */
    width: number
    /** Depth (Y extent) in mm */
    depth: number
    /** Maximum Z height in mm */
    height: number
    /** Estimated print time in seconds */
    estimatedTimeS: number
    /** Total filament used in mm */
    filamentUsedMm: number
    /** Where the part's bounding box center sits in the original G-code */
    originalCenter: { x: number; y: number }
    /** Total number of layers */
    totalLayers: number
}

/**
 * Extract a footprint from already-parsed G-code data.
 */
export function extractFootprint(parsed: ParsedGcode): GcodeFootprint {
    const { bounds } = parsed
    const width = bounds.xMax - bounds.xMin
    const depth = bounds.yMax - bounds.yMin
    const height = bounds.zMax - bounds.zMin

    return {
        bounds: {
            xMin: bounds.xMin,
            xMax: bounds.xMax,
            yMin: bounds.yMin,
            yMax: bounds.yMax,
        },
        width,
        depth,
        height,
        estimatedTimeS: parsed.estimatedTimeS,
        filamentUsedMm: parsed.filamentUsedMm,
        originalCenter: {
            x: bounds.xMin + width / 2,
            y: bounds.yMin + depth / 2,
        },
        totalLayers: parsed.totalLayers,
    }
}

/**
 * Extract a footprint directly from raw G-code text.
 * Convenience wrapper that parses then extracts.
 */
export function extractFootprintFromGcode(
    gcode: string,
    onProgress?: (progress: number) => void
): GcodeFootprint {
    const parsed = parseGcode(gcode, onProgress)
    return extractFootprint(parsed)
}

/** An item placed on the build plate for sequential printing */
export interface BuildPlateItem {
    /** Unique ID for this placement */
    id: string
    /** Link to the recipe tree node ID */
    recipeNodeId: number
    /** Central files repository file ID */
    fileId: string
    /** Display name */
    fileName: string
    /** Extracted footprint data */
    footprint: GcodeFootprint
    /** Placement center position on the bed (mm) */
    placement: { x: number; y: number }
    /** Rotation in 90° increments (degrees: 0, 90, 180, 270) */
    rotation: 0 | 90 | 180 | 270
    /** Order in the sequential print sequence (0-based) */
    printOrder: number
    /** Raw G-code text (loaded when needed for stitching) */
    gcodeText?: string
}

/**
 * Get the effective width/depth of a footprint after rotation.
 */
export function getRotatedDimensions(
    footprint: GcodeFootprint,
    rotation: 0 | 90 | 180 | 270
): { width: number; depth: number } {
    if (rotation === 90 || rotation === 270) {
        return { width: footprint.depth, depth: footprint.width }
    }
    return { width: footprint.width, depth: footprint.depth }
}
