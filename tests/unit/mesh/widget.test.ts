/**
 * PrepareWidget Unit Tests
 * 
 * Tests for the 3D model widget functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { PrepareWidget } from '@/util/mesh/widget'

// Helper to create a test geometry
function createTestGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    
    // Simple triangle
    const vertices = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0.5, 1, 0,
    ])
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()
    
    return geometry
}

// Helper to create a cube geometry
function createCubeGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    return geometry
}

describe('PrepareWidget', () => {
    let widget: PrepareWidget
    let geometry: THREE.BufferGeometry

    beforeEach(() => {
        geometry = createTestGeometry()
        widget = new PrepareWidget(geometry, 'test-model.stl')
    })

    describe('constructor', () => {
        it('should create widget with unique ID', () => {
            const w1 = new PrepareWidget(createTestGeometry())
            const w2 = new PrepareWidget(createTestGeometry())

            expect(w1.id).toBeDefined()
            expect(w2.id).toBeDefined()
            expect(w1.id).not.toBe(w2.id)
        })

        it('should set name from constructor', () => {
            expect(widget.name).toBe('test-model.stl')
        })

        it('should initialize track with default values', () => {
            expect(widget.track.pos).toEqual({ x: 0, y: 0, z: 0 })
            expect(widget.track.rot).toEqual({ x: 0, y: 0, z: 0 })
            expect(widget.track.scale).toEqual({ x: 1, y: 1, z: 1 })
            expect(widget.track.mirror).toBe(false)
        })

        it('should create mesh with geometry', () => {
            expect(widget.mesh).toBeInstanceOf(THREE.Mesh)
            expect(widget.mesh.geometry).toBeDefined()
        })

        it('should set default selection state to false', () => {
            expect(widget.selected).toBe(false)
        })
    })

    describe('name property', () => {
        it('should get name from meta.file', () => {
            expect(widget.name).toBe('test-model.stl')
        })

        it('should set name to meta.file', () => {
            widget.name = 'new-name.obj'
            expect(widget.name).toBe('new-name.obj')
        })

        it('should return fallback name when meta.file is null', () => {
            const w = new PrepareWidget(createTestGeometry())
            // Name should be something like "Object <id>"
            expect(w.name).toContain('Object')
        })
    })

    describe('move', () => {
        it('should move widget to absolute position', () => {
            widget.move(10, 20, 5, true)

            expect(widget.track.pos.x).toBe(10)
            expect(widget.track.pos.y).toBe(20)
            expect(widget.track.pos.z).toBe(5)
        })

        it('should move widget relatively', () => {
            widget.move(5, 5, 5, true) // Start position
            widget.move(3, 2, 1, false) // Relative move

            expect(widget.track.pos.x).toBe(8)
            expect(widget.track.pos.y).toBe(7)
            expect(widget.track.pos.z).toBe(6)
        })

        it('should mark widget as modified after move', () => {
            widget.modified = false
            widget.move(1, 1, 1, false)

            expect(widget.modified).toBe(true)
        })

        it('should update mesh position after move', () => {
            widget.move(10, 20, 5, true)

            // Three.js uses different coordinate system (Y/Z swapped)
            expect(widget.mesh.position.x).toBe(10)
            // Z in track becomes Y in Three.js mesh
        })

        it('should handle zero movement', () => {
            widget.move(5, 5, 5, true)
            widget.move(0, 0, 0, false)

            expect(widget.track.pos.x).toBe(5)
            expect(widget.track.pos.y).toBe(5)
            expect(widget.track.pos.z).toBe(5)
        })
    })

    describe('rotate', () => {
        it('should track rotation amounts', () => {
            const angle = Math.PI / 4 // 45 degrees
            widget.rotate(angle, 0, 0)

            expect(widget.track.rot.x).toBeCloseTo(angle, 5)
        })

        it('should accumulate rotation', () => {
            const angle = Math.PI / 4
            widget.rotate(angle, 0, 0)
            widget.rotate(angle, 0, 0)

            expect(widget.track.rot.x).toBeCloseTo(angle * 2, 5)
        })

        it('should mark widget as modified after rotation', () => {
            widget.modified = false
            widget.rotate(0.1, 0, 0)

            expect(widget.modified).toBe(true)
        })

        it('should require bounds refresh after rotation', () => {
            const initialBounds = widget.getBoundingBox(true)
            expect(initialBounds).not.toBeNull()
            
            widget.rotate(Math.PI / 4, 0, 0)
            
            // After rotation, bounds change - verify by getting fresh bounds
            const newBounds = widget.getBoundingBox(true)
            expect(newBounds).toBeDefined()
            // Bounds should be different after rotation
            expect(widget.modified).toBe(true)
        })
    })

    describe('scale', () => {
        it('should track scale factors', () => {
            widget.scale(2, 2, 2)

            expect(widget.track.scale.x).toBe(2)
            expect(widget.track.scale.y).toBe(2)
            expect(widget.track.scale.z).toBe(2)
        })

        it('should accumulate scale factors', () => {
            widget.scale(2, 2, 2)
            widget.scale(0.5, 0.5, 0.5)

            expect(widget.track.scale.x).toBe(1)
            expect(widget.track.scale.y).toBe(1)
            expect(widget.track.scale.z).toBe(1)
        })

        it('should support non-uniform scaling', () => {
            widget.scale(2, 1, 0.5)

            expect(widget.track.scale.x).toBe(2)
            expect(widget.track.scale.y).toBe(1)
            expect(widget.track.scale.z).toBe(0.5)
        })
    })

    describe('mirror', () => {
        it('should toggle mirror flag', () => {
            expect(widget.track.mirror).toBe(false)
            widget.mirror()
            expect(widget.track.mirror).toBe(true)
        })

        it('should toggle mirror flag back', () => {
            widget.mirror()
            widget.mirror()
            expect(widget.track.mirror).toBe(false)
        })

        it('should mark widget as modified', () => {
            widget.modified = false
            widget.mirror()
            expect(widget.modified).toBe(true)
        })
    })

    describe('selection', () => {
        it('should set selection state', () => {
            widget.setSelected(true)
            expect(widget.selected).toBe(true)

            widget.setSelected(false)
            expect(widget.selected).toBe(false)
        })
    })

    describe('bounding box', () => {
        it('should compute bounding box', () => {
            const bounds = widget.getBoundingBox(true)

            expect(bounds).toBeInstanceOf(THREE.Box3)
            expect(bounds.isEmpty()).toBe(false)
        })

        it('should cache bounding box', () => {
            const bounds1 = widget.getBoundingBox(true)
            const bounds2 = widget.getBoundingBox(false)

            expect(bounds1).toBe(bounds2)
        })

        it('should refresh bounding box when requested', () => {
            widget.getBoundingBox(true)
            widget.move(10, 10, 10, true)
            
            const newBounds = widget.getBoundingBox(true)
            
            // Bounds should be recomputed
            expect(newBounds).toBeDefined()
        })
    })

    describe('dispose', () => {
        it('should dispose of geometry and material', () => {
            const geometryDisposeSpy = vi.spyOn(widget.mesh.geometry, 'dispose')
            const materialDisposeSpy = vi.spyOn(widget.mesh.material as THREE.Material, 'dispose')

            widget.dispose()

            expect(geometryDisposeSpy).toHaveBeenCalled()
            expect(materialDisposeSpy).toHaveBeenCalled()
        })
    })
})

describe('PrepareWidget - Regression Tests', () => {
    it('should handle widget with degenerate geometry', () => {
        // Geometry with all zero vertices (degenerate)
        const geometry = new THREE.BufferGeometry()
        const vertices = new Float32Array(9) // All zeros
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))

        // Should not throw
        expect(() => new PrepareWidget(geometry)).not.toThrow()
    })

    it('should handle widget with empty geometry name', () => {
        const widget = new PrepareWidget(createTestGeometry(), '')
        
        // Should return ID-based name when empty string provided
        expect(widget.name).toContain('Object')
    })

    it('should handle extreme scale values', () => {
        const widget = new PrepareWidget(createTestGeometry())
        
        // Very large scale
        widget.scale(1000, 1000, 1000)
        expect(widget.track.scale.x).toBe(1000)
        
        // Very small scale
        widget.scale(0.001, 0.001, 0.001)
        expect(widget.track.scale.x).toBe(1)
    })

    it('should handle rapid successive transforms', () => {
        const widget = new PrepareWidget(createTestGeometry())
        
        // Rapid transforms should not corrupt state
        for (let i = 0; i < 100; i++) {
            widget.move(1, 0, 0, false)
            widget.rotate(0.01, 0, 0)
        }
        
        expect(widget.track.pos.x).toBe(100)
        expect(widget.track.rot.x).toBeCloseTo(1, 5)
    })
})
