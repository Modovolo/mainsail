/**
 * Prepare Page Vuex Store Module
 *
 * Enables communication between TheTopbar (menu actions) and PreparePage (3D viewer)
 * Manages slice parameters, profiles, and job state
 */

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
} from './types'

const DEFAULT_SLICE_PARAMS: SliceParams = {
    layer_height: 0.2,
    first_layer_height: 0.3,
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
    support_pattern: 'grid',
    enable_non_planar: false,
    max_slope_angle: 45,
    enable_idex: false,
    idex_mode: 'normal',
}

const QUALITY_PRESETS: Record<string, Partial<SliceParams>> = {
    draft: { layer_height: 0.3, first_layer_height: 0.35, wall_count: 2, infill_density: 10, print_speed: 80 },
    normal: { layer_height: 0.2, first_layer_height: 0.3, wall_count: 3, infill_density: 20, print_speed: 60 },
    fine: { layer_height: 0.12, first_layer_height: 0.2, wall_count: 4, infill_density: 25, print_speed: 45 },
    ultra: { layer_height: 0.08, first_layer_height: 0.15, wall_count: 5, infill_density: 30, print_speed: 30 },
}

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
    printerProfiles: [],
    activePrinterId: null,
    currentJob: null,
    isSlicing: false,
    lastResult: null,
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

        reset(state) {
            // Preserve profiles and printer settings across resets
            const { profiles, activeProfileId, printerProfiles, activePrinterId, sliceParams } = state
            Object.assign(state, getDefaultState())
            state.profiles = profiles
            state.activeProfileId = activeProfileId
            state.printerProfiles = printerProfiles
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
    },
}
