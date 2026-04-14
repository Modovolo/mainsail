<template>
    <div class="preview-page">
        <!-- Toolbar -->
        <div class="preview-toolbar">
            <!-- Printer Profile Selector -->
            <v-menu
                v-model="showPrinterMenu"
                :close-on-content-click="true"
                offset-y
                bottom
                max-width="400">
                <template #activator="{ on, attrs }">
                    <v-btn text small class="printer-selector mr-4" v-bind="attrs" v-on="on">
                        <v-icon left small>{{ mdiPrinter3d }}</v-icon>
                        {{ activePrinterName }}
                        <span class="text-caption ml-1 grey--text">{{ activePrinterDims }}</span>
                        <v-icon right x-small>{{ showPrinterMenu ? mdiChevronUp : mdiChevronDown }}</v-icon>
                    </v-btn>
                </template>
                <v-card>
                    <v-card-title class="py-2 text-subtitle-2">Build Volume</v-card-title>
                    <v-divider />
                    <v-list dense class="py-0" style="max-height: 300px; overflow-y: auto;">
                        <v-list-item
                            v-for="profile in printerProfiles"
                            :key="profile.id"
                            :class="{ 'primary--text v-list-item--active': activePrinterId === profile.id }"
                            @click="selectPrinterProfile(profile.id)">
                            <v-list-item-icon class="mr-2">
                                <v-icon small>{{ mdiPrinter3d }}</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title>{{ profile.name }}</v-list-item-title>
                                <v-list-item-subtitle class="text-caption">
                                    {{ profile.buildVolume.x }}&times;{{ profile.buildVolume.y }}&times;{{ profile.buildVolume.z }}mm
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list>
                </v-card>
            </v-menu>

            <v-divider vertical class="mr-4" />

            <v-btn-toggle v-model="colorMode" dense mandatory class="mr-4">
                <v-btn small value="feature">
                    <v-icon small left>{{ mdiPalette }}</v-icon>
                    Feature
                </v-btn>
                <v-btn small value="speed">
                    <v-icon small left>{{ mdiSpeedometer }}</v-icon>
                    Speed
                </v-btn>
            </v-btn-toggle>

            <v-checkbox
                v-model="showTravel"
                label="Travel"
                dense
                hide-details
                class="mr-4 mt-0 pt-0 d-inline-flex" />

            <v-checkbox
                v-model="showRetractions"
                label="Retractions"
                dense
                hide-details
                class="mr-4 mt-0 pt-0 d-inline-flex" />

            <v-checkbox
                v-model="showModelOutline"
                label="Outline"
                dense
                hide-details
                class="mr-4 mt-0 pt-0 d-inline-flex" />

            <v-spacer />

            <v-btn
                v-if="loadedGcodeText"
                small
                outlined
                class="mr-4"
                @click="saveGcodeFile">
                <v-icon small left>{{ mdiDownload }}</v-icon>
                Save G-code
            </v-btn>

            <v-btn icon small class="mr-2" @click="resetCamera">
                <v-icon small>{{ mdiCameraFlip }}</v-icon>
            </v-btn>
            <v-btn icon small @click="fitView">
                <v-icon small>{{ mdiCropFree }}</v-icon>
            </v-btn>
        </div>

        <!-- 3D Viewer -->
        <div ref="viewerContainer" class="preview-viewer" />

        <!-- Path progress slider (horizontal, bottom) -->
        <div v-if="parsedGcode && totalLayers > 0" class="path-slider-container">
            <div class="text-caption mb-1">Path {{ pathProgress }}%</div>
            <v-slider
                v-model="pathProgress"
                :min="0"
                :max="100"
                hide-details
                class="path-slider"
                @input="onPathProgressChange" />
        </div>

        <!-- Layer Slider (vertical, right side) -->
        <div v-if="parsedGcode && totalLayers > 0" class="layer-slider-container">
            <div class="layer-info">
                <div class="text-caption">Layer {{ currentLayer + 1 }} / {{ totalLayers }}</div>
                <div class="text-caption">Z: {{ currentZ.toFixed(2) }}mm</div>
            </div>
            <v-slider
                v-model="currentLayer"
                :min="0"
                :max="totalLayers - 1"
                vertical
                hide-details
                class="layer-slider"
                @input="onLayerChange" />
            <div class="layer-range">
                <v-checkbox
                    v-model="showLayerRange"
                    label="Range"
                    dense
                    hide-details
                    class="mt-0 pt-0" />
                <v-slider
                    v-if="showLayerRange"
                    v-model="layerRangeStart"
                    :min="0"
                    :max="currentLayer"
                    vertical
                    hide-details
                    class="layer-slider-small" />
            </div>
            <div class="clip-section mt-2">
                <v-checkbox
                    v-model="enableClipPlane"
                    label="Clip"
                    dense
                    hide-details
                    class="mt-0 pt-0" />
                <v-slider
                    v-if="enableClipPlane"
                    v-model="clipHeight"
                    :min="0"
                    :max="clipHeightMax"
                    :step="0.1"
                    vertical
                    hide-details
                    class="layer-slider-small"
                    @input="onClipHeightChange" />
            </div>
        </div>

        <!-- Info Panel -->
        <div v-if="parsedGcode && totalLayers > 0" class="preview-info">
            <v-card dark class="pa-3" style="background: rgba(30,30,30,0.9)">
                <div class="d-flex justify-space-between mb-1">
                    <span class="text-caption grey--text">Layers</span>
                    <span class="text-caption">{{ totalLayers }}</span>
                </div>
                <div class="d-flex justify-space-between mb-1">
                    <span class="text-caption grey--text">Filament</span>
                    <span class="text-caption">{{ filamentUsed }}</span>
                </div>
                <div class="d-flex justify-space-between mb-1">
                    <span class="text-caption grey--text">Est. Time</span>
                    <span class="text-caption">{{ estimatedTime }}</span>
                </div>
                <v-divider class="my-2" />
                <div class="text-caption grey--text mb-1">Legend</div>
                <div v-for="(color, type) in visibleLegend" :key="type" class="d-flex align-center mb-1">
                    <div :style="{ width: '12px', height: '3px', background: color, marginRight: '6px' }" />
                    <span class="text-caption">{{ formatType(type) }}</span>
                </div>
            </v-card>
        </div>

        <!-- Loading state -->
        <v-overlay :value="isLoading" absolute>
            <v-progress-circular indeterminate size="64" />
            <div class="mt-4">{{ loadingMessage }}</div>
        </v-overlay>

        <!-- Empty state -->
        <div v-if="!parsedGcode && !isLoading" class="empty-state">
            <v-icon size="64" color="grey">{{ mdiPrinter3d }}</v-icon>
            <div class="text-h6 grey--text mt-4">No G-code loaded</div>
            <div class="text-body-2 grey--text mt-2">
                Slice a model in the Prepare tab, or load a G-code file
            </div>
            <v-btn color="primary" class="mt-4" @click="loadGcodeFile">
                <v-icon left>{{ mdiFolder }}</v-icon>
                Open G-code File
            </v-btn>
            <input
                ref="gcodeInput"
                type="file"
                accept=".gcode,.gco,.g"
                style="display: none"
                @change="handleGcodeFileSelect" />
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { getGcodeParserEngine } from '@/util/gcode/ParserEngine'
import { FEATURE_COLORS, FEATURE_COLORS_HEX } from '@/util/gcode/types'
import type { ParsedGcode, GcodeFeatureType } from '@/util/gcode/types'
import { toolpathsToParsedGcode } from '@/util/gcode/toolpathConverter'
import { mapSettings } from '@/util/slicer/settingsMapper'
import {
    mdiPalette,
    mdiSpeedometer,
    mdiCameraFlip,
    mdiCropFree,
    mdiPrinter3d,
    mdiFolder,
    mdiDownload,
    mdiChevronUp,
    mdiChevronDown,
} from '@mdi/js'

@Component({})
export default class PreviewPage extends Mixins(BaseMixin) {
    // Icons
    mdiPalette = mdiPalette
    mdiSpeedometer = mdiSpeedometer
    mdiCameraFlip = mdiCameraFlip
    mdiCropFree = mdiCropFree
    mdiPrinter3d = mdiPrinter3d
    mdiFolder = mdiFolder
    mdiDownload = mdiDownload
    mdiChevronUp = mdiChevronUp
    mdiChevronDown = mdiChevronDown

    // Printer profile selector
    showPrinterMenu = false

    get printerProfiles(): any[] {
        return this.$store.state.prepare?.printerProfiles ?? []
    }

    get activePrinterId(): string {
        return this.$store.state.prepare?.activePrinterId ?? 'generic'
    }

    get activeProfile(): any {
        return this.printerProfiles.find((p: any) => p.id === this.activePrinterId) ?? this.printerProfiles[0] ?? null
    }

    get activePrinterName(): string {
        return this.activeProfile?.name ?? 'Unknown'
    }

    get activePrinterDims(): string {
        const v = this.activeProfile?.buildVolume
        return v ? `${v.x}×${v.y}×${v.z}` : ''
    }

    selectPrinterProfile(id: string) {
        this.$store.dispatch('prepare/selectPrinter', id)
        this.syncBedFromStore()
        this.buildBuildPlate()
        this.resetCamera()
    }

    // Three.js objects
    private renderer: THREE.WebGLRenderer | null = null
    private scene: THREE.Scene | null = null
    private camera: THREE.PerspectiveCamera | null = null
    private controls: OrbitControls | null = null
    private renderPending = false
    private buildPlate: THREE.Group | null = null
    private bedWidth = 220
    private bedDepth = 220
    private bedHeight = 250
    private activeBuildToken = 0
    private readonly maxGlobalSegments = 2000000
    private readonly defaultExtrusionRibbonWidthMm = 0.42
    private readonly minRenderableSegmentMm = 0.0005
    private builtSegmentsTotal = 0
    private warnedSafetyCap = false
    private builtLayers: Set<number> = new Set()
    private readonly onControlsChange = () => this.requestRender()
    private lastLoadedPrepareGcode: string | null = null

    /** Raw G-code text of the currently loaded file (for saving) */
    private loadedGcodeText: string | null = null
    private loadedGcodeFileName: string | null = null

    // Toolpath objects (one group per layer, separate travel lines)
    private layerMeshes: Map<number, THREE.Group> = new Map()
    private travelLines: Map<number, THREE.LineSegments> = new Map()

    // State
    parsedGcode: ParsedGcode | null = null
    isLoading = false
    loadingMessage = ''

    // Visualization settings
    colorMode: 'feature' | 'speed' = 'feature'
    showTravel = false
    showRetractions = false
    showModelOutline = true
    currentLayer = 0
    showLayerRange = false
    layerRangeStart = 0
    pathProgress = 100
    enableClipPlane = false
    clipHeight = 0

    // Model outline mesh
    private modelOutlineMesh: THREE.LineSegments | null = null

    // Clipping plane
    private clipPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)

    // Speed range (computed during build)
    private speedMin = Infinity
    private speedMax = 0

    get totalLayers(): number {
        return this.parsedGcode?.totalLayers ?? 0
    }

    get currentZ(): number {
        if (!this.parsedGcode || this.currentLayer >= this.parsedGcode.layers.length) return 0
        return this.parsedGcode.layers[this.currentLayer].z
    }

    get filamentUsed(): string {
        if (!this.parsedGcode) return '0m'
        const m = this.parsedGcode.filamentUsedMm / 1000
        return `${m.toFixed(2)}m`
    }

    get estimatedTime(): string {
        if (!this.parsedGcode) return '0m'
        const s = this.parsedGcode.estimatedTimeS
        const h = Math.floor(s / 3600)
        const m = Math.round((s % 3600) / 60)
        return h > 0 ? `${h}h ${m}m` : `${m}m`
    }

    get visibleLegend(): Record<string, string> {
        const legend: Record<string, string> = {}
        const types: GcodeFeatureType[] = [
            'outer-wall', 'inner-wall', 'top-solid', 'bottom-solid',
            'infill', 'support', 'skirt', 'brim', 'travel',
        ]

        for (const t of types) {
            legend[t] = FEATURE_COLORS[t]
        }
        return legend
    }

    get clipHeightMax(): number {
        if (!this.parsedGcode) return this.bedHeight
        return Math.max(this.parsedGcode.bounds.zMax + 1, 1)
    }

    /** Height offset per feature type (in mm) to prevent Z-fighting between coplanar ribbons */
    private static readonly FEATURE_Y_OFFSET: Partial<Record<GcodeFeatureType, number>> = {
        'infill': -0.01,
        'bottom-solid': -0.005,
        'top-solid': 0.005,
        'inner-wall': 0.01,
        'outer-wall': 0.02,
    }

    /** Width scale per feature type (relative to base ribbon width) */
    private static readonly RIBBON_WIDTH_SCALE: Partial<Record<GcodeFeatureType, number>> = {
        'outer-wall': 1.0,
        'inner-wall': 0.9,
        'top-solid': 1.0,
        'bottom-solid': 1.0,
        'infill': 0.6,
        'support': 0.5,
        'skirt': 0.8,
        'brim': 1.0,
    }

    get extrusionRibbonWidthMm(): number {
        const prepareState = this.$store.state.prepare as any
        const params = prepareState?.sliceParams
        const profiles = prepareState?.printerProfiles ?? []
        const activeId = prepareState?.activePrinterId
        const profile = profiles.find((item: any) => item.id === activeId) ?? profiles[0]

        if (!params || !profile) {
            return this.defaultExtrusionRibbonWidthMm
        }

        try {
            const config = mapSettings(params, profile)
            if (Number.isFinite(config.lineWidth) && config.lineWidth > 0) {
                return config.lineWidth
            }
        } catch (_error) {
            // Fall back to a sane visual width if mapping fails.
        }

        return this.defaultExtrusionRibbonWidthMm
    }

    formatType(type: string): string {
        return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }

    // --- Lifecycle ---

    mounted() {
        this.syncBedFromStore()

        const prepareState = this.$store.state.prepare as any
        if (!prepareState?.printerProfiles?.length) {
            this.$store.dispatch('prepare/initPrinterProfiles').then(() => {
                this.syncBedFromStore()
                this.buildBuildPlate()
                this.resetCamera()
            }).catch(() => {
                // Keep default bed dimensions if profiles cannot be loaded.
            })
        }

        this.initThree()
        this.requestRender()

        this.loadLatestPreparedGcodeIfNeeded()

        window.addEventListener('resize', this.onResize)
        window.addEventListener('keydown', this.onKeyDown)
    }

    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        window.removeEventListener('keydown', this.onKeyDown)
        if (this._layerUpdateRAF) cancelAnimationFrame(this._layerUpdateRAF)
        this.controls?.removeEventListener('change', this.onControlsChange)
        this.activeBuildToken++

        this.removeModelOutline()
        this.renderer?.dispose()
        this.controls?.dispose()
    }

    beforeRouteLeave(_to: any, _from: any, next: any) {
        next()
    }

    syncBedFromStore() {
        const prepareState = this.$store.state.prepare as any
        const profiles = prepareState?.printerProfiles ?? []
        const activeId = prepareState?.activePrinterId
        const profile = profiles.find((item: any) => item.id === activeId) ?? profiles[0]
        if (profile?.buildVolume) {
            this.bedWidth = Number(profile.buildVolume.x) || 220
            this.bedDepth = Number(profile.buildVolume.y) || 220
            this.bedHeight = Number(profile.buildVolume.z) || 250
        }
    }

    // --- Three.js Setup ---

    initThree() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container) return

        // Scene
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x1a1a2e)

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            5000
        )
        this.camera.position.set(150, 150, 200)

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.localClippingEnabled = true
        container.appendChild(this.renderer.domElement)

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = false
        this.controls.addEventListener('change', this.onControlsChange)

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.4)
        directional.position.set(200, 300, 200)
        this.scene.add(directional)

        // Build plate (simple grid)
        this.buildBuildPlate()
        this.requestRender()
    }

    private renderScene() {
        this.renderPending = false
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera)
        }
    }

    private requestRender() {
        if (this.renderPending) return
        this.renderPending = true
        requestAnimationFrame(() => this.renderScene())
    }

    buildBuildPlate() {
        if (!this.scene) return

        if (this.buildPlate) {
            this.scene.remove(this.buildPlate)
        }

        this.buildPlate = new THREE.Group()

        // Grid
        const gridSize = Math.max(this.bedWidth, this.bedDepth)
        const gridDiv = Math.max(10, Math.round(gridSize / 10))
        const grid = new THREE.GridHelper(gridSize, gridDiv, 0x444466, 0x333355)
        grid.position.set(this.bedWidth / 2, 0, this.bedDepth / 2)
        this.buildPlate.add(grid)

        // Floor plane
        const floorGeo = new THREE.PlaneGeometry(this.bedWidth, this.bedDepth)
        const floorMat = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
        })
        const floor = new THREE.Mesh(floorGeo, floorMat)
        floor.rotation.x = -Math.PI / 2
        floor.position.x = this.bedWidth / 2
        floor.position.z = this.bedDepth / 2
        floor.position.y = -0.01
        this.buildPlate.add(floor)

        const boxGeometry = new THREE.BoxGeometry(this.bedWidth, this.bedHeight, this.bedDepth)
        const edges = new THREE.EdgesGeometry(boxGeometry)
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.4 })
        const wireframe = new THREE.LineSegments(edges, lineMaterial)
        wireframe.position.set(this.bedWidth / 2, this.bedHeight / 2, this.bedDepth / 2)
        this.buildPlate.add(wireframe)

        this.scene.add(this.buildPlate)
        this.requestRender()
    }

    /** Build a transparent wireframe outline from per-layer G-code bounds */
    private buildModelOutline() {
        if (!this.parsedGcode || !this.scene) return

        this.removeModelOutline()

        const positions: number[] = []
        const layers = this.parsedGcode.layers

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i]
            const b = layer.bounds
            if (!Number.isFinite(b.xMin) || !Number.isFinite(b.xMax)) continue

            const y = layer.z
            // Rectangle outline at this layer height
            positions.push(b.xMin, y, b.yMin, b.xMax, y, b.yMin)
            positions.push(b.xMax, y, b.yMin, b.xMax, y, b.yMax)
            positions.push(b.xMax, y, b.yMax, b.xMin, y, b.yMax)
            positions.push(b.xMin, y, b.yMax, b.xMin, y, b.yMin)

            // Vertical edges connecting to next layer
            if (i < layers.length - 1) {
                const nextLayer = layers[i + 1]
                const nb = nextLayer.bounds
                if (!Number.isFinite(nb.xMin)) continue
                const ny = nextLayer.z
                positions.push(b.xMin, y, b.yMin, nb.xMin, ny, nb.yMin)
                positions.push(b.xMax, y, b.yMin, nb.xMax, ny, nb.yMin)
                positions.push(b.xMax, y, b.yMax, nb.xMax, ny, nb.yMax)
                positions.push(b.xMin, y, b.yMax, nb.xMin, ny, nb.yMax)
            }
        }

        if (positions.length === 0) return

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        const mat = new THREE.LineBasicMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.15,
        })
        this.modelOutlineMesh = new THREE.LineSegments(geo, mat)
        this.modelOutlineMesh.visible = this.showModelOutline
        this.scene.add(this.modelOutlineMesh)
        this.requestRender()
    }

    private removeModelOutline() {
        if (this.modelOutlineMesh && this.scene) {
            this.scene.remove(this.modelOutlineMesh)
            this.modelOutlineMesh.geometry.dispose()
            ;(this.modelOutlineMesh.material as THREE.Material).dispose()
            this.modelOutlineMesh = null
        }
    }

    private updateClipPlane() {
        // Plane normal (0, -1, 0) with constant = clipHeight
        // clips everything above clipHeight
        this.clipPlane.set(new THREE.Vector3(0, -1, 0), this.clipHeight)
        this.requestRender()
    }

    onClipHeightChange() {
        this.updateClipPlane()
    }

    onResize() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.renderer) return
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.requestRender()
    }

    resetCamera() {
        if (!this.camera || !this.controls) return
        const maxSize = Math.max(this.bedWidth, this.bedDepth, this.bedHeight)
        this.camera.position.set(maxSize * 0.7, maxSize * 0.7, maxSize)
        this.controls.target.set(this.bedWidth / 2, 0, this.bedDepth / 2)
        this.controls.update()
        this.requestRender()
    }

    fitView() {
        if (!this.parsedGcode || !this.camera || !this.controls) return
        const b = this.parsedGcode.bounds
        if (
            !b ||
            !Number.isFinite(b.xMin) ||
            !Number.isFinite(b.xMax) ||
            !Number.isFinite(b.yMin) ||
            !Number.isFinite(b.yMax) ||
            !Number.isFinite(b.zMin) ||
            !Number.isFinite(b.zMax)
        ) {
            this.resetCamera()
            return
        }
        // Frame both the model and the build plate so the user sees context.
        // Target the bed center horizontally, at model mid-height vertically
        const targetX = this.bedWidth / 2
        const targetY = (b.zMin + b.zMax) / 2
        const targetZ = this.bedDepth / 2
        // Size based on whichever is larger: model or bed
        const size = Math.max(
            this.bedWidth, this.bedDepth,
            b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin
        ) || 100
        this.camera.position.set(targetX + size * 0.8, targetY + size * 0.6, targetZ + size * 0.9)
        this.controls.target.set(targetX, targetY, targetZ)
        this.controls.update()
        this.requestRender()
    }

    // --- G-code Loading ---

    private get isPreviewModeRoute(): boolean {
        const path = String(this.$route.path || '')
        const mode = String(this.$route.query.mode || '').toLowerCase()
        return path === '/preview' || (path === '/slicing' && mode === 'preview')
    }

    private loadLatestPreparedGcodeIfNeeded() {
        const prepareState = this.$store.state.prepare as any

        // Prefer structured toolpath data (direct from slicer, no roundtrip)
        const toolpaths = prepareState?.lastToolpaths
        if (toolpaths && Array.isArray(toolpaths) && toolpaths.length > 0) {
            const gcodeData = prepareState?.lastGcode
            if (gcodeData === this.lastLoadedPrepareGcode) return
            this.lastLoadedPrepareGcode = gcodeData
            this.loadedGcodeText = gcodeData ?? null
            this.loadedGcodeFileName = 'sliced-output.gcode'
            this.loadFromToolpaths(toolpaths, gcodeData)
            return
        }

        // Fall back to parsing G-code text
        const gcodeData = prepareState?.lastGcode
        if (!gcodeData) return
        if (gcodeData === this.lastLoadedPrepareGcode) return

        this.lastLoadedPrepareGcode = gcodeData
        this.loadedGcodeText = gcodeData
        this.loadedGcodeFileName = 'sliced-output.gcode'
        this.loadGcodeString(gcodeData)
    }

    loadGcodeFile() {
        (this.$refs.gcodeInput as HTMLInputElement)?.click()
    }

    saveGcodeFile() {
        if (!this.loadedGcodeText) return
        const blob = new Blob([this.loadedGcodeText], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = this.loadedGcodeFileName || 'output.gcode'
        a.click()
        URL.revokeObjectURL(url)
    }

    handleGcodeFileSelect(event: Event) {
        const input = event.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return

        this.isLoading = true
        this.loadingMessage = 'Reading file...'

        const fileName = file.name
        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            this.loadedGcodeText = text
            this.loadedGcodeFileName = fileName
            this.loadGcodeString(text)
        }
        reader.readAsText(file)
        input.value = ''
    }

    @Watch('$route.query.mode', { immediate: true })
    onRouteModeChanged() {
        if (!this.isPreviewModeRoute) return
        this.loadLatestPreparedGcodeIfNeeded()
    }

    @Watch('$store.state.prepare.lastGcode')
    onPrepareGcodeChanged() {
        if (!this.isPreviewModeRoute) return
        this.loadLatestPreparedGcodeIfNeeded()
    }

    async loadGcodeString(gcode: string) {
        this.isLoading = true
        this.loadingMessage = 'Parsing G-code...'
        const buildToken = ++this.activeBuildToken

        // Parse in next tick to allow UI to update
        await this.$nextTick()

        try {
            const parserEngine = getGcodeParserEngine()
            const parsed = await parserEngine.parse(gcode, ({ progress }) => {
                this.loadingMessage = `Parsing G-code... ${Math.round(progress)}%`
            })

            if (buildToken !== this.activeBuildToken) return

            if (!parsed || !Array.isArray(parsed.layers) || parsed.totalLayers <= 0) {
                this.parsedGcode = null
                this.$toast.error('No printable layers found in this G-code file')
                return
            }

            const isMainsailGenerated = /Generated by Mainsail Slicer/i.test(gcode)
            this.alignParsedToBuildVolume(parsed, isMainsailGenerated)

            this.parsedGcode = parsed
            this.currentLayer = Math.max(parsed.totalLayers - 1, 0)
            this.layerRangeStart = this.currentLayer
            this.showLayerRange = false
            this.pathProgress = 100
            this.loadingMessage = 'Building preview layers...'

            await this.$nextTick()
            await this.buildAllLayers(buildToken)

            if (buildToken !== this.activeBuildToken) return

            this.buildModelOutline()
            if (this.enableClipPlane) {
                this.clipHeight = this.clipHeightMax
                this.updateClipPlane()
            }
            this.updateLayerVisibility()
            this.fitView()
        } catch (error: any) {
            console.error('Failed to parse G-code:', error)
        } finally {
            if (buildToken === this.activeBuildToken) {
                this.isLoading = false
            }
        }
    }

    /**
     * Load preview directly from structured slicer toolpath data.
     * Bypasses the G-code text → parse roundtrip, ensuring the preview
     * shows exactly what the slicer produced with no information loss.
     */
    async loadFromToolpaths(toolpaths: any[], _gcodeText?: string) {
        this.isLoading = true
        this.loadingMessage = 'Converting toolpath data...'
        const buildToken = ++this.activeBuildToken

        await this.$nextTick()

        try {
            const parsed = toolpathsToParsedGcode(toolpaths)

            if (buildToken !== this.activeBuildToken) return

            if (!parsed || parsed.totalLayers <= 0) {
                this.parsedGcode = null
                this.$toast.error('No printable layers found in toolpath data')
                return
            }

            // Mainsail-generated toolpaths are already in bed-space coordinates
            this.alignParsedToBuildVolume(parsed, true)

            this.parsedGcode = parsed
            this.currentLayer = Math.max(parsed.totalLayers - 1, 0)
            this.layerRangeStart = this.currentLayer
            this.showLayerRange = false
            this.pathProgress = 100
            this.loadingMessage = 'Building preview layers...'

            await this.$nextTick()
            await this.buildAllLayers(buildToken)

            if (buildToken !== this.activeBuildToken) return

            this.buildModelOutline()
            if (this.enableClipPlane) {
                this.clipHeight = this.clipHeightMax
                this.updateClipPlane()
            }
            this.updateLayerVisibility()
            this.fitView()
        } catch (error: any) {
            console.error('Failed to load toolpath data:', error)
            // Fall back to G-code parsing if toolpath conversion fails
            if (_gcodeText) {
                this.loadGcodeString(_gcodeText)
            }
        } finally {
            if (buildToken === this.activeBuildToken) {
                this.isLoading = false
            }
        }
    }

    private alignParsedToBuildVolume(parsed: ParsedGcode, isMainsailGenerated = false) {
        const b = parsed.bounds
        if (!Number.isFinite(b.xMin) || !Number.isFinite(b.xMax) || !Number.isFinite(b.yMin) || !Number.isFinite(b.yMax)) {
            return
        }

        // Slicer output produced in Prepare already uses bed-space coordinates.
        // Applying heuristic remapping here can shift valid toolpaths incorrectly.
        if (isMainsailGenerated) {
            return
        }

        const explicitOrigin = this.getActiveBedOriginMode()
        if (explicitOrigin === 'center') {
            this.applyParsedOffset(parsed, this.bedWidth / 2, this.bedDepth / 2)
            return
        }
        if (explicitOrigin === 'front-left') {
            return
        }

        const cx = (b.xMin + b.xMax) / 2
        const cy = (b.yMin + b.yMax) / 2

        const candidates = [
            { dx: 0, dy: 0 },
            { dx: this.bedWidth / 2, dy: this.bedDepth / 2 },
            { dx: -b.xMin, dy: -b.yMin },
            { dx: this.bedWidth / 2 - cx, dy: this.bedDepth / 2 - cy },
        ]

        let best = candidates[0]
        let bestScore = Number.POSITIVE_INFINITY
        for (const candidate of candidates) {
            const score = this.scoreOffsetFit(b, candidate.dx, candidate.dy)
            if (score < bestScore) {
                bestScore = score
                best = candidate
            }
        }

        if (Math.abs(best.dx) < 0.0001 && Math.abs(best.dy) < 0.0001) {
            return
        }

        this.applyParsedOffset(parsed, best.dx, best.dy)
    }

    private getActiveBedOriginMode(): 'front-left' | 'center' | null {
        const prepareState = this.$store.state.prepare as any
        const profiles = prepareState?.printerProfiles ?? []
        const activeId = prepareState?.activePrinterId
        const profile = profiles.find((item: any) => item.id === activeId) ?? profiles[0]
        const mode = String(profile?.bedOrigin ?? '').toLowerCase()

        if (mode === 'front-left' || mode === 'center') {
            return mode
        }

        return null
    }

    private scoreOffsetFit(
        bounds: ParsedGcode['bounds'],
        dx: number,
        dy: number
    ): number {
        const xMin = bounds.xMin + dx
        const xMax = bounds.xMax + dx
        const yMin = bounds.yMin + dy
        const yMax = bounds.yMax + dy

        const overflowLeft = Math.max(0, -xMin)
        const overflowRight = Math.max(0, xMax - this.bedWidth)
        const overflowBottom = Math.max(0, -yMin)
        const overflowTop = Math.max(0, yMax - this.bedDepth)
        const overflow = overflowLeft + overflowRight + overflowBottom + overflowTop

        const centerX = (xMin + xMax) / 2
        const centerY = (yMin + yMax) / 2
        const centerDistance =
            Math.abs(centerX - this.bedWidth / 2) +
            Math.abs(centerY - this.bedDepth / 2)

        // Penalize out-of-bed placement heavily, then prefer bed-centered fit.
        return overflow * 10000 + centerDistance
    }

    private applyParsedOffset(parsed: ParsedGcode, dx: number, dy: number) {
        for (const layer of parsed.layers) {
            for (const move of layer.moves) {
                move.x += dx
                move.y += dy
            }

            if (Number.isFinite(layer.bounds.xMin)) layer.bounds.xMin += dx
            if (Number.isFinite(layer.bounds.xMax)) layer.bounds.xMax += dx
            if (Number.isFinite(layer.bounds.yMin)) layer.bounds.yMin += dy
            if (Number.isFinite(layer.bounds.yMax)) layer.bounds.yMax += dy
        }

        parsed.bounds.xMin += dx
        parsed.bounds.xMax += dx
        parsed.bounds.yMin += dy
        parsed.bounds.yMax += dy
    }

    // --- Toolpath Visualization ---

    /**
     * Build Three.js line geometry for all layers.
     * Each feature type gets its own colored LineSegments object.
     */
    async buildAllLayers(buildToken: number = this.activeBuildToken) {
        if (!this.parsedGcode || !this.scene) return

        this.clearBuiltLayers()

        const total = this.parsedGcode.totalLayers
        for (let idx = 0; idx < total; idx++) {
            if (buildToken !== this.activeBuildToken) return

            this.buildSingleLayer(idx)

            if (idx % 8 === 0 || idx === total - 1) {
                const progress = Math.round(((idx + 1) / total) * 100)
                this.loadingMessage = `Building preview layers... ${progress}%`
                this.updateLayerVisibility()
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            }
        }

        this.requestRender()
    }

    private clearBuiltLayers() {
        if (!this.scene) return
        for (const [, group] of this.layerMeshes) {
            this.scene.remove(group)
        }
        for (const [, line] of this.travelLines) {
            this.scene.remove(line)
        }
        this.layerMeshes.clear()
        this.travelLines.clear()
        this.builtLayers.clear()
        this.builtSegmentsTotal = 0
        this.warnedSafetyCap = false
        this.speedMin = Infinity
        this.speedMax = 0
    }

    private buildSingleLayer(layerIndex: number): boolean {
        if (!this.parsedGcode || !this.scene) return false
        if (this.builtLayers.has(layerIndex)) return true
        if (this.builtSegmentsTotal >= this.maxGlobalSegments) {
            if (!this.warnedSafetyCap) {
                this.warnedSafetyCap = true
                this.$toast.error('Preview simplified to avoid memory crash on large G-code')
            }
            return false
        }

        const layer = this.parsedGcode.layers[layerIndex]
        if (!layer) return false

        const group = new THREE.Group()
        group.name = `layer-${layer.layerIndex}`

        // Collect segments by type, including feedrate for speed coloring
        const segmentsByType = new Map<GcodeFeatureType, { positions: number[]; feedrates: number[] }>()
        let prevX = 0
        let prevY = 0

        if (layerIndex > 0 && this.parsedGcode.layers[layerIndex - 1]) {
            const prevLayer = this.parsedGcode.layers[layerIndex - 1]
            if (prevLayer.moves.length > 0) {
                const lastMove = prevLayer.moves[prevLayer.moves.length - 1]
                prevX = lastMove.x
                prevY = lastMove.y
            }
        }

        const travelPositions: number[] = []
        for (let moveIndex = 0; moveIndex < layer.moves.length; moveIndex++) {
            if (this.builtSegmentsTotal >= this.maxGlobalSegments) break

            const move = layer.moves[moveIndex]
            if (move.type === 'travel') {
                travelPositions.push(prevX, layer.z, prevY)
                travelPositions.push(move.x, layer.z, move.y)
            } else {
                const type = move.type as GcodeFeatureType
                if (!segmentsByType.has(type)) {
                    segmentsByType.set(type, { positions: [], feedrates: [] })
                }
                const bucket = segmentsByType.get(type)!
                bucket.positions.push(prevX, layer.z, prevY)
                bucket.positions.push(move.x, layer.z, move.y)
                bucket.feedrates.push(move.f)

                // Track speed range
                if (move.f > 0) {
                    if (move.f < this.speedMin) this.speedMin = move.f
                    if (move.f > this.speedMax) this.speedMax = move.f
                }
            }

            this.builtSegmentsTotal += 1
            prevX = move.x
            prevY = move.y
        }

        const clipPlanes = this.enableClipPlane ? [this.clipPlane] : []

        for (const [type, bucket] of segmentsByType) {
            if (!bucket.positions.length) continue

            const widthScale = PreviewPage.RIBBON_WIDTH_SCALE[type] ?? 1.0
            const halfWidth = (this.extrusionRibbonWidthMm * widthScale) / 2
            const yOffset = PreviewPage.FEATURE_Y_OFFSET[type] ?? 0

            // Apply per-type Y offset to resolve Z-fighting between coplanar ribbons
            if (yOffset !== 0) {
                for (let p = 1; p < bucket.positions.length; p += 3) {
                    bucket.positions[p] += yOffset
                }
            }

            const useSpeedColor = this.colorMode === 'speed'
            const geometry = this.buildRibbonGeometry(bucket.positions, halfWidth, useSpeedColor ? bucket.feedrates : undefined)
            if (!geometry) continue

            let material: THREE.Material
            if (useSpeedColor && geometry.getAttribute('color')) {
                material = new THREE.MeshBasicMaterial({
                    vertexColors: true,
                    side: THREE.DoubleSide,
                    clippingPlanes: clipPlanes,
                })
            } else {
                material = new THREE.MeshBasicMaterial({
                    color: FEATURE_COLORS_HEX[type] ?? 0xffffff,
                    side: THREE.DoubleSide,
                    clippingPlanes: clipPlanes,
                })
            }

            group.add(new THREE.Mesh(geometry, material))
        }

        this.scene.add(group)
        this.layerMeshes.set(layer.layerIndex, group)

        if (travelPositions.length > 0) {
            const travelGeo = new THREE.BufferGeometry()
            travelGeo.setAttribute('position', new THREE.Float32BufferAttribute(travelPositions, 3))
            const travelMat = new THREE.LineBasicMaterial({
                color: FEATURE_COLORS_HEX.travel,
                linewidth: 1,
                transparent: true,
                opacity: 0.3,
                clippingPlanes: clipPlanes,
            })
            const travelLine = new THREE.LineSegments(travelGeo, travelMat)
            travelLine.visible = this.showTravel
            this.scene.add(travelLine)
            this.travelLines.set(layer.layerIndex, travelLine)
        }

        this.builtLayers.add(layer.layerIndex)
        return true
    }

    private buildRibbonGeometry(
        segmentPositions: number[],
        halfWidth: number = this.extrusionRibbonWidthMm / 2,
        feedrates?: number[],
    ): THREE.BufferGeometry | null {
        const vertices: number[] = []
        const indices: number[] = []
        const colors: number[] = []
        let segmentCount = 0

        const hasSpeed = feedrates && feedrates.length > 0
        const speedRange = this.speedMax - this.speedMin

        for (let i = 0; i + 5 < segmentPositions.length; i += 6) {
            const segIndex = i / 6
            const x1 = segmentPositions[i]
            const y1 = segmentPositions[i + 1]
            const z1 = segmentPositions[i + 2]
            const x2 = segmentPositions[i + 3]
            const y2 = segmentPositions[i + 4]
            const z2 = segmentPositions[i + 5]

            const dx = x2 - x1
            const dz = z2 - z1
            const length = Math.hypot(dx, dz)
            if (!Number.isFinite(length) || length <= this.minRenderableSegmentMm) {
                continue
            }

            const nx = -dz / length
            const nz = dx / length
            const ox = nx * halfWidth
            const oz = nz * halfWidth
            const y = (y1 + y2) / 2

            const base = vertices.length / 3
            vertices.push(
                x1 + ox, y, z1 + oz,
                x1 - ox, y, z1 - oz,
                x2 + ox, y, z2 + oz,
                x2 - ox, y, z2 - oz,
            )
            indices.push(
                base, base + 2, base + 1,
                base + 2, base + 3, base + 1,
            )

            // Speed color: blue (slow) → green → red (fast)
            if (hasSpeed) {
                const f = feedrates[segIndex] ?? 0
                const t = speedRange > 0 ? Math.max(0, Math.min(1, (f - this.speedMin) / speedRange)) : 0.5
                const r = t < 0.5 ? 0 : (t - 0.5) * 2
                const g = t < 0.5 ? t * 2 : (1 - t) * 2
                const b = t < 0.5 ? 1 - t * 2 : 0
                // 4 vertices per segment
                colors.push(r, g, b, r, g, b, r, g, b, r, g, b)
            }

            segmentCount += 1
        }

        if (segmentCount === 0) {
            return null
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
        geometry.setIndex(indices)
        geometry.userData.segmentCount = segmentCount

        if (hasSpeed && colors.length > 0) {
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        }

        return geometry
    }

    /**
     * Show/hide layers based on the current layer slider position.
     */
    updateLayerVisibility() {
        if (!this.parsedGcode || this.totalLayers <= 0) return

        const end = Math.min(Math.max(0, this.currentLayer), this.totalLayers - 1)
        const start = this.showLayerRange ? Math.max(0, this.layerRangeStart) : 0

        for (const [idx, group] of this.layerMeshes) {
            group.visible = idx >= start && idx <= end
        }
        for (const [idx, line] of this.travelLines) {
            line.visible = this.showTravel && idx >= start && idx <= end
        }

        this.applyPathProgressToVisibleLayers(end)
        this.requestRender()
    }

    private applyPathProgressToVisibleLayers(end: number) {
        for (const [idx, group] of this.layerMeshes) {
            const progress = idx === end ? this.pathProgress : 100
            for (const child of group.children) {
                const geometry = (child as any).geometry as THREE.BufferGeometry | undefined
                if (!geometry) continue

                const indexedSegments = Number(geometry.userData.segmentCount ?? 0)
                if (indexedSegments > 0 && geometry.index) {
                    const visibleSegments = progress >= 100
                        ? indexedSegments
                        : Math.max(0, Math.min(indexedSegments, Math.floor((indexedSegments * progress) / 100)))
                    geometry.setDrawRange(0, visibleSegments * 6)
                    continue
                }

                const positionAttr = geometry.getAttribute('position')
                if (!positionAttr) continue

                const totalVertices = positionAttr.count
                const visibleVertices = progress >= 100
                    ? totalVertices
                    : Math.max(0, Math.min(totalVertices, Math.floor((totalVertices * progress) / 100)))
                const evenVertices = visibleVertices - (visibleVertices % 2)
                geometry.setDrawRange(0, evenVertices)
            }
        }

        for (const [idx, line] of this.travelLines) {
            const geometry = line.geometry as THREE.BufferGeometry
            const positionAttr = geometry.getAttribute('position')
            if (!positionAttr) continue

            const totalVertices = positionAttr.count
            const progress = idx === end && this.showTravel ? this.pathProgress : 100
            const visibleVertices = progress >= 100
                ? totalVertices
                : Math.max(0, Math.min(totalVertices, Math.floor((totalVertices * progress) / 100)))
            const evenVertices = visibleVertices - (visibleVertices % 2)
            geometry.setDrawRange(0, evenVertices)
        }
    }

    // --- Watchers ---

    private _layerUpdateRAF = 0

    onKeyDown(e: KeyboardEvent) {
        if (this.totalLayers <= 0) return
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (this.currentLayer < this.totalLayers - 1) {
                this.currentLayer++
                this.scheduleLayerUpdate()
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (this.currentLayer > 0) {
                this.currentLayer--
                this.scheduleLayerUpdate()
            }
        }
    }

    /**
     * Debounce layer visibility updates to the next animation frame.
     * When holding an arrow key, multiple keydowns fire per frame —
     * this coalesces them into a single update and lets Vue repaint
     * the layer number text between frames.
     */
    private scheduleLayerUpdate() {
        if (this._layerUpdateRAF) return
        this._layerUpdateRAF = requestAnimationFrame(() => {
            this._layerUpdateRAF = 0
            this.pathProgress = 100
            this.updateLayerVisibility()
        })
    }

    onLayerChange() {
        this.pathProgress = 100
        this.updateLayerVisibility()
    }

    onPathProgressChange() {
        this.updateLayerVisibility()
    }

    @Watch('showTravel')
    onShowTravelChange() {
        this.updateLayerVisibility()
    }

    @Watch('showLayerRange')
    onShowLayerRangeChange() {
        this.updateLayerVisibility()
    }

    @Watch('layerRangeStart')
    onLayerRangeStartChange() {
        this.updateLayerVisibility()
    }

    @Watch('colorMode')
    onColorModeChange() {
        // Rebuild all layers to apply new color scheme
        if (!this.parsedGcode) return
        this.buildAllLayers()
        this.updateLayerVisibility()
    }

    @Watch('showModelOutline')
    onShowModelOutlineChange() {
        if (this.modelOutlineMesh) {
            this.modelOutlineMesh.visible = this.showModelOutline
            this.requestRender()
        }
    }

    @Watch('enableClipPlane')
    onEnableClipPlaneChange() {
        if (this.enableClipPlane) {
            this.clipHeight = this.clipHeightMax
            this.updateClipPlane()
        }
        // Rebuild layers to add/remove clipping planes from materials
        if (this.parsedGcode) {
            this.buildAllLayers()
            this.updateLayerVisibility()
        }
    }
}
</script>

<style scoped>
.preview-page {
    height: 100%;
    width: 100%;
    position: relative;
    overflow: hidden;
}

.preview-toolbar {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    padding: 4px 12px;
    background: rgba(30, 30, 30, 0.85);
    border-radius: 8px;
    backdrop-filter: blur(8px);
}

.preview-viewer {
    width: 100%;
    height: 100%;
}

.path-slider-container {
    position: absolute;
    left: 16px;
    right: 96px;
    bottom: 16px;
    z-index: 10;
    background: rgba(30, 30, 30, 0.85);
    border-radius: 8px;
    padding: 8px 12px 4px;
}

.path-slider {
    margin: 0;
}

.layer-slider-container {
    position: absolute;
    right: 16px;
    top: 60px;
    bottom: 16px;
    width: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
}

.layer-info {
    text-align: center;
    margin-bottom: 8px;
    background: rgba(30, 30, 30, 0.85);
    padding: 4px 8px;
    border-radius: 4px;
}

.layer-slider {
    flex: 1;
    min-height: 200px;
}

.layer-slider-small {
    flex: 0.5;
    min-height: 100px;
}

.layer-range {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.clip-section {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.preview-info {
    position: absolute;
    left: 8px;
    bottom: 8px;
    z-index: 10;
    min-width: 180px;
}

.empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
}

.printer-selector {
    text-transform: none !important;
    letter-spacing: normal !important;
}
</style>
