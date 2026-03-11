<template>
    <div class="preview-page">
        <!-- Toolbar -->
        <div class="preview-toolbar">
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

            <v-spacer />

            <v-btn icon small class="mr-2" @click="resetCamera">
                <v-icon small>{{ mdiCameraFlip }}</v-icon>
            </v-btn>
            <v-btn icon small @click="fitView">
                <v-icon small>{{ mdiCropFree }}</v-icon>
            </v-btn>
        </div>

        <!-- 3D Viewer -->
        <div ref="viewerContainer" class="preview-viewer" />

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
import { takeSharedPrepareViewerState, clearSharedPrepareViewerState, setSharedPrepareViewerState } from '@/util/prepare/sharedViewer'
import type { Platform } from '@/util/mesh'
import {
    mdiPalette,
    mdiSpeedometer,
    mdiCameraFlip,
    mdiCropFree,
    mdiPrinter3d,
    mdiFolder,
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

    // Three.js objects
    private renderer: THREE.WebGLRenderer | null = null
    private scene: THREE.Scene | null = null
    private camera: THREE.PerspectiveCamera | null = null
    private controls: OrbitControls | null = null
    private renderPending = false
    private buildPlate: THREE.Group | null = null
    private usingSharedViewer = false
    private preserveViewerForPrepare = false
    private hiddenModelMeshes: THREE.Object3D[] = []
    private sourcePlatform: Platform | null = null
    private bedWidth = 220
    private bedDepth = 220
    private bedHeight = 250
    private activeBuildToken = 0
    private readonly maxLayerMovesForPreview = 200000
    private readonly maxGlobalSegments = 2000000
    private builtSegmentsTotal = 0
    private warnedSafetyCap = false
    private builtLayers: Set<number> = new Set()
    private pendingLayerQueue: number[] = []
    private isProcessingLayerQueue = false
    private readonly initialFinishLayersCount = 6
    private readonly onControlsChange = () => this.requestRender()

    // Toolpath line objects (one group per layer, separate travel lines)
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
    currentLayer = 0
    showLayerRange = false
    layerRangeStart = 0

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
            'infill', 'support', 'skirt', 'brim',
        ]
        if (this.showTravel) types.push('travel')

        for (const t of types) {
            legend[t] = FEATURE_COLORS[t]
        }
        return legend
    }

    formatType(type: string): string {
        return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }

    // --- Lifecycle ---

    mounted() {
        this.syncBedFromStore()

        const sharedViewer = takeSharedPrepareViewerState()
        if (sharedViewer) {
            try {
                this.usingSharedViewer = true
                this.renderer = sharedViewer.renderer
                this.scene = sharedViewer.scene
                this.camera = sharedViewer.camera
                this.controls = sharedViewer.controls

                const container = this.$refs.viewerContainer as HTMLElement
                if (container && this.renderer?.domElement) {
                    const parent = this.renderer.domElement.parentElement
                    if (parent) {
                        parent.removeChild(this.renderer.domElement)
                    }
                    container.appendChild(this.renderer.domElement)
                    this.renderer.setSize(container.clientWidth, container.clientHeight)
                    this.camera.aspect = container.clientWidth / container.clientHeight
                    this.camera.updateProjectionMatrix()
                    ;(this.controls as any).domElement = this.renderer.domElement
                    this.controls.enableDamping = false
                    this.controls.addEventListener('change', this.onControlsChange)
                    this.controls.update()
                }

                if (sharedViewer.platform) {
                    this.sourcePlatform = sharedViewer.platform
                    this.hiddenModelMeshes = sharedViewer.platform.widgets.map((widget: any) => widget.mesh)
                    for (const mesh of this.hiddenModelMeshes) {
                        mesh.visible = false
                    }
                }
            } catch (error) {
                console.warn('Failed to attach shared prepare viewer, falling back to new preview scene', error)
                this.usingSharedViewer = false
                this.hiddenModelMeshes = []
                this.renderer = null
                this.scene = null
                this.camera = null
                this.controls = null
                this.initThree()
            }
        } else {
            this.initThree()
        }
        this.requestRender()

        // Check if we have G-code from the store (passed from PreparePage slicing)
        const gcodeData = (this.$store.state.prepare as any)?.lastGcode
        if (gcodeData) {
            this.loadGcodeString(gcodeData)
        }

        window.addEventListener('resize', this.onResize)
    }

    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        this.controls?.removeEventListener('change', this.onControlsChange)
        this.activeBuildToken++

        for (const mesh of this.hiddenModelMeshes) {
            mesh.visible = true
        }
        this.hiddenModelMeshes = []

        if (!this.preserveViewerForPrepare) {
            this.renderer?.dispose()
            this.controls?.dispose()
            clearSharedPrepareViewerState()
            this.$store.commit('prepare/reset')
        }
    }

    beforeRouteLeave(to: any, _from: any, next: any) {
        const goingToPrepare = to?.name === 'prepare' || String(to?.path || '').startsWith('/prepare')
        this.preserveViewerForPrepare = goingToPrepare

        if (goingToPrepare && this.renderer && this.scene && this.camera && this.controls) {
            setSharedPrepareViewerState({
                renderer: this.renderer,
                scene: this.scene,
                camera: this.camera,
                controls: this.controls,
                platform: this.sourcePlatform,
            })
        }

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
        const cx = (b.xMin + b.xMax) / 2
        const cy = (b.zMin + b.zMax) / 2
        const cz = (b.yMin + b.yMax) / 2
        const size = Math.max(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin) || 100
        this.camera.position.set(cx + size, cy + size, cz + size)
        this.controls.target.set(cx, cy, cz)
        this.controls.update()
        this.requestRender()
    }

    // --- G-code Loading ---

    loadGcodeFile() {
        (this.$refs.gcodeInput as HTMLInputElement)?.click()
    }

    handleGcodeFileSelect(event: Event) {
        const input = event.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return

        this.isLoading = true
        this.loadingMessage = 'Reading file...'

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            this.loadGcodeString(text)
        }
        reader.readAsText(file)
        input.value = ''
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

            this.parsedGcode = parsed
            this.currentLayer = Math.max(parsed.totalLayers - 1, 0)
            this.layerRangeStart = 0
            this.showLayerRange = false
            this.loadingMessage = 'Building finish layers...'

            await this.$nextTick()
            await this.buildAllLayers(buildToken)

            if (buildToken !== this.activeBuildToken) return

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

    // --- Toolpath Visualization ---

    /**
     * Build Three.js line geometry for all layers.
     * Each feature type gets its own colored LineSegments object.
     */
    async buildAllLayers(buildToken: number = this.activeBuildToken) {
        if (!this.parsedGcode || !this.scene) return

        this.clearBuiltLayers()

        const top = this.parsedGcode.totalLayers - 1
        const initialStart = Math.max(0, top - this.initialFinishLayersCount + 1)
        const finishLayers: number[] = []
        for (let idx = top; idx >= initialStart; idx--) {
            finishLayers.push(idx)
        }

        this.enqueueLayersForBuild(finishLayers, true, buildToken)

        // Build at least the top-most finish layer before removing loading overlay
        await this.processLayerQueue(buildToken, 1)
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
        this.pendingLayerQueue = []
        this.builtSegmentsTotal = 0
        this.warnedSafetyCap = false
        this.isProcessingLayerQueue = false
    }

    private enqueueLayersForBuild(layerIndices: number[], highPriority = false, buildToken: number = this.activeBuildToken) {
        if (!this.parsedGcode) return
        const maxLayer = this.parsedGcode.totalLayers - 1

        const normalized = layerIndices
            .map((idx) => Math.max(0, Math.min(maxLayer, idx)))
            .filter((idx, pos, arr) => arr.indexOf(idx) === pos)
            .filter((idx) => !this.builtLayers.has(idx) && !this.pendingLayerQueue.includes(idx))

        if (!normalized.length) return

        if (highPriority) {
            this.pendingLayerQueue = [...normalized, ...this.pendingLayerQueue]
        } else {
            this.pendingLayerQueue.push(...normalized)
        }

        this.processLayerQueue(buildToken)
    }

    private async processLayerQueue(buildToken: number = this.activeBuildToken, stopAfterBuilt = Infinity) {
        if (this.isProcessingLayerQueue || !this.parsedGcode || !this.scene) return
        this.isProcessingLayerQueue = true

        let builtCount = 0
        try {
            while (this.pendingLayerQueue.length && buildToken === this.activeBuildToken && builtCount < stopAfterBuilt) {
                const layerIndex = this.pendingLayerQueue.shift()!
                if (this.builtLayers.has(layerIndex)) continue

                const built = this.buildSingleLayer(layerIndex)
                if (built) {
                    builtCount += 1
                }

                this.updateLayerVisibility()
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            }
        } finally {
            this.isProcessingLayerQueue = false
            if (this.pendingLayerQueue.length && buildToken === this.activeBuildToken) {
                this.processLayerQueue(buildToken)
            }
        }
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

        const segmentsByType = new Map<GcodeFeatureType, number[]>()
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
        const moveStride = Math.max(1, Math.ceil(layer.moves.length / this.maxLayerMovesForPreview))

        for (let moveIndex = 0; moveIndex < layer.moves.length; moveIndex += moveStride) {
            if (this.builtSegmentsTotal >= this.maxGlobalSegments) break

            const move = layer.moves[moveIndex]
            if (move.type === 'travel') {
                travelPositions.push(prevX, layer.z, prevY)
                travelPositions.push(move.x, layer.z, move.y)
            } else {
                const type = move.type as GcodeFeatureType
                if (!segmentsByType.has(type)) {
                    segmentsByType.set(type, [])
                }
                const positions = segmentsByType.get(type)!
                positions.push(prevX, layer.z, prevY)
                positions.push(move.x, layer.z, move.y)
            }

            this.builtSegmentsTotal += 1
            prevX = move.x
            prevY = move.y
        }

        for (const [type, positions] of segmentsByType) {
            if (!positions.length) continue

            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

            const material = new THREE.LineBasicMaterial({
                color: FEATURE_COLORS_HEX[type] ?? 0xffffff,
                linewidth: 1,
            })

            group.add(new THREE.LineSegments(geometry, material))
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
            })
            const travelLine = new THREE.LineSegments(travelGeo, travelMat)
            travelLine.visible = this.showTravel
            this.scene.add(travelLine)
            this.travelLines.set(layer.layerIndex, travelLine)
        }

        this.builtLayers.add(layer.layerIndex)
        return true
    }

    /**
     * Show/hide layers based on the current layer slider position.
     */
    updateLayerVisibility() {
        if (!this.parsedGcode || this.totalLayers <= 0) return

        const start = this.showLayerRange ? Math.max(0, this.layerRangeStart) : 0
        const end = Math.min(Math.max(0, this.currentLayer), this.totalLayers - 1)

        const neededLayers: number[] = []
        for (let idx = start; idx <= end; idx++) {
            neededLayers.push(idx)
        }
        // Build exactly what the slider/range needs, prioritizing current end layer first.
        const orderedNeededLayers = [...neededLayers].sort((a, b) => Math.abs(a - end) - Math.abs(b - end))
        this.enqueueLayersForBuild(orderedNeededLayers, true)

        for (const [idx, group] of this.layerMeshes) {
            group.visible = idx >= start && idx <= end
        }
        for (const [idx, line] of this.travelLines) {
            line.visible = this.showTravel && idx >= start && idx <= end
        }
        this.requestRender()
    }

    // --- Watchers ---

    onLayerChange() {
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
        // Feature colors are default; speed-based coloring would require rebuild
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
</style>
