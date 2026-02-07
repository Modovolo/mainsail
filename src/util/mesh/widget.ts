/**
 * PrepareWidget - 3D model wrapper for the prepare/slicer page
 * Adapted from Kiri:Moto Widget (MIT License)
 * 
 * Wraps a THREE.Mesh with transform tracking, group support,
 * selection state, and bounding box management.
 */

import * as THREE from 'three'

let nextId = 1

export interface WidgetTrack {
    pos: { x: number; y: number; z: number }
    rot: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
    box: { w: number; h: number; d: number }
    mirror: boolean
}

export interface WidgetMeta {
    file: string | null
    url: string | null
}

export interface WidgetAnnotation {
    extruder: number
}

// Color constants
const COLOR_DEFAULT = 0xffff00
const COLOR_SELECTED = 0x00bbff
const COLOR_HOVER = 0x88ddff
const OPACITY_DEFAULT = 0.85

export class PrepareWidget {
    id: string
    mesh: THREE.Mesh
    group: PrepareWidget[]
    grouped: boolean
    bounds: THREE.Box3 | null = null
    modified = true
    selected = false
    meta: WidgetMeta = { file: null, url: null }
    anno: WidgetAnnotation = { extruder: 0 }
    track: WidgetTrack
    private _material: THREE.MeshPhongMaterial

    constructor(geometry: THREE.BufferGeometry, name?: string, group?: PrepareWidget[]) {
        this.id = Date.now().toString(36) + (nextId++)
        this.grouped = group ? true : false
        this.group = group || [this]
        if (!group) this.group = [this]
        else group.push(this)

        this.track = {
            pos: { x: 0, y: 0, z: 0 },
            rot: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            box: { w: 0, h: 0, d: 0 },
            mirror: false,
        }

        // Create material
        this._material = new THREE.MeshPhongMaterial({
            side: THREE.DoubleSide,
            color: COLOR_DEFAULT,
            specular: 0x202020,
            shininess: 120,
            transparent: true,
            opacity: OPACITY_DEFAULT,
            flatShading: true,
        })

        // Create mesh with back-reference
        this.mesh = new THREE.Mesh(geometry, this._material)
        ;(this.mesh as any).widget = this  // back-reference for raycasting

        this.meta.file = name || null

        // Center geometry and compute bounds
        this.centerGeometry()
        this.updateBoundingBox()
    }

    get name(): string {
        return this.meta.file || `Object ${this.id}`
    }

    set name(n: string) {
        this.meta.file = n
    }

    // --- Transform methods ---

    move(x: number, y: number, z: number, abs = false): void {
        this.group.forEach(w => w._move(x, y, z, abs))
    }

    private _move(x: number, y: number, z: number, abs: boolean): void {
        const pos = this.track.pos
        if (abs) {
            pos.x = x || 0
            pos.y = y || 0
            pos.z = z || 0
        } else {
            pos.x += x || 0
            pos.y += y || 0
            pos.z += z || 0
        }
        this._updateMeshPosition()
        this.modified = true
    }

    private _updateMeshPosition(): void {
        const { x, y, z } = this.track.pos
        this.mesh.position.set(x, z, y) // swap Y/Z for Three.js coordinate system
    }

    rotate(x: number, y: number, z: number): void {
        this.group.forEach(w => w._rotate(x, y, z))
        this.centerGeometry()
    }

    private _rotate(x: number, y: number, z: number): void {
        this.bounds = null
        const m4 = new THREE.Matrix4()
        m4.makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0))
        this.mesh.geometry.applyMatrix4(m4)
        
        const rot = this.track.rot
        rot.x += x || 0
        rot.y += y || 0
        rot.z += z || 0
        this.modified = true
    }

    rotateByQuaternion(q: THREE.Quaternion): void {
        this.group.forEach(w => {
            w.bounds = null
            const m4 = new THREE.Matrix4().makeRotationFromQuaternion(q)
            w.mesh.geometry.applyMatrix4(m4)
            w.modified = true
        })
        this.centerGeometry()
    }

    scale(x: number, y: number, z: number): void {
        this.group.forEach(w => w._scale(x, y, z))
        this.centerGeometry()
    }

    private _scale(x: number, y: number, z: number): void {
        this.bounds = null
        const scale = this.track.scale
        this.mesh.geometry.applyMatrix4(new THREE.Matrix4().makeScale(x, y, z))
        scale.x *= x || 1
        scale.y *= y || 1
        scale.z *= z || 1
        this.modified = true
    }

    mirror(): void {
        this.group.forEach(w => {
            w.bounds = null
            w.mesh.geometry.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
            // Flip normals
            const positions = w.mesh.geometry.attributes.position
            if (positions) {
                // Reverse triangle winding
                const arr = positions.array as Float32Array
                for (let i = 0; i < arr.length; i += 9) {
                    // Swap vertex 1 and 2 of each triangle
                    const tmp = [arr[i + 3], arr[i + 4], arr[i + 5]]
                    arr[i + 3] = arr[i + 6]
                    arr[i + 4] = arr[i + 7]
                    arr[i + 5] = arr[i + 8]
                    arr[i + 6] = tmp[0]
                    arr[i + 7] = tmp[1]
                    arr[i + 8] = tmp[2]
                }
                positions.needsUpdate = true
            }
            w.mesh.geometry.computeVertexNormals()
            w.track.mirror = !w.track.mirror
            w.modified = true
        })
        this.centerGeometry()
    }

    // --- Bounding box ---

    getBoundingBox(refresh = false): THREE.Box3 {
        if (!this.bounds || refresh) {
            this.updateBoundingBox()
        }
        return this.bounds!
    }

    updateBoundingBox(): void {
        this.mesh.geometry.computeBoundingBox()
        const geoBounds = this.mesh.geometry.boundingBox!
        const size = new THREE.Vector3()
        geoBounds.getSize(size)
        this.track.box = { w: size.x, h: size.y, d: size.z }

        // World-space bounds including position
        this.bounds = new THREE.Box3().setFromObject(this.mesh)
    }

    // --- Visual state ---

    setColor(color: number): void {
        this._material.color.setHex(color)
    }

    setSelected(selected: boolean): void {
        this.selected = selected
        this._material.color.setHex(selected ? COLOR_SELECTED : COLOR_DEFAULT)
    }

    setHover(hover: boolean): void {
        if (!this.selected) {
            this._material.color.setHex(hover ? COLOR_HOVER : COLOR_DEFAULT)
        }
    }

    setOpacity(opacity: number): void {
        this._material.opacity = opacity
        this._material.transparent = opacity < 1
    }

    setWireframe(enabled: boolean): void {
        this._material.wireframe = enabled
    }

    setVisible(visible: boolean): void {
        this.mesh.visible = visible
    }

    // --- Geometry helpers ---

    centerGeometry(): void {
        const geo = this.mesh.geometry
        geo.computeBoundingBox()
        const box = geo.boundingBox!
        const center = new THREE.Vector3()
        box.getCenter(center)

        // Center X/Y, put bottom at Z=0
        geo.translate(-center.x, -box.min.y, -center.z)
        this.updateBoundingBox()
    }

    /**
     * Lay flat based on a face normal - rotates so the clicked face is on the bottom
     */
    layFlatOnFace(faceNormal: THREE.Vector3): void {
        const q = new THREE.Quaternion()
        // Rotate so face normal points down (negative Y in geometry space)
        q.setFromUnitVectors(faceNormal.clone().normalize(), new THREE.Vector3(0, -1, 0))
        this.rotateByQuaternion(q)
    }

    /**
     * Simple lay flat - just ensure bottom is on build plate
     */
    layFlat(): void {
        const box = this.getBoundingBox(true)
        const minY = box.min.y
        if (minY !== 0) {
            this.track.pos.z = -minY
            this._updateMeshPosition()
        }
    }

    // --- Duplication ---

    duplicate(): PrepareWidget {
        const geo = this.mesh.geometry.clone()
        const widget = new PrepareWidget(geo, this.name ? this.name + ' (copy)' : undefined)
        widget.track.rot = { ...this.track.rot }
        widget.track.scale = { ...this.track.scale }
        widget.anno = { ...this.anno }
        return widget
    }

    // --- Cleanup ---

    dispose(): void {
        this.mesh.geometry.dispose()
        this._material.dispose()
        // Remove from group
        const idx = this.group.indexOf(this)
        if (idx >= 0) this.group.splice(idx, 1)
    }

    // --- Static helpers ---

    static fromMesh(mesh: THREE.Mesh, name?: string): PrepareWidget {
        const geo = mesh.geometry.clone()
        return new PrepareWidget(geo, name)
    }

    /**
     * Get combined bounds of multiple widgets
     */
    static combinedBounds(widgets: PrepareWidget[]): THREE.Box3 {
        const bounds = new THREE.Box3()
        for (const w of widgets) {
            bounds.union(w.getBoundingBox(true))
        }
        return bounds
    }
}
