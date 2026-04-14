/**
 * Settings Mapper
 *
 * Maps user-facing SliceParams + PrinterProfile into internal SlicerConfig
 * used by the slicing pipeline.
 */

import { SliceParams, PrinterProfile } from '@/store/prepare/types'
import { SlicerConfig } from './types'

/** Default slicer config values */
const DEFAULTS: SlicerConfig = {
    layerHeight: 0.2,
    firstLayerHeight: 0.3,
    wallCount: 3,
    wallSpeed: 40,
    topLayers: 4,
    bottomLayers: 4,
    infillDensity: 0.2,
    infillPattern: 'grid',
    infillSpeed: 60,
    printSpeed: 60,
    travelSpeed: 150,
    firstLayerSpeed: 20,
    nozzleTemp: 210,
    bedTemp: 60,
    firstLayerNozzleTemp: 215,
    firstLayerBedTemp: 60,
    retractDistance: 1.0,
    retractSpeed: 40,
    retractLift: 0.2,
    nozzleDiameter: 0.4,
    filamentDiameter: 1.75,
    extrusionMultiplier: 1.0,
    lineWidth: 0.44,
    buildVolumeX: 220,
    buildVolumeY: 220,
    buildVolumeZ: 250,
    enableSupport: false,
    supportDensity: 0.15,
    supportAngle: 50,
    skirtLoops: 2,
    skirtDistance: 5,
    brimWidth: 0,
    adhesionType: 'none',
    adhesionBrimWidth: 5,
    adhesionBrimLines: 5,
    mouseEarDiameter: 10,
    mouseEarLayers: 1,
    mouseEarPositions: [],
    raftPadPositions: [],
    raftPadLayers: 3,
    raftPadGap: 0.15,
    fanSpeed: 255,
    fanStartLayer: 2,
}

/**
 * Map infill pattern name to internal enum.
 * Our UI uses the same names so this is mostly a type assertion.
 */
function mapInfillPattern(pattern: string): SlicerConfig['infillPattern'] {
    const valid = ['grid', 'lines', 'triangles', 'gyroid', 'honeycomb'] as const
    if (valid.includes(pattern as any)) return pattern as SlicerConfig['infillPattern']
    return 'grid'
}

/**
 * Convert SliceParams + PrinterProfile → SlicerConfig
 */
export function mapSettings(params: SliceParams, printer: PrinterProfile): SlicerConfig {
    const nozzle = printer.nozzleDiameter || DEFAULTS.nozzleDiameter
    const lineWidth = (params.line_width && params.line_width > 0) ? params.line_width : nozzle * 1.1

    return {
        // Layer
        layerHeight: params.layer_height,
        firstLayerHeight: params.first_layer_height,

        // Walls
        wallCount: params.wall_count,
        wallSpeed: params.print_speed * 0.7, // walls slightly slower

        // Top/Bottom
        topLayers: params.top_layers,
        bottomLayers: params.bottom_layers,

        // Infill
        infillDensity: params.infill_density / 100, // UI uses 0-100, internal uses 0-1
        infillPattern: mapInfillPattern(params.infill_pattern),
        infillSpeed: params.print_speed,

        // Speeds
        printSpeed: params.print_speed,
        travelSpeed: params.travel_speed,
        firstLayerSpeed: params.first_layer_speed,

        // Temperatures
        nozzleTemp: params.nozzle_temp,
        bedTemp: params.bed_temp,
        firstLayerNozzleTemp: params.nozzle_temp + 5,
        firstLayerBedTemp: params.bed_temp,

        // Retraction
        retractDistance: printer.directDrive ? 0.8 : 1.5,
        retractSpeed: 40,
        retractLift: 0.2,

        // Nozzle / Extrusion
        nozzleDiameter: nozzle,
        filamentDiameter: printer.filamentDiameter || DEFAULTS.filamentDiameter,
        extrusionMultiplier: 1.0,
        lineWidth,

        // Build volume
        buildVolumeX: printer.buildVolume.x,
        buildVolumeY: printer.buildVolume.y,
        buildVolumeZ: printer.buildVolume.z,

        // Support
        enableSupport: params.enable_support,
        supportDensity: params.support_density / 100,
        supportAngle: params.support_angle,

        // Skirt/Brim
        skirtLoops: 2,
        skirtDistance: 5,
        brimWidth: 0,

        // Bed Adhesion
        adhesionType: params.adhesion_type || 'none',
        adhesionBrimWidth: params.brim_width || 5,
        adhesionBrimLines: params.brim_lines || 5,
        mouseEarDiameter: params.mouse_ear_diameter || 10,
        mouseEarLayers: params.mouse_ear_layers || 1,
        mouseEarPositions: [],  // populated by PreparePage from adhesion markers
        raftPadPositions: [],   // populated by PreparePage from adhesion markers
        raftPadLayers: params.raft_pad_layers || 3,
        raftPadGap: params.raft_pad_gap || 0.15,

        // Fan
        fanSpeed: 255,
        fanStartLayer: 2,

        // Custom G-code templates from printer profile
        customStartGcode: printer.customStartGcode,
        customEndGcode: printer.customEndGcode,
        customLayerChangeGcode: printer.customLayerChangeGcode,

        // Multi-zone bed heater temps (empty = single M140/M190)
        bedHeaterTemps: params.bed_heater_temps,
    }
}

/**
 * Get default slicer config (useful for testing)
 */
export function getDefaultConfig(): SlicerConfig {
    return { ...DEFAULTS }
}
