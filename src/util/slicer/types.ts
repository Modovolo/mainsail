/**
 * Slicer Pipeline Types
 *
 * Core types for the mesh slicing, toolpath generation, and G-code export pipeline.
 * All slicing runs in a Web Worker to keep the UI responsive.
 */

/** 2D point used throughout the slicer */
export interface Vec2 {
    x: number
    y: number
}

/** 3D point / vertex */
export interface Vec3 {
    x: number
    y: number
    z: number
}

/** A triangle defined by three vertices */
export interface Triangle {
    a: Vec3
    b: Vec3
    c: Vec3
}

/** A closed or open polygon (sequence of points) on a Z-plane */
export interface Contour {
    points: Vec2[]
    closed: boolean
    area: number // positive = outer, negative = hole
}

/** A single layer produced by mesh slicing */
export interface SliceLayer {
    z: number // Z height of this layer
    layerIndex: number
    layerHeight: number
    contours: Contour[] // outer contours and holes
}

/** Move type for toolpath segments */
export type MoveType = 'travel' | 'wall-outer' | 'wall-inner' | 'floor' | 'roof' | 'infill' | 'support' | 'skirt' | 'brim' | 'adhesion-brim' | 'adhesion-mouse-ear' | 'adhesion-raft'

/** A single toolpath segment (extrusion or travel move) */
export interface ToolpathSegment {
    from: Vec2
    to: Vec2
    type: MoveType
    z: number
    feedrate: number // mm/min
    extrusionWidth: number
    extrusionHeight: number
    extrusionAmount: number // mm of filament
}

/** All toolpath segments for a single layer */
export interface LayerToolpath {
    z: number
    layerIndex: number
    segments: ToolpathSegment[]
    /** Cumulative filament used up to and including this layer (mm) */
    filamentUsed: number
}

/** Complete sliced result before G-code export */
export interface SlicedModel {
    layers: LayerToolpath[]
    totalFilament: number // mm
    estimatedTime: number // seconds
    boundingBox: { min: Vec3; max: Vec3 }
}

/** Internal slicer configuration (mapped from user-facing SliceParams + PrinterProfile) */
export interface SlicerConfig {
    // Layer
    layerHeight: number
    firstLayerHeight: number

    // Walls
    wallCount: number
    wallSpeed: number // mm/s

    // Top/Bottom
    topLayers: number
    bottomLayers: number

    // Infill
    infillDensity: number // 0-1
    infillPattern: 'grid' | 'lines' | 'triangles' | 'gyroid' | 'honeycomb'
    infillSpeed: number // mm/s

    // Speeds
    printSpeed: number // mm/s
    travelSpeed: number // mm/s
    firstLayerSpeed: number // mm/s

    // Temperatures
    nozzleTemp: number
    bedTemp: number
    firstLayerNozzleTemp: number
    firstLayerBedTemp: number

    // Retraction
    retractDistance: number // mm
    retractSpeed: number // mm/s
    retractLift: number // mm (z-hop)

    // Nozzle / Extrusion
    nozzleDiameter: number
    filamentDiameter: number
    extrusionMultiplier: number
    lineWidth: number // derived: nozzleDiameter * 1.1 typically

    // Build volume
    buildVolumeX: number
    buildVolumeY: number
    buildVolumeZ: number

    // Support
    enableSupport: boolean
    supportDensity: number
    supportAngle: number

    // Skirt/Brim
    skirtLoops: number
    skirtDistance: number
    brimWidth: number

    // Bed Adhesion
    adhesionType: string
    adhesionBrimWidth: number
    adhesionBrimLines: number
    mouseEarDiameter: number
    mouseEarLayers: number
    mouseEarPositions: Array<{ x: number; y: number }>
    raftPadPositions: Array<{ x: number; y: number; width?: number; depth?: number }>
    raftPadLayers: number
    raftPadGap: number

    // Fan
    fanSpeed: number // 0-255
    fanStartLayer: number

    // Custom G-code (optional, overrides default start/end sequences)
    customStartGcode?: string
    customEndGcode?: string
    customLayerChangeGcode?: string
}

/** Messages sent from main thread to slicer worker */
export type WorkerRequest =
    | { type: 'slice'; id: string; vertices: Float32Array; config: SlicerConfig }
    | { type: 'cancel'; id: string }

/** Messages sent from slicer worker back to main thread */
export type WorkerResponse =
    | { type: 'progress'; id: string; progress: number; stage: string; message: string }
    | { type: 'complete'; id: string; gcode: string; toolpaths: LayerToolpath[]; result: SliceResultData }
    | { type: 'error'; id: string; error: string }

/** Structured result data from slicing */
export interface SliceResultData {
    layerCount: number
    filamentUsedMm: number
    filamentUsedM: number
    filamentWeightG: number
    estimatedTimeS: number
    estimatedTimeFormatted: string
    gcodeSize: number
}
