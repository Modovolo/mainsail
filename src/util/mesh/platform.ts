/**
 * Platform Manager - Manages widgets on the build platform
 * Adapted from Kiri:Moto (MIT License)
 * 
 * Handles adding/removing widgets, selection, layout,
 * and platform-level operations.
 */

import * as THREE from 'three'
import { PrepareWidget } from './widget'
import { packBlocks, findNonCollidingPosition, PackBlock } from './packer'

export interface PlatformConfig {
    bedWidth: number
    bedDepth: number
    bedHeight: number
    gap: number
}

export class Platform {
    widgets: PrepareWidget[] = []
    selected: PrepareWidget[] = []
    scene: THREE.Scene
    config: PlatformConfig
    private _hovered: PrepareWidget | null = null

    constructor(scene: THREE.Scene, config: PlatformConfig) {
        this.scene = scene
        this.config = config
    }

    // --- Widget management ---

    add(widget: PrepareWidget, autoPosition = true): void {
        this.widgets.push(widget)
        this.scene.add(widget.mesh)

        if (autoPosition && this.widgets.length > 1) {
            this.positionNewWidget(widget)
        } else if (this.widgets.length === 1) {
            // Center first widget on platform
            widget.move(this.config.bedWidth / 2, this.config.bedDepth / 2, 0, true)
        }

        widget.layFlat()
    }

    remove(widget: PrepareWidget): void {
        const idx = this.widgets.indexOf(widget)
        if (idx >= 0) {
            this.widgets.splice(idx, 1)
        }
        this.deselect(widget)
        this.scene.remove(widget.mesh)
        widget.dispose()
    }

    removeSelected(): void {
        const toRemove = [...this.selected]
        for (const w of toRemove) {
            this.remove(w)
        }
    }

    removeAll(): void {
        const all = [...this.widgets]
        for (const w of all) {
            this.remove(w)
        }
    }

    // --- Selection ---

    select(widget: PrepareWidget, addToSelection = false): void {
        if (!addToSelection) {
            // Clear current selection
            for (const w of this.selected) {
                w.setSelected(false)
            }
            this.selected = []
        }

        if (!this.selected.includes(widget)) {
            this.selected.push(widget)
            widget.setSelected(true)
        } else if (addToSelection) {
            // Toggle off if shift-clicking already selected
            this.deselect(widget)
        }
    }

    deselect(widget?: PrepareWidget): void {
        if (widget) {
            const idx = this.selected.indexOf(widget)
            if (idx >= 0) {
                this.selected.splice(idx, 1)
                widget.setSelected(false)
            }
        } else {
            // Deselect all
            for (const w of this.selected) {
                w.setSelected(false)
            }
            this.selected = []
        }
    }

    selectAll(): void {
        this.deselect()
        for (const w of this.widgets) {
            this.selected.push(w)
            w.setSelected(true)
        }
    }

    isSelected(widget: PrepareWidget): boolean {
        return this.selected.includes(widget)
    }

    get selectionCount(): number {
        return this.selected.length
    }

    get hasSelection(): boolean {
        return this.selected.length > 0
    }

    // --- Hover ---

    setHover(widget: PrepareWidget | null): void {
        if (this._hovered && this._hovered !== widget) {
            this._hovered.setHover(false)
        }
        this._hovered = widget
        if (widget && !widget.selected) {
            widget.setHover(true)
        }
    }

    // --- Selection transforms ---

    moveSelected(dx: number, dy: number, dz: number): void {
        for (const w of this.selected) {
            w.move(dx, dy, dz)
        }
    }

    rotateSelected(x: number, y: number, z: number): void {
        for (const w of this.selected) {
            w.rotate(x, y, z)
            w.layFlat()
        }
    }

    scaleSelected(x: number, y: number, z: number): void {
        for (const w of this.selected) {
            w.scale(x, y, z)
        }
    }

    mirrorSelected(): void {
        for (const w of this.selected) {
            w.mirror()
        }
    }

    centerSelected(): void {
        if (this.selected.length === 0) return

        const bounds = PrepareWidget.combinedBounds(this.selected)
        const center = new THREE.Vector3()
        bounds.getCenter(center)

        const targetX = this.config.bedWidth / 2
        const targetY = this.config.bedDepth / 2

        const dx = targetX - center.x
        const dy = targetY - center.z // Z in Three.js = Y on platform

        for (const w of this.selected) {
            w.move(dx, dy, 0)
        }
    }

    duplicateSelected(): PrepareWidget[] {
        const newWidgets: PrepareWidget[] = []
        for (const w of this.selected) {
            const copy = w.duplicate()
            this.add(copy, true)
            newWidgets.push(copy)
        }

        // Select the new copies
        this.deselect()
        for (const w of newWidgets) {
            this.select(w, true)
        }

        return newWidgets
    }

    // --- Selection bounds ---

    getSelectionBounds(): THREE.Box3 | null {
        if (this.selected.length === 0) return null
        return PrepareWidget.combinedBounds(this.selected)
    }

    getSelectionInfo(): { dimensions: THREE.Vector3; center: THREE.Vector3 } | null {
        const bounds = this.getSelectionBounds()
        if (!bounds) return null

        const dimensions = new THREE.Vector3()
        bounds.getSize(dimensions)
        const center = new THREE.Vector3()
        bounds.getCenter(center)

        return { dimensions, center }
    }

    // --- Layout ---

    /**
     * Position a newly added widget so it doesn't collide with existing ones.
     * Uses spiral search algorithm from Kiri:Moto.
     */
    private positionNewWidget(widget: PrepareWidget): void {
        const existingBounds = this.widgets
            .filter(w => w !== widget)
            .map(w => {
                const bb = w.getBoundingBox(true)
                const center = new THREE.Vector3()
                bb.getCenter(center)
                const size = new THREE.Vector3()
                bb.getSize(size)
                return {
                    x: center.x,
                    y: center.z, // Z in Three.js = Y on platform
                    w: size.x,
                    h: size.z,
                }
            })

        const wb = widget.getBoundingBox(true)
        const wSize = new THREE.Vector3()
        wb.getSize(wSize)

        const pos = findNonCollidingPosition(
            wSize.x,
            wSize.z,
            existingBounds,
            this.config.gap
        )

        widget.move(pos.x + this.config.bedWidth / 2, pos.y + this.config.bedDepth / 2, 0, true)
    }

    /**
     * Auto-arrange all widgets using bin packing.
     * Kiri:Moto style layout.
     */
    arrange(): void {
        if (this.widgets.length === 0) return

        const gap = this.config.gap

        // Create pack blocks from widgets
        const blocks: (PackBlock & { widget: PrepareWidget })[] = this.widgets.map(w => {
            const bb = w.getBoundingBox(true)
            const size = new THREE.Vector3()
            bb.getSize(size)
            return {
                w: size.x,
                h: size.z, // depth on platform
                widget: w,
            }
        })

        // Pack
        const packer = packBlocks(
            blocks,
            this.config.bedWidth,
            this.config.bedDepth,
            gap
        )

        if (packer.packed) {
            // Apply packed positions, centered on platform
            const offsetX = (this.config.bedWidth - packer.max.w) / 2
            const offsetY = (this.config.bedDepth - packer.max.h) / 2

            for (const block of blocks) {
                if (block.fit) {
                    const x = block.fit.x + block.w / 2 + offsetX
                    const y = block.fit.y + block.h / 2 + offsetY
                    block.widget.move(x, y, 0, true)
                    block.widget.layFlat()
                }
            }
        }
    }

    // --- Raycasting ---

    /**
     * Get all widget meshes for raycasting
     */
    getMeshes(): THREE.Mesh[] {
        return this.widgets.map(w => w.mesh)
    }

    /**
     * Find widget by mesh (reverse lookup from raycaster hit)
     */
    widgetFromMesh(mesh: THREE.Object3D): PrepareWidget | null {
        return (mesh as any).widget || null
    }

    /**
     * Find widget from raycaster intersection
     */
    widgetFromIntersection(intersection: THREE.Intersection): PrepareWidget | null {
        return this.widgetFromMesh(intersection.object)
    }

    // --- Stats ---

    get widgetCount(): number {
        return this.widgets.length
    }

    get totalTriangles(): number {
        let count = 0
        for (const w of this.widgets) {
            const positions = w.mesh.geometry.attributes.position
            if (positions) {
                count += positions.count / 3
            }
        }
        return count
    }

    get totalVertices(): number {
        let count = 0
        for (const w of this.widgets) {
            const positions = w.mesh.geometry.attributes.position
            if (positions) {
                count += positions.count
            }
        }
        return count
    }

    getAllBounds(): THREE.Box3 {
        if (this.widgets.length === 0) {
            return new THREE.Box3(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(this.config.bedWidth, this.config.bedHeight, this.config.bedDepth)
            )
        }
        return PrepareWidget.combinedBounds(this.widgets)
    }
}
