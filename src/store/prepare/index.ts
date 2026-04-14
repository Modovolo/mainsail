/**
 * Prepare Page Vuex Store Module
 *
 * Enables communication between TheTopbar (menu actions) and PreparePage (3D viewer)
 * Manages slice parameters, profiles, and job state
 * Persists printer profiles to PostgreSQL via fleet manager API
 */

import Vue from 'vue'
import axios from 'axios'
import { Module } from 'vuex'
import {
    PrepareState,
    PrepareAction,
    PrepareViewMode,
    TransformMode,
    SliceParams,
    SliceProfile,
    PrinterProfile,
    SliceJob,
    SliceResult,
    WidgetSummary,
    AdhesionMarker,
    AdhesionType,
    FootprintData,
} from './types'

const DEFAULT_SLICE_PARAMS: SliceParams = {
    layer_height: 0.2,
    first_layer_height: 0.3,
    line_width: 0,
    infill_density: 20,
    infill_pattern: 'grid',
    wall_count: 3,
    top_layers: 4,
    bottom_layers: 4,
    print_speed: 60,
    travel_speed: 150,
    first_layer_speed: 20,
    nozzle_temp: 210,
    bed_temp: 60,
    enable_support: false,
    support_density: 15,
    support_angle: 50,
    support_pattern: 'grid',
    enable_non_planar: false,
    max_slope_angle: 45,
    enable_idex: false,
    idex_mode: 'normal',
    adhesion_type: 'none',
    brim_width: 5.0,
    brim_lines: 5,
    mouse_ear_diameter: 10.0,
    mouse_ear_layers: 1,
    raft_pad_layers: 3,
    raft_pad_gap: 0.15,
    bed_heater_temps: {},
}

const QUALITY_PRESETS: Record<string, Partial<SliceParams>> = {
    draft: { layer_height: 0.3, first_layer_height: 0.35, wall_count: 2, infill_density: 10, print_speed: 80 },
    normal: { layer_height: 0.2, first_layer_height: 0.3, wall_count: 3, infill_density: 20, print_speed: 60 },
    fine: { layer_height: 0.12, first_layer_height: 0.2, wall_count: 4, infill_density: 25, print_speed: 45 },
    ultra: { layer_height: 0.08, first_layer_height: 0.15, wall_count: 5, infill_density: 30, print_speed: 30 },
}

const BUILTIN_PRINTER_PROFILES: PrinterProfile[] = [
    {
        id: 'generic',
        name: 'Generic Printer',
        isBuiltIn: true,
        buildVolume: { x: 220, y: 220, z: 250 },
        extruderCount: 1,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        bedShape: 'rectangular',
        heatedBed: true,
        bedHeaterControllerCount: 1,
        heatedChamber: false,
        autoBedLeveling: false,
        directDrive: false,
    },
    {
        id: 'prusa-mk4',
        name: 'Prusa MK4',
        isBuiltIn: true,
        buildVolume: { x: 250, y: 210, z: 220 },
        extruderCount: 1,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        bedShape: 'rectangular',
        heatedBed: true,
        bedHeaterControllerCount: 1,
        heatedChamber: false,
        autoBedLeveling: true,
        directDrive: true,
    },
    {
        id: 'voron-2.4',
        name: 'Voron 2.4 350',
        isBuiltIn: true,
        buildVolume: { x: 350, y: 350, z: 350 },
        extruderCount: 1,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        bedShape: 'rectangular',
        heatedBed: true,
        bedHeaterControllerCount: 1,
        heatedChamber: true,
        autoBedLeveling: true,
        directDrive: true,
    },
    {
        id: 'bambu-x1',
        name: 'Bambu X1 Carbon',
        isBuiltIn: true,
        buildVolume: { x: 256, y: 256, z: 256 },
        extruderCount: 1,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        bedShape: 'rectangular',
        heatedBed: true,
        bedHeaterControllerCount: 1,
        heatedChamber: true,
        autoBedLeveling: true,
        directDrive: true,
    },
]

export const getDefaultState = (): PrepareState => ({
    hasWidgets: false,
    hasSelection: false,
    widgetCount: 0,
    selectionCount: 0,
    viewMode: 'solid',
    transformMode: 'move',
    pendingAction: null,
    actionCounter: 0,
    widgetSummaries: [],
    selectedWidgetIds: [],
    sliceParams: { ...DEFAULT_SLICE_PARAMS },
    qualityPreset: 'normal',
    profiles: [],
    activeProfileId: null,
    printerProfiles: [...BUILTIN_PRINTER_PROFILES],
    customPrinterProfiles: [],
    activePrinterId: 'generic',
    currentJob: null,
    isSlicing: false,
    lastResult: null,
    lastGcode: null,
    lastToolpaths: null,
    adhesionMarkers: [],
    footprintData: null,
})

// Initial state
const state = getDefaultState()

export const prepare: Module<PrepareState, any> = {
    namespaced: true,
    state,
    getters: {
        hasWidgets: (state) => state.hasWidgets,
        hasSelection: (state) => state.hasSelection,
        viewMode: (state) => state.viewMode,
        transformMode: (state) => state.transformMode,
        sliceParams: (state) => state.sliceParams,
        qualityPreset: (state) => state.qualityPreset,
        isSlicing: (state) => state.isSlicing,
        currentJob: (state) => state.currentJob,
        lastResult: (state) => state.lastResult,
        profiles: (state) => state.profiles,
        activeProfile: (state) => state.profiles.find((p) => p.id === state.activeProfileId) || null,
        printerProfiles: (state) => state.printerProfiles,
        activePrinter: (state) => state.printerProfiles.find((p) => p.id === state.activePrinterId) || null,
        widgetSummaries: (state) => state.widgetSummaries,
        selectedWidgetIds: (state) => state.selectedWidgetIds,
        adhesionMarkers: (state) => state.adhesionMarkers,
        confirmedAdhesionMarkers: (state) => state.adhesionMarkers.filter((m) => m.confirmed),
        footprintData: (state) => state.footprintData,
    },
    mutations: {
        setHasWidgets(state, value: boolean) {
            state.hasWidgets = value
        },
        setHasSelection(state, value: boolean) {
            state.hasSelection = value
        },
        setWidgetCount(state, count: number) {
            state.widgetCount = count
        },
        setSelectionCount(state, count: number) {
            state.selectionCount = count
        },
        setViewMode(state, mode: PrepareViewMode) {
            state.viewMode = mode
        },
        setTransformMode(state, mode: TransformMode) {
            state.transformMode = mode
        },
        dispatchAction(state, action: PrepareAction) {
            state.pendingAction = action
            state.actionCounter++
        },
        clearAction(state) {
            state.pendingAction = null
        },

        // Widget summaries
        setWidgetSummaries(state, summaries: WidgetSummary[]) {
            state.widgetSummaries = summaries
        },
        setSelectedWidgetIds(state, ids: string[]) {
            state.selectedWidgetIds = ids
        },
        updateWidgetSummary(state, { id, updates }: { id: string; updates: Partial<WidgetSummary> }) {
            const idx = state.widgetSummaries.findIndex((w) => w.id === id)
            if (idx !== -1) {
                state.widgetSummaries[idx] = { ...state.widgetSummaries[idx], ...updates }
            }
        },

        // Slice params
        setSliceParams(state, params: Partial<SliceParams>) {
            state.sliceParams = { ...state.sliceParams, ...params }
        },
        setQualityPreset(state, preset: 'draft' | 'normal' | 'fine' | 'ultra') {
            state.qualityPreset = preset
            const presetParams = QUALITY_PRESETS[preset]
            if (presetParams) {
                state.sliceParams = { ...state.sliceParams, ...presetParams }
            }
        },

        // Profiles
        addProfile(state, profile: SliceProfile) {
            state.profiles.push(profile)
        },
        updateProfile(state, { id, updates }: { id: string; updates: Partial<SliceProfile> }) {
            const idx = state.profiles.findIndex((p) => p.id === id)
            if (idx !== -1) {
                state.profiles[idx] = { ...state.profiles[idx], ...updates, updatedAt: Date.now() }
            }
        },
        deleteProfile(state, id: string) {
            state.profiles = state.profiles.filter((p) => p.id !== id)
            if (state.activeProfileId === id) {
                state.activeProfileId = null
            }
        },
        setActiveProfile(state, id: string | null) {
            state.activeProfileId = id
            if (id) {
                const profile = state.profiles.find((p) => p.id === id)
                if (profile) {
                    state.sliceParams = { ...profile.params }
                }
            }
        },

        // Printer profiles
        setPrinterProfiles(state, profiles: PrinterProfile[]) {
            state.printerProfiles = profiles
        },
        setCustomPrinterProfiles(state, profiles: PrinterProfile[]) {
            state.customPrinterProfiles = profiles
            // Rebuild full list: built-in + custom
            state.printerProfiles = [...BUILTIN_PRINTER_PROFILES, ...profiles]
        },
        addCustomPrinterProfile(state, profile: PrinterProfile) {
            state.customPrinterProfiles.push(profile)
            state.printerProfiles = [...BUILTIN_PRINTER_PROFILES, ...state.customPrinterProfiles]
        },
        updateCustomPrinterProfile(state, profile: PrinterProfile) {
            const idx = state.customPrinterProfiles.findIndex((p) => p.id === profile.id)
            if (idx !== -1) {
                Vue.set(state.customPrinterProfiles, idx, profile)
                state.printerProfiles = [...BUILTIN_PRINTER_PROFILES, ...state.customPrinterProfiles]
            }
        },
        deleteCustomPrinterProfile(state, id: string) {
            state.customPrinterProfiles = state.customPrinterProfiles.filter((p) => p.id !== id)
            state.printerProfiles = [...BUILTIN_PRINTER_PROFILES, ...state.customPrinterProfiles]
            if (state.activePrinterId === id) {
                state.activePrinterId = 'generic'
            }
        },
        setActivePrinter(state, id: string | null) {
            state.activePrinterId = id
        },

        // Slicing job
        setCurrentJob(state, job: SliceJob | null) {
            state.currentJob = job
            state.isSlicing = job !== null && job.status === 'slicing'
        },
        updateJobProgress(state, { progress, message }: { progress: number; message: string }) {
            if (state.currentJob) {
                state.currentJob.progress = progress
                state.currentJob.message = message
            }
        },
        setJobComplete(state, result: SliceResult) {
            if (state.currentJob) {
                state.currentJob.status = 'complete'
                state.currentJob.result = result
                state.currentJob.completedAt = Date.now()
            }
            state.isSlicing = false
            state.lastResult = result
        },
        setJobError(state, error: string) {
            if (state.currentJob) {
                state.currentJob.status = 'error'
                state.currentJob.error = error
                state.currentJob.completedAt = Date.now()
            }
            state.isSlicing = false
        },
        cancelJob(state) {
            if (state.currentJob) {
                state.currentJob.status = 'cancelled'
                state.currentJob.completedAt = Date.now()
            }
            state.isSlicing = false
        },

        setLastGcode(state, gcode: string | null) {
            state.lastGcode = gcode
        },

        setLastToolpaths(state, toolpaths: any[] | null) {
            state.lastToolpaths = toolpaths
        },

        // Adhesion
        setAdhesionMarkers(state, markers: AdhesionMarker[]) {
            state.adhesionMarkers = markers
        },
        addAdhesionMarker(state, marker: AdhesionMarker) {
            state.adhesionMarkers.push(marker)
        },
        removeAdhesionMarker(state, id: string) {
            state.adhesionMarkers = state.adhesionMarkers.filter((m) => m.id !== id)
        },
        confirmAdhesionMarker(state, id: string) {
            const m = state.adhesionMarkers.find((m) => m.id === id)
            if (m) m.confirmed = true
        },
        clearAdhesionMarkers(state) {
            state.adhesionMarkers = []
            state.footprintData = null
        },
        setFootprintData(state, data: FootprintData | null) {
            state.footprintData = data
        },

        reset(state) {
            // Preserve profiles and printer settings across resets
            const { profiles, activeProfileId, printerProfiles, customPrinterProfiles, activePrinterId, sliceParams } = state
            Object.assign(state, getDefaultState())
            state.profiles = profiles
            state.activeProfileId = activeProfileId
            state.printerProfiles = printerProfiles
            state.customPrinterProfiles = customPrinterProfiles
            state.activePrinterId = activePrinterId
            state.sliceParams = sliceParams
        },
    },
    actions: {
        triggerAction({ commit }, action: PrepareAction) {
            commit('dispatchAction', action)
        },
        updateState(
            { commit },
            payload: { hasWidgets: boolean; hasSelection: boolean; widgetCount: number; selectionCount: number }
        ) {
            commit('setHasWidgets', payload.hasWidgets)
            commit('setHasSelection', payload.hasSelection)
            commit('setWidgetCount', payload.widgetCount)
            commit('setSelectionCount', payload.selectionCount)
        },

        // --- DB Persistence for Printer Profiles (PostgreSQL via fleet API) ---

        async initPrinterProfiles({ commit }) {
            // Ensure auth header is set (may not be if page mounts before checkAuth completes)
            if (!axios.defaults.headers.common['Authorization']) {
                const token = localStorage.getItem('fleet_token')
                if (token) {
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
                }
            }

            try {
                const response = await axios.get('/api/printer-profiles')
                const profiles = response.data?.profiles
                if (Array.isArray(profiles) && profiles.length > 0) {
                    commit('setCustomPrinterProfiles', profiles)
                }
            } catch (error) {
                console.warn('Failed to load printer profiles from API:', error)
            }

            // Restore active printer selection from localStorage (UI preference)
            const activeId = localStorage.getItem('prepare.activePrinterId')
            if (activeId) {
                commit('setActivePrinter', activeId)
            }
        },

        selectPrinter({ commit }, id: string) {
            commit('setActivePrinter', id)
            localStorage.setItem('prepare.activePrinterId', id)
        },

        async addPrinterProfile({ commit }, profile: PrinterProfile) {
            try {
                const response = await axios.post('/api/printer-profiles', profile)
                const created = response.data
                commit('addCustomPrinterProfile', created)
                commit('setActivePrinter', created.id)
                localStorage.setItem('prepare.activePrinterId', created.id)
            } catch (error) {
                console.error('Failed to create printer profile:', error)
                throw error
            }
        },

        async updatePrinterProfile({ commit }, profile: PrinterProfile) {
            try {
                const response = await axios.put(`/api/printer-profiles/${profile.id}`, profile)
                const updated = response.data
                commit('updateCustomPrinterProfile', updated)
            } catch (error) {
                console.error('Failed to update printer profile:', error)
                throw error
            }
        },

        async deletePrinterProfile({ commit, state }, id: string) {
            try {
                await axios.delete(`/api/printer-profiles/${id}`)
                commit('deleteCustomPrinterProfile', id)
                if (state.activePrinterId === id) {
                    commit('setActivePrinter', 'generic')
                    localStorage.setItem('prepare.activePrinterId', 'generic')
                }
            } catch (error) {
                console.error('Failed to delete printer profile:', error)
                throw error
            }
        },

        // Profile actions
        saveProfile({ commit, state }, { name, description }: { name: string; description?: string }) {
            const profile: SliceProfile = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name,
                description,
                params: { ...state.sliceParams },
                quality: state.qualityPreset,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }
            commit('addProfile', profile)
            commit('setActiveProfile', profile.id)
            return profile
        },
        loadProfile({ commit }, profileId: string) {
            commit('setActiveProfile', profileId)
        },

        // Slicing actions
        startSlicing({ commit, state }) {
            const job: SliceJob = {
                id: Date.now().toString(36),
                status: 'slicing',
                progress: 0,
                message: 'Preparing...',
                startedAt: Date.now(),
            }
            commit('setCurrentJob', job)
            return job.id
        },
        updateSlicingProgress({ commit }, { progress, message }: { progress: number; message: string }) {
            commit('updateJobProgress', { progress, message })
        },
        completeSlicing({ commit }, result: SliceResult) {
            commit('setJobComplete', result)
        },
        failSlicing({ commit }, error: string) {
            commit('setJobError', error)
        },
        cancelSlicing({ commit }) {
            commit('cancelJob')
        },

        // --- Adhesion actions ---

        async fetchFootprint(
            { commit, state },
            { uploadId, slicerUrl }: { uploadId: string; slicerUrl: string }
        ) {
            try {
                const params = state.sliceParams
                const response = await axios.get(
                    `${slicerUrl}/api/upload/${encodeURIComponent(uploadId)}/footprint`,
                    {
                        params: {
                            first_layer_height: params.first_layer_height,
                            corner_angle_threshold: 100,
                        },
                    }
                )
                const data = response.data as FootprintData
                commit('setFootprintData', data)
                return data
            } catch (error) {
                console.error('Failed to fetch footprint:', error)
                throw error
            }
        },

        applySuggestedMarkers({ commit, state }) {
            const fp = state.footprintData
            if (!fp || !fp.suggestions) return

            const markers: AdhesionMarker[] = fp.suggestions.map((s, idx) => ({
                id: `suggest-${idx}-${Date.now().toString(36)}`,
                type: s.type === 'raft_pad' ? ('raft_pad' as const) : ('mouse_ear' as const),
                x: s.x,
                y: s.y,
                confirmed: false,
                reason: s.reason,
                priority: s.priority,
            }))
            commit('setAdhesionMarkers', [...state.adhesionMarkers, ...markers])
        },

        addManualMarker(
            { commit },
            { type, x, y }: { type: 'mouse_ear' | 'raft_pad'; x: number; y: number }
        ) {
            const marker: AdhesionMarker = {
                id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`,
                type,
                x,
                y,
                confirmed: true,
                width: type === 'raft_pad' ? 15 : undefined,
                depth: type === 'raft_pad' ? 15 : undefined,
            }
            commit('addAdhesionMarker', marker)
        },
    },
}
