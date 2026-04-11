/**
 * Prepare Page Vuex Store Types
 *
 * Manages state communication between TheTopbar and PreparePage
 * Also stores slice parameters, profiles, and job state for persistence
 */

export type PrepareViewMode = 'solid' | 'wireframe' | 'xray'

export type PrepareAction =
    | 'import'
    | 'clear'
    | 'exportSTL'
    | 'resetCamera'
    | 'fitAll'
    | 'viewTop'
    | 'viewFront'
    | 'viewRight'
    | 'centerSelected'
    | 'layFlat'
    | 'duplicate'
    | 'mirror'
    | 'delete'
    | 'arrange'
    | 'selectAll'
    | null

export type TransformMode = 'move' | 'rotate' | 'scale'

export type AdhesionType = 'none' | 'brim' | 'mouse_ears' | 'raft_pads' | 'combined'

export interface AdhesionMarker {
    id: string
    type: 'mouse_ear' | 'raft_pad'
    x: number
    y: number
    confirmed: boolean
    reason?: string
    priority?: number
    width?: number  // raft pad only
    depth?: number  // raft pad only
}

export interface FootprintData {
    contours: [number, number][][]
    bounds: { min_x: number; max_x: number; min_y: number; max_y: number }
    contact_area: number
    suggestions: Array<{
        type: string
        x: number
        y: number
        reason: string
        priority: number
        angle: number
    }>
}

export interface SliceParams {
    layer_height: number
    first_layer_height: number
    line_width: number
    infill_density: number
    infill_pattern: string
    wall_count: number
    top_layers: number
    bottom_layers: number
    print_speed: number
    travel_speed: number
    first_layer_speed: number
    nozzle_temp: number
    bed_temp: number
    enable_support: boolean
    support_density: number
    support_angle: number
    support_pattern: string
    enable_non_planar: boolean
    max_slope_angle: number
    enable_idex: boolean
    idex_mode: string
    // Bed adhesion
    adhesion_type: AdhesionType
    brim_width: number
    brim_lines: number
    mouse_ear_diameter: number
    mouse_ear_layers: number
    raft_pad_layers: number
    raft_pad_gap: number
}

export interface SliceProfile {
    id: string
    name: string
    description?: string
    material?: string
    quality?: 'draft' | 'normal' | 'fine' | 'ultra'
    params: SliceParams
    createdAt: number
    updatedAt: number
}

export interface PrinterProfile {
    id: string
    name: string
    isBuiltIn?: boolean
    buildVolume: { x: number; y: number; z: number }
    extruderCount: number
    nozzleDiameter: number
    filamentDiameter: number
    bedShape: 'rectangular' | 'circular'
    heatedBed: boolean
    bedHeaterControllerCount: number
    heatedChamber: boolean
    autoBedLeveling: boolean
    directDrive: boolean
    multiExtruderType?: 'single' | 'dual' | 'idex' | 'toolchanger'
    customStartGcode?: string
    customEndGcode?: string
    customLayerChangeGcode?: string
    /** Clearance between nozzle tip and gantry/X-bar for sequential printing (mm) */
    gantryHeight?: number
    /** Printhead extent [left, right] from nozzle center (mm) */
    printheadBoundsX?: [number, number]
    /** Printhead extent [front, back] from nozzle center (mm) */
    printheadBoundsY?: [number, number]
}

export interface SliceJob {
    id: string
    status: 'pending' | 'slicing' | 'complete' | 'error' | 'cancelled'
    progress: number
    message: string
    result?: SliceResult
    error?: string
    startedAt?: number
    completedAt?: number
}

export interface SliceResult {
    layer_count: number
    filament_used_m: number
    filament_weight_g: number
    estimated_time_formatted: string
    gcode_size?: number
    gcode_url?: string
}

export interface WidgetSummary {
    id: string
    name: string
    visible: boolean
    locked: boolean
    triangleCount: number
    dimensions: { w: number; h: number; d: number }
}

export interface PrepareState {
    // State exposed from PreparePage to TheTopbar
    hasWidgets: boolean
    hasSelection: boolean
    widgetCount: number
    selectionCount: number

    // View mode (synced between topbar and page)
    viewMode: PrepareViewMode
    transformMode: TransformMode

    // Action dispatch from topbar to page
    pendingAction: PrepareAction
    actionCounter: number // Incremented to trigger watchers even for same action

    // Widget summaries (for store-level tracking without full Widget objects)
    widgetSummaries: WidgetSummary[]
    selectedWidgetIds: string[]

    // Slice parameters
    sliceParams: SliceParams
    qualityPreset: 'draft' | 'normal' | 'fine' | 'ultra'

    // Profiles
    profiles: SliceProfile[]
    activeProfileId: string | null
    printerProfiles: PrinterProfile[]
    customPrinterProfiles: PrinterProfile[]
    activePrinterId: string | null

    // Slicing job state
    currentJob: SliceJob | null
    isSlicing: boolean
    lastResult: SliceResult | null

    // Last generated G-code (for passing to PreviewPage)
    lastGcode: string | null

    // Last generated toolpath data (direct slicer output for preview)
    lastToolpaths: any[] | null

    // Bed adhesion
    adhesionMarkers: AdhesionMarker[]
    footprintData: FootprintData | null
}
