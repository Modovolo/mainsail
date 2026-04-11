<template>
    <div class="composer-page">
        <!-- 3D Viewer -->
        <div class="viewer-area">
            <div ref="viewerContainer" class="viewer-container"></div>

            <!-- Item count badge -->
            <div v-if="plateItems.length" class="model-info-bar">
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>mdi-cube-outline</v-icon>
                    {{ plateItems.length }} part{{ plateItems.length !== 1 ? 's' : '' }}
                </v-chip>
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>mdi-clock-outline</v-icon>
                    {{ totalTimeFormatted }}
                </v-chip>
                <v-chip small outlined>
                    <v-icon left small>mdi-percent</v-icon>
                    {{ bedUtilization }}% bed
                </v-chip>
            </div>

            <!-- Empty state -->
            <div v-if="!plateItems.length && !loading" class="empty-hint">
                <v-icon size="48" color="grey darken-1">mdi-grid-large</v-icon>
                <div class="text-body-1 grey--text mt-2">Add G-code recipes from the panel</div>
                <div class="text-caption grey--text mt-1">Drag to reposition parts on the build plate</div>
            </div>

            <!-- Processing overlay -->
            <v-overlay :value="stitching" absolute>
                <v-progress-circular indeterminate size="64" />
                <div class="mt-4">{{ stitchingMessage }}</div>
            </v-overlay>
        </div>

        <!-- Left Panel: Recipe Browser -->
        <div class="left-panel">
            <v-card flat class="fill-height d-flex flex-column">
                <v-card-title class="py-2 text-subtitle-2">
                    <v-icon small class="mr-1">mdi-source-branch</v-icon>
                    G-Code Recipes
                </v-card-title>
                <v-divider />
                <div class="flex-grow-1 overflow-y-auto pa-2">
                    <v-treeview
                        :items="recipeTreeItems"
                        item-key="id"
                        item-text="name"
                        open-on-click
                        activatable
                        dense
                        hoverable
                        :open.sync="recipeOpen"
                        :active.sync="recipeActive"
                    >
                        <template #prepend="{ item }">
                            <v-icon small :color="item.nodeType === 'gcode' ? 'success' : 'primary'">
                                {{ item.nodeType === 'gcode' ? 'mdi-file-document' : 'mdi-package-variant' }}
                            </v-icon>
                        </template>
                        <template #append="{ item }">
                            <v-btn
                                v-if="item.nodeType === 'gcode' && item.fileId"
                                icon
                                x-small
                                color="primary"
                                :loading="loadingFileId === item.fileId"
                                @click.stop="addRecipeToBed(item)"
                            >
                                <v-icon x-small>mdi-plus</v-icon>
                            </v-btn>
                        </template>
                    </v-treeview>
                    <div v-if="!recipes.length" class="text-body-2 grey--text pa-2">
                        No recipes found. Add G-code files to recipes in Central Files first.
                    </div>
                </div>
            </v-card>
        </div>

        <!-- Right Panel: Build Plate Items & Controls -->
        <div class="right-panel">
            <v-card flat class="fill-height d-flex flex-column">
                <v-card-title class="py-2 text-subtitle-2">
                    <v-icon small class="mr-1">mdi-format-list-numbered</v-icon>
                    Print Sequence
                </v-card-title>
                <v-divider />

                <!-- Item List -->
                <div class="flex-grow-1 overflow-y-auto">
                    <v-list dense class="py-0">
                        <v-list-item
                            v-for="(item, index) in sortedPlateItems"
                            :key="item.id"
                            :class="{ 'primary lighten-5': selectedItemId === item.id }"
                            @click="selectItem(item.id)"
                        >
                            <v-list-item-icon class="mr-2 my-auto">
                                <span class="text-body-2 font-weight-bold">{{ index + 1 }}</span>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title class="text-body-2">{{ item.fileName }}</v-list-item-title>
                                <v-list-item-subtitle class="text-caption">
                                    {{ item.footprint.width.toFixed(0) }}×{{ item.footprint.depth.toFixed(0) }}×{{ item.footprint.height.toFixed(0) }}mm
                                    · {{ formatTime(item.footprint.estimatedTimeS) }}
                                </v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action class="flex-row my-auto" style="min-width: auto">
                                <v-btn icon x-small :disabled="index === 0" @click.stop="moveItemUp(item.id)">
                                    <v-icon x-small>mdi-chevron-up</v-icon>
                                </v-btn>
                                <v-btn icon x-small :disabled="index === sortedPlateItems.length - 1" @click.stop="moveItemDown(item.id)">
                                    <v-icon x-small>mdi-chevron-down</v-icon>
                                </v-btn>
                                <v-btn icon x-small color="error" @click.stop="removeItem(item.id)">
                                    <v-icon x-small>mdi-close</v-icon>
                                </v-btn>
                            </v-list-item-action>
                        </v-list-item>
                    </v-list>

                    <div v-if="!plateItems.length" class="text-center pa-4">
                        <div class="text-caption grey--text">No parts on the build plate</div>
                    </div>
                </div>

                <v-divider />

                <!-- Validation Status -->
                <div v-if="validationResult" class="pa-2">
                    <v-alert
                        v-if="validationResult.valid"
                        type="success"
                        dense
                        outlined
                        class="mb-2 text-caption"
                    >
                        Arrangement is valid for sequential printing
                    </v-alert>
                    <v-alert
                        v-for="(error, ei) in validationResult.errors"
                        :key="'err-' + ei"
                        type="error"
                        dense
                        outlined
                        class="mb-1 text-caption"
                    >
                        {{ error.message }}
                    </v-alert>
                    <v-alert
                        v-for="(warn, wi) in validationResult.warnings"
                        :key="'warn-' + wi"
                        type="warning"
                        dense
                        outlined
                        class="mb-1 text-caption"
                    >
                        {{ warn.message }}
                    </v-alert>
                </div>

                <!-- Action Buttons -->
                <div class="pa-2">
                    <v-btn
                        color="secondary"
                        small
                        block
                        outlined
                        :disabled="plateItems.length < 2"
                        class="mb-1"
                        @click="handleAutoArrange"
                    >
                        <v-icon left small>mdi-view-grid</v-icon>
                        Auto Arrange
                    </v-btn>
                    <v-btn
                        color="info"
                        small
                        block
                        outlined
                        :disabled="plateItems.length < 2"
                        class="mb-1"
                        @click="handleSuggestOrder"
                    >
                        <v-icon left small>mdi-sort-ascending</v-icon>
                        Suggest Print Order
                    </v-btn>
                    <v-btn
                        small
                        block
                        outlined
                        :disabled="!plateItems.length"
                        class="mb-1"
                        @click="handleValidate"
                    >
                        <v-icon left small>mdi-check-circle-outline</v-icon>
                        Validate
                    </v-btn>
                    <v-btn
                        color="primary"
                        small
                        block
                        :disabled="!canGenerate"
                        :loading="stitching"
                        @click="handleGenerate"
                    >
                        <v-icon left small>mdi-auto-fix</v-icon>
                        Generate &amp; Send
                    </v-btn>
                </div>
            </v-card>
        </div>

        <!-- Printer Selection -->
        <div class="top-bar">
            <v-menu offset-y bottom max-width="350">
                <template #activator="{ on, attrs }">
                    <v-btn text class="printer-selector" v-bind="attrs" v-on="on">
                        <v-icon left>mdi-printer-3d</v-icon>
                        {{ currentPrinterName }}
                        <v-icon right small>mdi-chevron-down</v-icon>
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item
                        v-for="profile in printerProfiles"
                        :key="profile.id"
                        @click="selectPrinterProfile(profile.id)"
                    >
                        <v-list-item-title>{{ profile.name }}</v-list-item-title>
                        <v-list-item-subtitle>
                            {{ profile.buildVolume.x }}×{{ profile.buildVolume.y }}×{{ profile.buildVolume.z }}mm
                        </v-list-item-subtitle>
                    </v-list-item>
                </v-list>
            </v-menu>
        </div>

        <!-- Send to Printer Dialog -->
        <v-dialog v-model="sendDialog" max-width="500">
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-send</v-icon>
                    Send Composed Job
                </v-card-title>
                <v-card-text class="pa-6">
                    <div class="mb-4">
                        <strong>Parts:</strong> {{ plateItems.length }} sequential parts<br>
                        <strong>Estimated time:</strong> {{ totalTimeFormatted }}
                    </div>
                    <v-select
                        v-model="selectedPrinterId"
                        :items="availablePrinters"
                        item-text="name"
                        item-value="printerId"
                        label="Select Printer"
                        outlined
                        prepend-icon="mdi-printer-3d"
                    ></v-select>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="sendDialog = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!selectedPrinterId"
                        :loading="sending"
                        @click="sendToPrinter"
                    >
                        <v-icon left>mdi-send</v-icon>
                        Send
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Snackbar -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
            {{ snackbarText }}
            <template #action="{ attrs }">
                <v-btn text v-bind="attrs" @click="snackbar = false">Close</v-btn>
            </template>
        </v-snackbar>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import type { PrinterProfile } from '@/store/prepare/types'
import { parseGcode } from '@/util/gcode/parser'
import type { GcodeFootprint, BuildPlateItem } from '@/util/gcode/footprint'
import { extractFootprint, getRotatedDimensions } from '@/util/gcode/footprint'
import {
    autoArrange,
    validateArrangement,
    suggestPrintOrder,
    type SequentialPrintConfig,
    type ValidationResult,
} from '@/util/gcode/arrangement'
import { stitchGcodes, type StitchPart } from '@/util/gcode/stitcher'

interface RecipeNode {
    id: number
    name: string
    children: RecipeNode[]
    nodeType?: 'item' | 'gcode'
    fileId?: string
}

interface RecipeTreeItem {
    id: number
    name: string
    children?: RecipeTreeItem[]
    nodeType?: 'item' | 'gcode'
    fileId?: string
}

interface PrinterOption {
    printerId: string
    name: string
}

/**
 * Color palette for build plate items (up to 12 unique colors).
 */
const ITEM_COLORS = [
    0x4488ff, 0xff6644, 0x44cc66, 0xffaa22,
    0xcc44cc, 0x22cccc, 0xff4488, 0x88aa44,
    0x6644ff, 0xff8844, 0x44aaff, 0xaacc44,
]

let nextItemIdx = 0

@Component
export default class BuildPlateComposer extends Mixins(BaseMixin) {
    // Three.js state
    scene: THREE.Scene | null = null
    camera: THREE.PerspectiveCamera | null = null
    renderer: THREE.WebGLRenderer | null = null
    controls: OrbitControls | null = null
    animFrame = 0

    // Drag state
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()
    dragPlatformPlane: THREE.Mesh | null = null
    dragging: BuildPlateItem | null = null
    dragOffset = new THREE.Vector3()

    // Data
    plateItems: BuildPlateItem[] = []
    itemMeshes = new Map<string, THREE.Mesh>()
    selectedItemId: string | null = null
    loading = false
    loadingFileId: string | null = null

    // Recipes
    recipes: RecipeNode[] = []
    recipeOpen: Array<number | string> = []
    recipeActive: Array<number | string> = []

    // Validation
    validationResult: ValidationResult | null = null

    // Stitching
    stitching = false
    stitchingMessage = ''
    generatedGcode = ''

    // Send dialog
    sendDialog = false
    selectedPrinterId: string | null = null
    availablePrinters: PrinterOption[] = []
    sending = false

    // Active printer profile
    activePrinterId = 'generic'

    // Snackbar
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    // --- Computed ---

    get printerProfiles(): PrinterProfile[] {
        return this.$store?.state?.prepare?.printerProfiles ?? []
    }

    get currentProfile(): PrinterProfile {
        const profiles = this.printerProfiles
        const found = profiles.find((p) => p.id === this.activePrinterId)
        return found ?? {
            id: 'generic',
            name: 'Generic 220×220',
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
            gantryHeight: 40,
            printheadBoundsX: [30, 30],
            printheadBoundsY: [30, 30],
        }
    }

    get currentPrinterName(): string {
        return this.currentProfile.name
    }

    get sequentialConfig(): SequentialPrintConfig {
        const p = this.currentProfile
        return {
            bedWidth: p.buildVolume.x,
            bedDepth: p.buildVolume.y,
            gantryHeight: p.gantryHeight ?? 40,
            printheadBoundsX: p.printheadBoundsX ?? [30, 30],
            printheadBoundsY: p.printheadBoundsY ?? [30, 30],
            gap: 5,
        }
    }

    get sortedPlateItems(): BuildPlateItem[] {
        return [...this.plateItems].sort((a, b) => a.printOrder - b.printOrder)
    }

    get totalTimeFormatted(): string {
        const totalS = this.plateItems.reduce((sum, item) => sum + item.footprint.estimatedTimeS, 0)
        const hours = Math.floor(totalS / 3600)
        const mins = Math.floor((totalS % 3600) / 60)
        if (hours > 0) return `${hours}h ${mins}m`
        return `${mins}m`
    }

    get bedUtilization(): number {
        if (!this.plateItems.length) return 0
        const p = this.currentProfile
        const bedArea = p.buildVolume.x * p.buildVolume.y
        const partArea = this.plateItems.reduce((sum, item) => {
            const dims = getRotatedDimensions(item.footprint, item.rotation)
            return sum + dims.width * dims.depth
        }, 0)
        return Math.min(100, Math.round((partArea / bedArea) * 100))
    }

    get canGenerate(): boolean {
        if (this.plateItems.length === 0) return false
        if (this.stitching) return false
        // Allow generation even without validation — user takes responsibility
        return true
    }

    get recipeTreeItems(): RecipeTreeItem[] {
        return this.buildTreeItems(this.recipes)
    }

    // --- Lifecycle ---

    mounted() {
        this.loadRecipes()
        this.loadPrinters()
        this.$nextTick(() => {
            this.initThreeJS()
        })
        window.addEventListener('resize', this.onWindowResize)
    }

    beforeDestroy() {
        window.removeEventListener('resize', this.onWindowResize)
        cancelAnimationFrame(this.animFrame)
        if (this.renderer) {
            this.renderer.dispose()
        }
    }

    // --- Three.js Setup ---

    initThreeJS() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || container.clientWidth === 0) return

        const profile = this.currentProfile

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

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        container.appendChild(this.renderer.domElement)

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.1
        this.controls.addEventListener('change', () => this.requestRender())

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.8)
        directional.position.set(1, 2, 1)
        this.scene.add(directional)

        // Drag plane
        const dragGeo = new THREE.PlaneGeometry(10000, 10000)
        const dragMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        this.dragPlatformPlane = new THREE.Mesh(dragGeo, dragMat)
        this.dragPlatformPlane.rotation.x = -Math.PI / 2
        this.dragPlatformPlane.position.y = 0
        this.scene.add(this.dragPlatformPlane)

        // Build volume
        this.buildVolumeVisualization()

        // Camera position
        const bw = profile.buildVolume.x
        const bd = profile.buildVolume.y
        this.camera.position.set(bw / 2, Math.max(bw, bd) * 1.2, bd * 1.5)
        this.camera.lookAt(bw / 2, 0, bd / 2)
        this.controls.target.set(bw / 2, 0, bd / 2)

        // Mouse event handlers
        const canvas = this.renderer.domElement
        canvas.addEventListener('mousedown', this.onMouseDown)
        canvas.addEventListener('mousemove', this.onMouseMove)
        canvas.addEventListener('mouseup', this.onMouseUp)

        this.requestRender()
    }

    buildVolumeVisualization() {
        if (!this.scene) return
        const profile = this.currentProfile
        const { x: bw, y: bd, z: bh } = profile.buildVolume

        // Remove old
        const toRemove = this.scene.children.filter((c) => c.userData.isBuildVolume)
        toRemove.forEach((c) => this.scene?.remove(c))

        // Grid
        const gridSize = Math.max(bw, bd)
        const gridDivisions = Math.round(gridSize / 10)
        const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444466, 0x333344)
        gridHelper.position.set(bw / 2, 0, bd / 2)
        gridHelper.userData.isBuildVolume = true
        this.scene.add(gridHelper)

        // Floor plate
        const plateGeo = new THREE.PlaneGeometry(bw, bd)
        const plateMat = new THREE.MeshBasicMaterial({
            color: 0x2a2a4a, side: THREE.DoubleSide,
            transparent: true, opacity: 0.6,
        })
        const plateMesh = new THREE.Mesh(plateGeo, plateMat)
        plateMesh.rotation.x = -Math.PI / 2
        plateMesh.position.set(bw / 2, -0.1, bd / 2)
        plateMesh.userData.isBuildVolume = true
        this.scene.add(plateMesh)

        // Wireframe box
        const boxGeo = new THREE.BoxGeometry(bw, bh, bd)
        const edges = new THREE.EdgesGeometry(boxGeo)
        const lineMat = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.5 })
        const wireframe = new THREE.LineSegments(edges, lineMat)
        wireframe.position.set(bw / 2, bh / 2, bd / 2)
        wireframe.userData.isBuildVolume = true
        this.scene.add(wireframe)

        // Gantry clearance line (dashed horizontal plane at gantry height)
        const gantryH = profile.gantryHeight ?? 40
        const gantryGeo = new THREE.PlaneGeometry(bw, bd)
        const gantryMat = new THREE.MeshBasicMaterial({
            color: 0xff8800, side: THREE.DoubleSide,
            transparent: true, opacity: 0.08,
        })
        const gantryPlane = new THREE.Mesh(gantryGeo, gantryMat)
        gantryPlane.rotation.x = -Math.PI / 2
        gantryPlane.position.set(bw / 2, gantryH, bd / 2)
        gantryPlane.userData.isBuildVolume = true
        this.scene.add(gantryPlane)

        // Gantry line label — top edge
        const gantryEdgeGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, gantryH, 0),
            new THREE.Vector3(bw, gantryH, 0),
        ])
        const gantryEdgeMat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5 })
        const gantryEdge = new THREE.Line(gantryEdgeGeo, gantryEdgeMat)
        gantryEdge.userData.isBuildVolume = true
        this.scene.add(gantryEdge)

        this.requestRender()
    }

    requestRender() {
        cancelAnimationFrame(this.animFrame)
        this.animFrame = requestAnimationFrame(() => {
            if (this.renderer && this.scene && this.camera) {
                this.controls?.update()
                this.renderer.render(this.scene, this.camera)
            }
        })
    }

    onWindowResize() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.renderer) return
        if (container.clientHeight === 0) return
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.requestRender()
    }

    // --- Mouse Handling for Drag ---

    onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.scene) return

        const rect = container.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const meshes = Array.from(this.itemMeshes.values())
        const intersects = this.raycaster.intersectObjects(meshes)

        if (intersects.length > 0) {
            const mesh = intersects[0].object as THREE.Mesh
            const itemId = mesh.userData.itemId as string
            if (itemId) {
                this.selectItem(itemId)
                const item = this.plateItems.find((i) => i.id === itemId)
                if (item && this.dragPlatformPlane) {
                    this.dragging = item
                    // Disable orbit controls while dragging
                    if (this.controls) this.controls.enabled = false
                    // Compute offset between raycast hit point and item center
                    const planeIntersects = this.raycaster.intersectObject(this.dragPlatformPlane)
                    if (planeIntersects.length > 0) {
                        const point = planeIntersects[0].point
                        this.dragOffset.set(
                            item.placement.x - point.x,
                            0,
                            item.placement.y - point.z
                        )
                    }
                }
            }
        } else {
            this.selectedItemId = null
            this.updateItemHighlights()
        }
    }

    onMouseMove = (event: MouseEvent) => {
        if (!this.dragging || !this.camera || !this.dragPlatformPlane) return
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container) return

        const rect = container.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const intersects = this.raycaster.intersectObject(this.dragPlatformPlane)
        if (intersects.length > 0) {
            const point = intersects[0].point
            this.dragging.placement.x = point.x + this.dragOffset.x
            this.dragging.placement.y = point.z + this.dragOffset.z
            this.updateItemMesh(this.dragging)
            this.requestRender()
        }
    }

    onMouseUp = () => {
        if (this.dragging) {
            this.dragging = null
            if (this.controls) this.controls.enabled = true
            this.validationResult = null // Invalidate after move
        }
    }

    // --- Recipe Loading ---

    loadRecipes() {
        if (this.$store.state.instancesDB === 'fleet') {
            this.loadRecipesFromApi()
        } else {
            this.loadRecipesFromStorage()
        }
    }

    async loadRecipesFromApi() {
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/gcode-recipes', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (response.ok) {
                const data = await response.json()
                const apiRecipes = data.recipes as Array<Record<string, unknown>>
                if (Array.isArray(apiRecipes) && apiRecipes.length) {
                    let nextId = 1
                    const convert = (nodes: Array<Record<string, unknown>>): RecipeNode[] =>
                        nodes.map((n) => ({
                            id: nextId++,
                            name: String(n.name || ''),
                            nodeType: (n.nodeType === 'gcode' ? 'gcode' : 'item') as 'item' | 'gcode' | undefined,
                            fileId: n.fileId ? String(n.fileId) : undefined,
                            children: convert((n.children as Array<Record<string, unknown>>) || []),
                        }))
                    this.recipes = convert(apiRecipes)
                    this.recipeOpen = this.recipes.map((r) => r.id)
                    return
                }
            }
        } catch (error) {
            console.error('Error loading recipes from API:', error)
        }
        this.loadRecipesFromStorage()
    }

    loadRecipesFromStorage() {
        const storageKey = 'central_files_recipies_v1'
        const stored = localStorage.getItem(storageKey)
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as RecipeNode[]
                if (Array.isArray(parsed)) {
                    this.recipes = parsed
                    this.recipeOpen = parsed.map((r) => r.id)
                }
            } catch (error) {
                console.error('Error loading recipes:', error)
            }
        }
    }

    buildTreeItems(nodes: RecipeNode[]): RecipeTreeItem[] {
        return nodes.map((node) => ({
            id: node.id,
            name: node.name,
            nodeType: node.nodeType,
            fileId: node.fileId,
            children: node.children?.length ? this.buildTreeItems(node.children) : undefined,
        }))
    }

    // --- Printers ---

    async loadPrinters() {
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/printers/accessible', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (response.ok) {
                const data = await response.json()
                this.availablePrinters = data.printers || []
            }
        } catch (error) {
            console.error('Error loading printers:', error)
        }
    }

    selectPrinterProfile(id: string) {
        this.activePrinterId = id
        this.buildVolumeVisualization()
        // Re-validate with new profile
        if (this.plateItems.length) {
            this.handleValidate()
        }
    }

    // --- Add Recipe to Bed ---

    async addRecipeToBed(treeItem: RecipeTreeItem) {
        if (!treeItem.fileId) return
        this.loadingFileId = treeItem.fileId

        try {
            // Download G-code
            const token = localStorage.getItem('fleet_token')
            const response = await fetch(`/api/files/download/${treeItem.fileId}`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!response.ok) {
                this.showError('Failed to download G-code file')
                return
            }

            const gcodeText = await response.text()

            // Parse and extract footprint
            const parsed = parseGcode(gcodeText)
            const footprint = extractFootprint(parsed)

            // Create build plate item
            const id = `bpi-${Date.now()}-${nextItemIdx++}`
            const profile = this.currentProfile
            const item: BuildPlateItem = {
                id,
                recipeNodeId: treeItem.id,
                fileId: treeItem.fileId,
                fileName: treeItem.name,
                footprint,
                placement: {
                    x: profile.buildVolume.x / 2,
                    y: profile.buildVolume.y / 2,
                },
                rotation: 0,
                printOrder: this.plateItems.length,
                gcodeText,
            }

            this.plateItems.push(item)
            this.addItemMesh(item)
            this.validationResult = null

            this.showSuccess(`Added "${treeItem.name}" to build plate`)
        } catch (error) {
            console.error('Error adding recipe to bed:', error)
            this.showError('Failed to load G-code file')
        } finally {
            this.loadingFileId = null
        }
    }

    // --- Item Mesh Management ---

    addItemMesh(item: BuildPlateItem) {
        if (!this.scene) return
        const dims = getRotatedDimensions(item.footprint, item.rotation)
        const colorIdx = this.plateItems.indexOf(item) % ITEM_COLORS.length
        const color = ITEM_COLORS[colorIdx]

        const geometry = new THREE.BoxGeometry(dims.width, item.footprint.height, dims.depth)
        const material = new THREE.MeshPhongMaterial({
            color,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.userData.itemId = item.id
        mesh.position.set(
            item.placement.x,
            item.footprint.height / 2,
            item.placement.y
        )

        // Wireframe edge overlay
        const edgeGeo = new THREE.EdgesGeometry(geometry)
        const edgeMat = new THREE.LineBasicMaterial({ color })
        const wireframe = new THREE.LineSegments(edgeGeo, edgeMat)
        mesh.add(wireframe)

        this.scene.add(mesh)
        this.itemMeshes.set(item.id, mesh)
        this.requestRender()
    }

    updateItemMesh(item: BuildPlateItem) {
        const mesh = this.itemMeshes.get(item.id)
        if (mesh) {
            mesh.position.set(
                item.placement.x,
                item.footprint.height / 2,
                item.placement.y
            )
        }
    }

    removeItemMesh(itemId: string) {
        const mesh = this.itemMeshes.get(itemId)
        if (mesh && this.scene) {
            this.scene.remove(mesh)
            mesh.geometry.dispose()
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => m.dispose())
            } else {
                mesh.material.dispose()
            }
            this.itemMeshes.delete(itemId)
            this.requestRender()
        }
    }

    updateItemHighlights() {
        for (const [id, mesh] of this.itemMeshes) {
            const mat = mesh.material as THREE.MeshPhongMaterial
            mat.opacity = id === this.selectedItemId ? 0.85 : 0.6
        }
        this.requestRender()
    }

    rebuildAllMeshes() {
        // Remove all existing
        for (const [id] of this.itemMeshes) {
            this.removeItemMesh(id)
        }
        // Re-add
        for (const item of this.plateItems) {
            this.addItemMesh(item)
        }
        this.updateItemHighlights()
    }

    // --- Item Management ---

    selectItem(id: string) {
        this.selectedItemId = id
        this.updateItemHighlights()
    }

    removeItem(id: string) {
        const idx = this.plateItems.findIndex((i) => i.id === id)
        if (idx >= 0) {
            this.plateItems.splice(idx, 1)
            this.removeItemMesh(id)
            if (this.selectedItemId === id) {
                this.selectedItemId = null
            }
            // Re-number print order
            this.plateItems
                .sort((a, b) => a.printOrder - b.printOrder)
                .forEach((item, i) => { item.printOrder = i })
            this.validationResult = null
        }
    }

    moveItemUp(id: string) {
        const sorted = this.sortedPlateItems
        const idx = sorted.findIndex((i) => i.id === id)
        if (idx <= 0) return
        const prev = sorted[idx - 1]
        const current = sorted[idx]
        const tempOrder = current.printOrder
        current.printOrder = prev.printOrder
        prev.printOrder = tempOrder
        this.validationResult = null
    }

    moveItemDown(id: string) {
        const sorted = this.sortedPlateItems
        const idx = sorted.findIndex((i) => i.id === id)
        if (idx < 0 || idx >= sorted.length - 1) return
        const next = sorted[idx + 1]
        const current = sorted[idx]
        const tempOrder = current.printOrder
        current.printOrder = next.printOrder
        next.printOrder = tempOrder
        this.validationResult = null
    }

    // --- Actions ---

    handleAutoArrange() {
        if (this.plateItems.length < 2) return
        this.plateItems = autoArrange(this.plateItems, this.sequentialConfig)
        this.rebuildAllMeshes()
        this.validationResult = null
        this.showSuccess('Parts auto-arranged')
    }

    handleSuggestOrder() {
        if (this.plateItems.length < 2) return
        this.plateItems = suggestPrintOrder(this.plateItems)
        this.showSuccess('Print order optimized')
    }

    handleValidate() {
        this.validationResult = validateArrangement(this.plateItems, this.sequentialConfig)
        if (this.validationResult.valid) {
            this.showSuccess('Arrangement is valid')
        }
    }

    async handleGenerate() {
        if (!this.plateItems.length) return

        // Validate first
        this.handleValidate()
        if (this.validationResult && !this.validationResult.valid) {
            this.showError('Fix arrangement errors before generating')
            return
        }

        this.stitching = true
        this.stitchingMessage = 'Preparing G-code parts...'

        try {
            // Build stitch parts in print order
            const sorted = this.sortedPlateItems
            const parts: StitchPart[] = sorted.map((item) => ({
                gcode: item.gcodeText ?? '',
                fileName: item.fileName,
                offsetX: item.placement.x - item.footprint.originalCenter.x,
                offsetY: item.placement.y - item.footprint.originalCenter.y,
                rotation: item.rotation,
            }))

            this.stitchingMessage = 'Stitching G-code files...'

            // Check total size — use worker for large files
            const totalSize = parts.reduce((sum, p) => sum + p.gcode.length, 0)

            if (totalSize > 20 * 1024 * 1024) {
                // Large files — try server-side fallback
                this.stitchingMessage = 'Large file set — using server-side compositing...'
                await this.serverSideStitch(sorted)
            } else {
                // Client-side stitching
                this.generatedGcode = stitchGcodes(parts, {}, (progress) => {
                    this.stitchingMessage = `Stitching... ${Math.round(progress)}%`
                })
            }

            this.stitchingMessage = 'G-code generated!'

            // Open send dialog
            this.sendDialog = true
        } catch (error) {
            console.error('Error generating G-code:', error)
            this.showError('Failed to generate composite G-code')
        } finally {
            this.stitching = false
        }
    }

    async serverSideStitch(items: BuildPlateItem[]) {
        const token = localStorage.getItem('fleet_token')
        const payload = items.map((item) => ({
            fileId: item.fileId,
            offsetX: item.placement.x - item.footprint.originalCenter.x,
            offsetY: item.placement.y - item.footprint.originalCenter.y,
            rotation: item.rotation,
        }))

        const response = await fetch('/api/compose', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                parts: payload,
                printerProfile: {
                    bed_size_x: this.currentProfile.buildVolume.x,
                    bed_size_y: this.currentProfile.buildVolume.y,
                },
            }),
        })

        if (!response.ok) {
            throw new Error('Server-side composition failed')
        }

        this.generatedGcode = await response.text()
    }

    async sendToPrinter() {
        if (!this.selectedPrinterId || !this.generatedGcode) return
        this.sending = true

        try {
            const token = localStorage.getItem('fleet_token')

            // Upload composed G-code as a new file
            const filename = `composite-${Date.now()}.gcode`
            const blob = new Blob([this.generatedGcode], { type: 'text/plain' })
            const formData = new FormData()
            formData.append('files', blob, filename)
            formData.append('category', 'composed-job')

            const uploadResponse = await fetch('/api/files/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            })

            if (!uploadResponse.ok) {
                this.showError('Failed to upload composed G-code')
                return
            }

            const uploadData = await uploadResponse.json().catch(() => ({}))
            const uploadedFiles = uploadData?.files?.[0]

            if (!uploadedFiles?.id) {
                this.showError('Upload succeeded but no file ID returned')
                return
            }

            // Send to printer
            const sendResponse = await fetch('/api/files/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileId: uploadedFiles.id,
                    printerId: this.selectedPrinterId,
                }),
            })

            if (sendResponse.ok) {
                this.showSuccess('Composite job sent to printer!')
                this.sendDialog = false
            } else {
                const data = await sendResponse.json()
                this.showError(data.error || 'Failed to send to printer')
            }
        } catch (error) {
            console.error('Error sending to printer:', error)
            this.showError('Failed to send composite job')
        } finally {
            this.sending = false
        }
    }

    // --- Helpers ---

    formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        if (hours > 0) return `${hours}h ${mins}m`
        return `${mins}m`
    }

    showSuccess(message: string) {
        this.snackbarText = message
        this.snackbarColor = 'success'
        this.snackbar = true
    }

    showError(message: string) {
        this.snackbarText = message
        this.snackbarColor = 'error'
        this.snackbar = true
    }
}
</script>

<style scoped>
.composer-page {
    position: relative;
    width: 100%;
    height: calc(100vh - 64px);
    display: flex;
    overflow: hidden;
}

.viewer-area {
    flex: 1;
    position: relative;
}

.viewer-container {
    width: 100%;
    height: 100%;
}

.left-panel {
    width: 280px;
    min-width: 280px;
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 2;
    background: rgba(30, 30, 50, 0.95);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.right-panel {
    width: 300px;
    min-width: 300px;
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 2;
    background: rgba(30, 30, 50, 0.95);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.top-bar {
    position: absolute;
    top: 8px;
    left: 290px;
    z-index: 3;
}

.printer-selector {
    text-transform: none;
    letter-spacing: normal;
}

.model-info-bar {
    position: absolute;
    bottom: 12px;
    left: 290px;
    z-index: 3;
}

.empty-hint {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 1;
    pointer-events: none;
}

.overflow-y-auto {
    overflow-y: auto;
}
</style>
