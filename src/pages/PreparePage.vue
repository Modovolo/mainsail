<template>
    <div class="prepare-page">
        <v-row no-gutters class="fill-height">
            <!-- Left Panel: 3D Preview -->
            <v-col cols="8" class="preview-column">
                <v-card class="fill-height d-flex flex-column" outlined>
                    <v-card-title class="py-2">
                        <v-icon left>{{ icons.mdiCube }}</v-icon>
                        3D Preview
                        <v-spacer />
                        <v-btn-toggle v-model="viewMode" mandatory dense>
                            <v-btn small value="solid">
                                <v-icon small>{{ icons.mdiCube }}</v-icon>
                            </v-btn>
                            <v-btn small value="wireframe">
                                <v-icon small>{{ icons.mdiVectorSquare }}</v-icon>
                            </v-btn>
                            <v-btn small value="xray">
                                <v-icon small>{{ icons.mdiRadioactive }}</v-icon>
                            </v-btn>
                        </v-btn-toggle>
                    </v-card-title>
                    
                    <v-card-text class="flex-grow-1 pa-0 position-relative">
                        <!-- Drop zone when no model loaded -->
                        <div
                            v-if="!modelLoaded"
                            class="drop-zone d-flex flex-column align-center justify-center"
                            :class="{ 'drag-over': isDragging }"
                            @dragover.prevent="isDragging = true"
                            @dragleave="isDragging = false"
                            @drop.prevent="handleFileDrop">
                            <v-icon size="80" color="grey">{{ icons.mdiCloudUpload }}</v-icon>
                            <div class="text-h6 mt-4">Drop STL, 3MF, or OBJ file here</div>
                            <div class="text-body-2 grey--text mt-2">or</div>
                            <v-btn color="primary" class="mt-4" @click="openFilePicker">
                                <v-icon left>{{ icons.mdiFolder }}</v-icon>
                                Browse Files
                            </v-btn>
                            <input
                                ref="fileInput"
                                type="file"
                                accept=".stl,.3mf,.obj"
                                style="display: none"
                                @change="handleFileSelect" />
                        </div>
                        
                        <!-- 3D Viewer Canvas -->
                        <div v-show="modelLoaded" ref="viewerContainer" class="viewer-container"></div>
                        
                        <!-- Model Loading Overlay -->
                        <v-overlay :value="isProcessing" absolute>
                            <v-progress-circular indeterminate size="64" />
                            <div class="mt-4">{{ processingMessage }}</div>
                        </v-overlay>
                    </v-card-text>
                    
                    <!-- Model Info Bar -->
                    <v-card-actions v-if="modelLoaded" class="model-info-bar">
                        <v-chip small class="mr-2">
                            <v-icon left small>{{ icons.mdiCubeOutline }}</v-icon>
                            {{ modelInfo.dimensions.x.toFixed(1) }} × 
                            {{ modelInfo.dimensions.y.toFixed(1) }} × 
                            {{ modelInfo.dimensions.z.toFixed(1) }} mm
                        </v-chip>
                        <v-chip small class="mr-2">
                            <v-icon left small>{{ icons.mdiTriangle }}</v-icon>
                            {{ formatNumber(modelInfo.triangle_count) }} triangles
                        </v-chip>
                        <v-chip v-if="modelInfo.volume" small class="mr-2">
                            <v-icon left small>{{ icons.mdiCubeUnfolded }}</v-icon>
                            {{ modelInfo.volume.toFixed(2) }} cm³
                        </v-chip>
                        <v-chip v-if="modelInfo.needs_repair" small color="warning" text-color="white">
                            <v-icon left small>{{ icons.mdiAlert }}</v-icon>
                            Needs Repair
                        </v-chip>
                        <v-spacer />
                        <v-btn text small color="error" @click="clearModel">
                            <v-icon left small>{{ icons.mdiClose }}</v-icon>
                            Clear
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
            
            <!-- Right Panel: Slicing Settings -->
            <v-col cols="4" class="settings-column">
                <v-card class="fill-height overflow-y-auto" outlined>
                    <v-card-title class="py-2">
                        <v-icon left>{{ icons.mdiTune }}</v-icon>
                        Slice Settings
                    </v-card-title>
                    
                    <v-card-text>
                        <!-- Quick Presets -->
                        <div class="mb-4">
                            <div class="text-subtitle-2 mb-2">Quality Preset</div>
                            <v-btn-toggle v-model="qualityPreset" mandatory color="primary" class="d-flex">
                                <v-btn small value="draft" class="flex-grow-1">Draft</v-btn>
                                <v-btn small value="normal" class="flex-grow-1">Normal</v-btn>
                                <v-btn small value="fine" class="flex-grow-1">Fine</v-btn>
                                <v-btn small value="ultra" class="flex-grow-1">Ultra</v-btn>
                            </v-btn-toggle>
                        </div>
                        
                        <v-divider class="mb-4" />
                        
                        <!-- Printer Selection -->
                        <v-select
                            v-model="selectedPrinter"
                            :items="printerProfiles"
                            item-text="name"
                            item-value="id"
                            label="Printer Profile"
                            outlined
                            dense
                            prepend-icon="mdi-printer-3d" />
                        
                        <!-- Collapsible Sections -->
                        <v-expansion-panels v-model="openPanels" multiple flat>
                            <!-- Layer Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiLayers }}</v-icon>
                                    Layer Settings
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider
                                        v-model="sliceParams.layer_height"
                                        label="Layer Height"
                                        :min="0.05"
                                        :max="0.4"
                                        :step="0.01"
                                        thumb-label="always"
                                        :thumb-size="24"
                                        suffix="mm" />
                                    
                                    <v-slider
                                        v-model="sliceParams.first_layer_height"
                                        label="First Layer"
                                        :min="0.1"
                                        :max="0.5"
                                        :step="0.01"
                                        thumb-label="always"
                                        :thumb-size="24"
                                        suffix="mm" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Walls & Infill -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiGridLarge }}</v-icon>
                                    Walls & Infill
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider
                                        v-model="sliceParams.wall_count"
                                        label="Wall Count"
                                        :min="1"
                                        :max="10"
                                        :step="1"
                                        thumb-label />
                                    
                                    <v-slider
                                        v-model="sliceParams.infill_density"
                                        label="Infill Density"
                                        :min="0"
                                        :max="100"
                                        :step="5"
                                        thumb-label
                                        suffix="%" />
                                    
                                    <v-select
                                        v-model="sliceParams.infill_pattern"
                                        :items="infillPatterns"
                                        label="Infill Pattern"
                                        outlined
                                        dense />
                                    
                                    <v-slider
                                        v-model="sliceParams.top_layers"
                                        label="Top Layers"
                                        :min="1"
                                        :max="10"
                                        :step="1"
                                        thumb-label />
                                    
                                    <v-slider
                                        v-model="sliceParams.bottom_layers"
                                        label="Bottom Layers"
                                        :min="1"
                                        :max="10"
                                        :step="1"
                                        thumb-label />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Speed Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiSpeedometer }}</v-icon>
                                    Speed
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider
                                        v-model="sliceParams.print_speed"
                                        label="Print Speed"
                                        :min="20"
                                        :max="200"
                                        :step="5"
                                        thumb-label
                                        suffix="mm/s" />
                                    
                                    <v-slider
                                        v-model="sliceParams.travel_speed"
                                        label="Travel Speed"
                                        :min="50"
                                        :max="300"
                                        :step="10"
                                        thumb-label
                                        suffix="mm/s" />
                                    
                                    <v-slider
                                        v-model="sliceParams.first_layer_speed"
                                        label="First Layer Speed"
                                        :min="10"
                                        :max="50"
                                        :step="5"
                                        thumb-label
                                        suffix="mm/s" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Temperature -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiThermometer }}</v-icon>
                                    Temperature
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider
                                        v-model="sliceParams.nozzle_temp"
                                        label="Nozzle Temp"
                                        :min="170"
                                        :max="300"
                                        :step="5"
                                        thumb-label
                                        suffix="°C" />
                                    
                                    <v-slider
                                        v-model="sliceParams.bed_temp"
                                        label="Bed Temp"
                                        :min="0"
                                        :max="120"
                                        :step="5"
                                        thumb-label
                                        suffix="°C" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Support Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiPillar }}</v-icon>
                                    Support
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-switch
                                        v-model="sliceParams.enable_support"
                                        label="Enable Support"
                                        dense />
                                    
                                    <template v-if="sliceParams.enable_support">
                                        <v-slider
                                            v-model="sliceParams.support_density"
                                            label="Support Density"
                                            :min="5"
                                            :max="50"
                                            :step="5"
                                            thumb-label
                                            suffix="%" />
                                        
                                        <v-select
                                            v-model="sliceParams.support_pattern"
                                            :items="supportPatterns"
                                            label="Support Pattern"
                                            outlined
                                            dense />
                                    </template>
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Advanced / Research -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiFlask }}</v-icon>
                                    Advanced (Research)
                                    <v-chip x-small color="warning" class="ml-2">BETA</v-chip>
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-switch
                                        v-model="sliceParams.enable_non_planar"
                                        label="Non-Planar Slicing"
                                        dense
                                        hint="Curve toolpaths to follow surface"
                                        persistent-hint />
                                    
                                    <v-slider
                                        v-if="sliceParams.enable_non_planar"
                                        v-model="sliceParams.max_slope_angle"
                                        label="Max Slope Angle"
                                        :min="15"
                                        :max="75"
                                        :step="5"
                                        thumb-label
                                        suffix="°"
                                        class="mt-4" />
                                    
                                    <v-divider class="my-3" />
                                    
                                    <v-switch
                                        v-model="sliceParams.enable_idex"
                                        label="IDEX Mode"
                                        dense
                                        hint="Dual extruder printing"
                                        persistent-hint />
                                    
                                    <v-select
                                        v-if="sliceParams.enable_idex"
                                        v-model="sliceParams.idex_mode"
                                        :items="idexModes"
                                        label="IDEX Mode"
                                        outlined
                                        dense
                                        class="mt-4" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                        </v-expansion-panels>
                    </v-card-text>
                    
                    <!-- Slice Button -->
                    <v-card-actions class="slice-actions pa-4">
                        <v-btn
                            block
                            x-large
                            color="primary"
                            :disabled="!modelLoaded || isSlicing"
                            :loading="isSlicing"
                            @click="startSlicing">
                            <v-icon left>{{ icons.mdiPrinter3dNozzle }}</v-icon>
                            Slice Model
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        
        <!-- Slicing Progress Dialog -->
        <v-dialog v-model="showSlicingDialog" persistent max-width="500">
            <v-card>
                <v-card-title>
                    <v-icon left>{{ icons.mdiPrinter3dNozzle }}</v-icon>
                    Slicing in Progress
                </v-card-title>
                <v-card-text>
                    <div class="text-center mb-4">{{ slicingMessage }}</div>
                    <v-progress-linear
                        :value="slicingProgress"
                        height="24"
                        striped>
                        <template #default>
                            <strong>{{ Math.round(slicingProgress) }}%</strong>
                        </template>
                    </v-progress-linear>
                </v-card-text>
            </v-card>
        </v-dialog>
        
        <!-- Slice Complete Dialog -->
        <v-dialog v-model="showResultDialog" max-width="600">
            <v-card v-if="sliceResult">
                <v-card-title class="success--text">
                    <v-icon left color="success">{{ icons.mdiCheckCircle }}</v-icon>
                    Slicing Complete
                </v-card-title>
                <v-card-text>
                    <v-row>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Layers</div>
                            <div class="text-h5">{{ sliceResult.layer_count }}</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Estimated Time</div>
                            <div class="text-h5">{{ sliceResult.estimated_time_formatted }}</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Filament</div>
                            <div class="text-h5">{{ sliceResult.filament_used_m }}m</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Weight</div>
                            <div class="text-h5">{{ sliceResult.filament_weight_g }}g</div>
                        </v-col>
                    </v-row>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showResultDialog = false">Close</v-btn>
                    <v-btn color="primary" @click="previewGcode">
                        <v-icon left>{{ icons.mdiEye }}</v-icon>
                        Preview
                    </v-btn>
                    <v-btn color="success" @click="downloadGcode">
                        <v-icon left>{{ icons.mdiDownload }}</v-icon>
                        Download G-code
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import {
    mdiCube,
    mdiCubeOutline,
    mdiCubeUnfolded,
    mdiVectorSquare,
    mdiRadioactive,
    mdiCloudUpload,
    mdiFolder,
    mdiTriangle,
    mdiAlert,
    mdiClose,
    mdiTune,
    mdiLayers,
    mdiGridLarge,
    mdiSpeedometer,
    mdiThermometer,
    mdiPillar,
    mdiFlask,
    mdiPrinter3dNozzle,
    mdiCheckCircle,
    mdiEye,
    mdiDownload,
} from '@mdi/js'

interface SliceParams {
    layer_height: number
    first_layer_height: number
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
    support_pattern: string
    enable_non_planar: boolean
    max_slope_angle: number
    enable_idex: boolean
    idex_mode: string
}

interface ModelInfo {
    dimensions: { x: number; y: number; z: number }
    triangle_count: number
    vertex_count: number
    volume: number | null
    is_watertight: boolean
    needs_repair: boolean
}

interface SliceResult {
    layer_count: number
    filament_used_m: number
    filament_weight_g: number
    estimated_time_formatted: string
}

@Component({
    components: {},
})
export default class PreparePage extends Mixins(BaseMixin) {
    // Icons
    icons = {
        mdiCube,
        mdiCubeOutline,
        mdiCubeUnfolded,
        mdiVectorSquare,
        mdiRadioactive,
        mdiCloudUpload,
        mdiFolder,
        mdiTriangle,
        mdiAlert,
        mdiClose,
        mdiTune,
        mdiLayers,
        mdiGridLarge,
        mdiSpeedometer,
        mdiThermometer,
        mdiPillar,
        mdiFlask,
        mdiPrinter3dNozzle,
        mdiCheckCircle,
        mdiEye,
        mdiDownload,
    }
    
    // View state
    viewMode = 'solid'
    isDragging = false
    modelLoaded = false
    isProcessing = false
    processingMessage = ''
    isSlicing = false
    showSlicingDialog = false
    showResultDialog = false
    slicingProgress = 0
    slicingMessage = ''
    openPanels: number[] = [0, 1]
    
    // Model data
    uploadId = ''
    modelInfo: ModelInfo = {
        dimensions: { x: 0, y: 0, z: 0 },
        triangle_count: 0,
        vertex_count: 0,
        volume: null,
        is_watertight: true,
        needs_repair: false,
    }
    sliceResult: SliceResult | null = null
    jobId = ''
    
    // Three.js
    scene: THREE.Scene | null = null
    camera: THREE.PerspectiveCamera | null = null
    renderer: THREE.WebGLRenderer | null = null
    controls: OrbitControls | null = null
    modelMesh: THREE.Mesh | null = null
    gridHelper: THREE.GridHelper | null = null
    
    // Slicing parameters
    qualityPreset = 'normal'
    selectedPrinter = 'generic'
    
    sliceParams: SliceParams = {
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
    
    // Options
    infillPatterns = [
        { text: 'Grid', value: 'grid' },
        { text: 'Lines', value: 'lines' },
        { text: 'Triangles', value: 'triangles' },
        { text: 'Gyroid', value: 'gyroid' },
        { text: 'Honeycomb', value: 'honeycomb' },
    ]
    
    supportPatterns = [
        { text: 'Grid', value: 'grid' },
        { text: 'Lines', value: 'lines' },
        { text: 'ZigZag', value: 'zigzag' },
    ]
    
    idexModes = [
        { text: 'Normal', value: 'normal' },
        { text: 'Mirror', value: 'mirror' },
        { text: 'Duplicate', value: 'duplicate' },
    ]
    
    printerProfiles = [
        { id: 'generic', name: 'Generic Printer (220×220×250)' },
        { id: 'prusa-mk4', name: 'Prusa MK4 (250×210×220)' },
        { id: 'voron-2.4', name: 'Voron 2.4 (350×350×350)' },
        { id: 'bambu-x1', name: 'Bambu X1 Carbon (256×256×256)' },
    ]
    
    // Slicer service URL
    get slicerServiceUrl(): string {
        // Use environment variable or default
        return process.env.VUE_APP_SLICER_URL || 'http://localhost:8090'
    }
    
    mounted() {
        this.initThreeJS()
        window.addEventListener('resize', this.onWindowResize)
    }
    
    beforeDestroy() {
        window.removeEventListener('resize', this.onWindowResize)
        this.disposeThreeJS()
    }
    
    @Watch('qualityPreset')
    onQualityPresetChange(preset: string) {
        const presets: Record<string, Partial<SliceParams>> = {
            draft: { layer_height: 0.3, infill_density: 10, print_speed: 80 },
            normal: { layer_height: 0.2, infill_density: 20, print_speed: 60 },
            fine: { layer_height: 0.12, infill_density: 20, print_speed: 45 },
            ultra: { layer_height: 0.08, infill_density: 25, print_speed: 30 },
        }
        
        if (presets[preset]) {
            Object.assign(this.sliceParams, presets[preset])
        }
    }
    
    @Watch('viewMode')
    onViewModeChange(mode: string) {
        if (!this.modelMesh) return
        
        const material = this.modelMesh.material as THREE.MeshStandardMaterial
        
        switch (mode) {
            case 'solid':
                material.wireframe = false
                material.opacity = 1
                material.transparent = false
                break
            case 'wireframe':
                material.wireframe = true
                material.opacity = 1
                material.transparent = false
                break
            case 'xray':
                material.wireframe = false
                material.opacity = 0.5
                material.transparent = true
                break
        }
    }
    
    initThreeJS() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container) return
        
        // Scene
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x1a1a2e)
        
        // Camera
        const aspect = container.clientWidth / container.clientHeight
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000)
        this.camera.position.set(200, 200, 200)
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        container.appendChild(this.renderer.domElement)
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
        this.scene.add(ambientLight)
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(1, 1, 1)
        this.scene.add(directionalLight)
        
        const backLight = new THREE.DirectionalLight(0xffffff, 0.3)
        backLight.position.set(-1, -1, -1)
        this.scene.add(backLight)
        
        // Grid helper (build plate)
        this.gridHelper = new THREE.GridHelper(220, 22, 0x444444, 0x333333)
        this.scene.add(this.gridHelper)
        
        // Build plate outline
        const plateGeometry = new THREE.PlaneGeometry(220, 220)
        const plateMaterial = new THREE.MeshBasicMaterial({
            color: 0x2a2a4a,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
        })
        const plateMesh = new THREE.Mesh(plateGeometry, plateMaterial)
        plateMesh.rotation.x = -Math.PI / 2
        plateMesh.position.y = -0.1
        this.scene.add(plateMesh)
        
        // Animation loop
        this.animate()
    }
    
    animate() {
        if (!this.renderer || !this.scene || !this.camera || !this.controls) return
        
        requestAnimationFrame(() => this.animate())
        this.controls.update()
        this.renderer.render(this.scene, this.camera)
    }
    
    onWindowResize() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.renderer) return
        
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
    }
    
    disposeThreeJS() {
        if (this.renderer) {
            this.renderer.dispose()
        }
        if (this.modelMesh) {
            this.modelMesh.geometry.dispose()
            ;(this.modelMesh.material as THREE.Material).dispose()
        }
    }
    
    openFilePicker() {
        const input = this.$refs.fileInput as HTMLInputElement
        input?.click()
    }
    
    handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement
        if (input.files && input.files.length > 0) {
            this.loadModelFile(input.files[0])
        }
    }
    
    handleFileDrop(event: DragEvent) {
        this.isDragging = false
        
        if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
            this.loadModelFile(event.dataTransfer.files[0])
        }
    }
    
    async loadModelFile(file: File) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        const allowedExts = ['.stl', '.3mf', '.obj']
        
        if (!allowedExts.includes(ext)) {
            this.$toast?.error?.(`Unsupported file type: ${ext}`)
            return
        }
        
        this.isProcessing = true
        this.processingMessage = 'Loading model...'
        
        try {
            // For STL, we can load directly in browser using Three.js
            if (ext === '.stl') {
                await this.loadSTLLocally(file)
            } else {
                // For other formats, upload to slicer service
                await this.uploadToSlicerService(file)
            }
            
            this.modelLoaded = true
        } catch (error) {
            console.error('Failed to load model:', error)
            this.$toast?.error?.('Failed to load model')
        } finally {
            this.isProcessing = false
        }
    }
    
    async loadSTLLocally(file: File) {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader()
            
            reader.onload = (event) => {
                try {
                    const loader = new STLLoader()
                    const geometry = loader.parse(event.target?.result as ArrayBuffer)
                    
                    // Center geometry
                    geometry.computeBoundingBox()
                    const center = new THREE.Vector3()
                    geometry.boundingBox?.getCenter(center)
                    geometry.translate(-center.x, -center.y, -center.z)
                    
                    // Position on build plate
                    geometry.computeBoundingBox()
                    const minY = geometry.boundingBox?.min.y || 0
                    geometry.translate(0, -minY, 0)
                    
                    // Create mesh
                    const material = new THREE.MeshStandardMaterial({
                        color: 0x4fc3f7,
                        metalness: 0.2,
                        roughness: 0.5,
                    })
                    
                    // Remove old model
                    if (this.modelMesh && this.scene) {
                        this.scene.remove(this.modelMesh)
                        this.modelMesh.geometry.dispose()
                    }
                    
                    this.modelMesh = new THREE.Mesh(geometry, material)
                    this.scene?.add(this.modelMesh)
                    
                    // Update model info
                    geometry.computeBoundingBox()
                    const box = geometry.boundingBox!
                    const size = new THREE.Vector3()
                    box.getSize(size)
                    
                    this.modelInfo = {
                        dimensions: { x: size.x, y: size.z, z: size.y },
                        triangle_count: geometry.attributes.position.count / 3,
                        vertex_count: geometry.attributes.position.count,
                        volume: null, // Would need proper calculation
                        is_watertight: true,
                        needs_repair: false,
                    }
                    
                    // Fit camera to model
                    this.fitCameraToModel()
                    
                    resolve()
                } catch (error) {
                    reject(error)
                }
            }
            
            reader.onerror = () => reject(reader.error)
            reader.readAsArrayBuffer(file)
        })
    }
    
    async uploadToSlicerService(file: File) {
        const formData = new FormData()
        formData.append('file', file)
        
        const response = await fetch(`${this.slicerServiceUrl}/api/upload`, {
            method: 'POST',
            body: formData,
        })
        
        if (!response.ok) {
            throw new Error('Failed to upload to slicer service')
        }
        
        const data = await response.json()
        this.uploadId = data.upload_id
        this.modelInfo = data.analysis
        
        // Load preview mesh
        if (data.preview) {
            this.loadPreviewMesh(data.preview)
        }
    }
    
    loadPreviewMesh(preview: { vertices: number[]; faces: number[]; normals: number[] }) {
        const geometry = new THREE.BufferGeometry()
        
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(preview.vertices, 3)
        )
        geometry.setIndex(preview.faces)
        
        if (preview.normals && preview.normals.length > 0) {
            geometry.setAttribute(
                'normal',
                new THREE.Float32BufferAttribute(preview.normals, 3)
            )
        } else {
            geometry.computeVertexNormals()
        }
        
        const material = new THREE.MeshStandardMaterial({
            color: 0x4fc3f7,
            metalness: 0.2,
            roughness: 0.5,
        })
        
        if (this.modelMesh && this.scene) {
            this.scene.remove(this.modelMesh)
            this.modelMesh.geometry.dispose()
        }
        
        this.modelMesh = new THREE.Mesh(geometry, material)
        this.scene?.add(this.modelMesh)
        
        this.fitCameraToModel()
    }
    
    fitCameraToModel() {
        if (!this.modelMesh || !this.camera || !this.controls) return
        
        const box = new THREE.Box3().setFromObject(this.modelMesh)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        
        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = this.camera.fov * (Math.PI / 180)
        const cameraDistance = maxDim / (2 * Math.tan(fov / 2)) * 1.5
        
        this.camera.position.set(
            center.x + cameraDistance,
            center.y + cameraDistance * 0.7,
            center.z + cameraDistance
        )
        
        this.controls.target.copy(center)
        this.controls.update()
    }
    
    clearModel() {
        if (this.modelMesh && this.scene) {
            this.scene.remove(this.modelMesh)
            this.modelMesh.geometry.dispose()
            ;(this.modelMesh.material as THREE.Material).dispose()
            this.modelMesh = null
        }
        
        this.modelLoaded = false
        this.uploadId = ''
        this.modelInfo = {
            dimensions: { x: 0, y: 0, z: 0 },
            triangle_count: 0,
            vertex_count: 0,
            volume: null,
            is_watertight: true,
            needs_repair: false,
        }
    }
    
    async startSlicing() {
        if (!this.modelLoaded) return
        
        this.isSlicing = true
        this.showSlicingDialog = true
        this.slicingProgress = 0
        this.slicingMessage = 'Starting slicing process...'
        
        try {
            // If we have a local STL, we need to upload it first
            if (!this.uploadId && this.modelMesh) {
                // For now, simulate local slicing
                await this.simulateLocalSlicing()
                return
            }
            
            // Start slicing job on slicer service
            const response = await fetch(`${this.slicerServiceUrl}/api/slice/${this.uploadId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    params: this.sliceParams,
                    printer: this.getPrinterProfile(),
                }),
            })
            
            if (!response.ok) {
                throw new Error('Failed to start slicing')
            }
            
            const data = await response.json()
            this.jobId = data.job_id
            
            // Poll for progress
            await this.pollSlicingProgress()
            
        } catch (error) {
            console.error('Slicing failed:', error)
            this.$toast?.error?.('Slicing failed')
        } finally {
            this.isSlicing = false
            this.showSlicingDialog = false
        }
    }
    
    async pollSlicingProgress() {
        while (true) {
            const response = await fetch(`${this.slicerServiceUrl}/api/job/${this.jobId}`)
            const job = await response.json()
            
            this.slicingProgress = job.progress
            this.slicingMessage = job.message
            
            if (job.status === 'completed') {
                this.sliceResult = job.stats
                this.showSlicingDialog = false
                this.showResultDialog = true
                break
            }
            
            if (job.status === 'failed') {
                throw new Error(job.message)
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
    
    async simulateLocalSlicing() {
        // Simulate slicing progress for local STL files
        for (let progress = 0; progress <= 100; progress += 5) {
            this.slicingProgress = progress
            
            if (progress < 20) {
                this.slicingMessage = 'Analyzing mesh...'
            } else if (progress < 60) {
                this.slicingMessage = `Generating layer slices (${Math.round(progress * 2)}%)...`
            } else if (progress < 90) {
                this.slicingMessage = 'Generating toolpaths...'
            } else {
                this.slicingMessage = 'Creating G-code...'
            }
            
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Simulated result based on model size
        const volume = this.modelInfo.dimensions.x * 
                       this.modelInfo.dimensions.y * 
                       this.modelInfo.dimensions.z / 1000
        
        this.sliceResult = {
            layer_count: Math.round(this.modelInfo.dimensions.z / this.sliceParams.layer_height),
            filament_used_m: Math.round(volume * 0.05 * 100) / 100,
            filament_weight_g: Math.round(volume * 0.06 * 10) / 10,
            estimated_time_formatted: this.formatTime(volume * 2),
        }
        
        this.showSlicingDialog = false
        this.showResultDialog = true
    }
    
    getPrinterProfile() {
        const profiles: Record<string, any> = {
            'generic': { name: 'Generic', bed_size_x: 220, bed_size_y: 220, bed_size_z: 250, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'prusa-mk4': { name: 'Prusa MK4', bed_size_x: 250, bed_size_y: 210, bed_size_z: 220, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'voron-2.4': { name: 'Voron 2.4', bed_size_x: 350, bed_size_y: 350, bed_size_z: 350, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'bambu-x1': { name: 'Bambu X1', bed_size_x: 256, bed_size_y: 256, bed_size_z: 256, nozzle_diameter: 0.4, filament_diameter: 1.75 },
        }
        
        return profiles[this.selectedPrinter] || profiles['generic']
    }
    
    formatTime(minutes: number): string {
        const hours = Math.floor(minutes / 60)
        const mins = Math.round(minutes % 60)
        
        if (hours > 0) {
            return `${hours}h ${mins}m`
        }
        return `${mins}m`
    }
    
    formatNumber(num: number): string {
        return num.toLocaleString()
    }
    
    previewGcode() {
        this.showResultDialog = false
        // Navigate to preview page
        this.$router.push({
            path: '/preview',
            query: { jobId: this.jobId },
        })
    }
    
    async downloadGcode() {
        if (!this.jobId) {
            // For local slicing, generate a demo G-code
            const gcode = this.generateDemoGcode()
            this.downloadFile('model.gcode', gcode)
            return
        }
        
        try {
            const response = await fetch(`${this.slicerServiceUrl}/api/job/${this.jobId}/gcode`)
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            
            const a = document.createElement('a')
            a.href = url
            a.download = 'model.gcode'
            a.click()
            
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Failed to download G-code:', error)
            this.$toast?.error?.('Failed to download G-code')
        }
    }
    
    generateDemoGcode(): string {
        // Generate minimal demo G-code
        return `; Generated by Mainsail Slicer
; Layer height: ${this.sliceParams.layer_height}mm
;
G28 ; Home
M104 S${this.sliceParams.nozzle_temp}
M140 S${this.sliceParams.bed_temp}
M109 S${this.sliceParams.nozzle_temp}
M190 S${this.sliceParams.bed_temp}
G1 Z5 F3000
; Ready to print
M104 S0
M140 S0
M84
; End
`
    }
    
    downloadFile(filename: string, content: string) {
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        
        URL.revokeObjectURL(url)
    }
}
</script>

<style scoped>
.prepare-page {
    height: 100%;
    width: 100%;
    padding: 8px;
}

.preview-column {
    padding-right: 4px;
}

.settings-column {
    padding-left: 4px;
}

.drop-zone {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 3px dashed #444;
    border-radius: 8px;
    margin: 16px;
    transition: all 0.2s;
}

.drop-zone.drag-over {
    border-color: var(--v-primary-base);
    background: rgba(var(--v-primary-base), 0.1);
}

.viewer-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}

.model-info-bar {
    background: rgba(0, 0, 0, 0.3);
    flex-wrap: wrap;
}

.position-relative {
    position: relative;
}

.slice-actions {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.v-expansion-panel-header) {
    min-height: 40px;
    padding: 8px 16px;
}

:deep(.v-expansion-panel-content__wrap) {
    padding: 8px 16px 16px;
}
</style>
