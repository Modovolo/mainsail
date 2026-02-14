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
        <div v-if="parsedGcode" class="layer-slider-container">
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
        <div v-if="parsedGcode" class="preview-info">
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
import { parseGcode } from '@/util/gcode/parser'
import { FEATURE_COLORS, FEATURE_COLORS_HEX } from '@/util/gcode/types'
import type { ParsedGcode, GcodeFeatureType } from '@/util/gcode/types'
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
    private animFrameId = 0
    private buildPlate: THREE.Group | null = null

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
        this.initThree()
        this.animate()

        // Check if we have G-code from the store (passed from PreparePage slicing)
        const gcodeData = (this.$store.state.prepare as any)?.lastGcode
        if (gcodeData) {
            this.loadGcodeString(gcodeData)
        }

        window.addEventListener('resize', this.onResize)
    }

    beforeDestroy() {
        window.removeEventListener('resize', this.onResize)
        cancelAnimationFrame(this.animFrameId)
        this.renderer?.dispose()
        this.controls?.dispose()
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
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.1

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.4)
        directional.position.set(200, 300, 200)
        this.scene.add(directional)

        // Build plate (simple grid)
        this.buildBuildPlate()
    }

    buildBuildPlate() {
        if (!this.scene) return

        if (this.buildPlate) {
            this.scene.remove(this.buildPlate)
        }

        this.buildPlate = new THREE.Group()

        // Grid
        const gridSize = 220
        const gridDiv = 22
        const grid = new THREE.GridHelper(gridSize, gridDiv, 0x444466, 0x333355)
        this.buildPlate.add(grid)

        // Floor plane
        const floorGeo = new THREE.PlaneGeometry(gridSize, gridSize)
        const floorMat = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
        })
        const floor = new THREE.Mesh(floorGeo, floorMat)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = -0.01
        this.buildPlate.add(floor)

        this.scene.add(this.buildPlate)
    }

    animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate())
        this.controls?.update()
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera)
        }
    }

    onResize() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.renderer) return
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
    }

    resetCamera() {
        if (!this.camera || !this.controls) return
        this.camera.position.set(150, 150, 200)
        this.controls.target.set(110, 0, 110)
        this.controls.update()
    }

    fitView() {
        if (!this.parsedGcode || !this.camera || !this.controls) return
        const b = this.parsedGcode.bounds
        const cx = (b.xMin + b.xMax) / 2
        const cy = (b.zMin + b.zMax) / 2
        const cz = (b.yMin + b.yMax) / 2
        const size = Math.max(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin) || 100
        this.camera.position.set(cx + size, cy + size, cz + size)
        this.controls.target.set(cx, cy, cz)
        this.controls.update()
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

        // Parse in next tick to allow UI to update
        await this.$nextTick()

        try {
            const parsed = parseGcode(gcode, (progress) => {
                this.loadingMessage = `Parsing G-code... ${Math.round(progress)}%`
            })

            this.parsedGcode = parsed
            this.currentLayer = parsed.totalLayers - 1
            this.layerRangeStart = 0
            this.loadingMessage = 'Building visualization...'

            await this.$nextTick()
            this.buildAllLayers()
            this.updateLayerVisibility()
            this.fitView()
        } catch (error: any) {
            console.error('Failed to parse G-code:', error)
        } finally {
            this.isLoading = false
        }
    }

    // --- Toolpath Visualization ---

    /**
     * Build Three.js line geometry for all layers.
     * Each feature type gets its own colored LineSegments object.
     */
    buildAllLayers() {
        if (!this.parsedGcode || !this.scene) return

        // Clear existing meshes
        for (const [, group] of this.layerMeshes) {
            this.scene.remove(group)
        }
        this.layerMeshes.clear()
        for (const [, line] of this.travelLines) {
            this.scene.remove(line)
        }
        this.travelLines.clear()

        const layers = this.parsedGcode.layers

        for (const layer of layers) {
            const group = new THREE.Group()
            group.name = `layer-${layer.layerIndex}`

            // Collect segments by type
            const segmentsByType = new Map<GcodeFeatureType, number[]>()

            let prevX = 0
            let prevY = 0
            if (layer.layerIndex > 0 && layers[layer.layerIndex - 1]) {
                const prevLayer = layers[layer.layerIndex - 1]
                if (prevLayer.moves.length > 0) {
                    const lastMove = prevLayer.moves[prevLayer.moves.length - 1]
                    prevX = lastMove.x
                    prevY = lastMove.y
                }
            }

            const travelPositions: number[] = []

            for (const move of layer.moves) {
                if (move.type === 'travel') {
                    // Travel moves go to separate collection
                    travelPositions.push(prevX, layer.z, prevY)
                    travelPositions.push(move.x, layer.z, move.y)
                } else {
                    const type = move.type as GcodeFeatureType
                    if (!segmentsByType.has(type)) {
                        segmentsByType.set(type, [])
                    }
                    const positions = segmentsByType.get(type)!
                    // In Three.js: X=X, Y=Z(height), Z=Y(depth)
                    positions.push(prevX, layer.z, prevY)
                    positions.push(move.x, layer.z, move.y)
                }

                prevX = move.x
                prevY = move.y
            }

            // Create line objects for each feature type
            for (const [type, positions] of segmentsByType) {
                if (positions.length === 0) continue

                const geometry = new THREE.BufferGeometry()
                geometry.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(positions, 3)
                )

                const material = new THREE.LineBasicMaterial({
                    color: FEATURE_COLORS_HEX[type] ?? 0xffffff,
                    linewidth: 1,
                })

                const lineSegments = new THREE.LineSegments(geometry, material)
                group.add(lineSegments)
            }

            this.scene.add(group)
            this.layerMeshes.set(layer.layerIndex, group)

            // Travel lines (separate for toggle visibility)
            if (travelPositions.length > 0) {
                const travelGeo = new THREE.BufferGeometry()
                travelGeo.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(travelPositions, 3)
                )
                const travelMat = new THREE.LineBasicMaterial({
                    color: FEATURE_COLORS_HEX['travel'],
                    linewidth: 1,
                    transparent: true,
                    opacity: 0.3,
                })
                const travelLine = new THREE.LineSegments(travelGeo, travelMat)
                travelLine.visible = this.showTravel
                this.scene.add(travelLine)
                this.travelLines.set(layer.layerIndex, travelLine)
            }
        }
    }

    /**
     * Show/hide layers based on the current layer slider position.
     */
    updateLayerVisibility() {
        const start = this.showLayerRange ? this.layerRangeStart : 0
        const end = this.currentLayer

        for (const [idx, group] of this.layerMeshes) {
            group.visible = idx >= start && idx <= end
        }
        for (const [idx, line] of this.travelLines) {
            line.visible = this.showTravel && idx >= start && idx <= end
        }
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
