/**
 * G-code Parser Types
 *
 * Types for the parsed G-code representation used by the toolpath visualizer.
 */

/** Feature/move type for coloring */
export type GcodeFeatureType =
    | 'outer-wall'
    | 'inner-wall'
    | 'top-solid'
    | 'bottom-solid'
    | 'infill'
    | 'support'
    | 'skirt'
    | 'brim'
    | 'travel'
    | 'retract'
    | 'custom'
    | 'unknown'

/** A single parsed G-code move */
export interface GcodeMove {
    x: number
    y: number
    z: number
    e: number // extrusion amount (absolute)
    f: number // feedrate mm/min
    tool: number
    type: GcodeFeatureType
    /** True if extruding (E is increasing) */
    extruding: boolean
}

/** A layer of G-code moves */
export interface GcodeLayer {
    z: number
    layerIndex: number
    moves: GcodeMove[]
    /** Bounding box of this layer's extrusion moves */
    bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
}

/** Complete parsed G-code */
export interface ParsedGcode {
    layers: GcodeLayer[]
    totalLayers: number
    bounds: {
        xMin: number; xMax: number
        yMin: number; yMax: number
        zMin: number; zMax: number
    }
    filamentUsedMm: number
    estimatedTimeS: number
    metadata: Record<string, string>
}

/** Color map for feature types */
export const FEATURE_COLORS: Record<GcodeFeatureType, string> = {
    'outer-wall': '#ff6600',
    'inner-wall': '#00cc00',
    'top-solid': '#ff0000',
    'bottom-solid': '#cc00cc',
    'infill': '#ffcc00',
    'support': '#00cccc',
    'skirt': '#999999',
    'brim': '#888888',
    'travel': '#0066ff',
    'retract': '#ff00ff',
    'custom': '#666666',
    'unknown': '#ffffff',
}

/** Hex color map as numeric values for Three.js */
export const FEATURE_COLORS_HEX: Record<GcodeFeatureType, number> = {
    'outer-wall': 0xff6600,
    'inner-wall': 0x00cc00,
    'top-solid': 0xff0000,
    'bottom-solid': 0xcc00cc,
    'infill': 0xffcc00,
    'support': 0x00cccc,
    'skirt': 0x999999,
    'brim': 0x888888,
    'travel': 0x0066ff,
    'retract': 0xff00ff,
    'custom': 0x666666,
    'unknown': 0xffffff,
}
