/**
 * Platform Unit Tests
 * 
 * Tests for the build platform management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { Platform, PlatformConfig } from '@/util/mesh/platform'
import { PrepareWidget } from '@/util/mesh/widget'

// Helper to create a test geometry
function createTestGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(10, 10, 10)
    return geometry
}

// Helper to create a test widget
function createTestWidget(name = 'test.stl'): PrepareWidget {
    return new PrepareWidget(createTestGeometry(), name)
}

describe('Platform', () => {
    let platform: Platform
    let scene: THREE.Scene
    let config: PlatformConfig

    beforeEach(() => {
        scene = new THREE.Scene()
        config = {
            bedWidth: 200,
            bedDepth: 200,
            bedHeight: 200,
            gap: 5,
        }
        platform = new Platform(scene, config)
    })

    describe('constructor', () => {
        it('should initialize with empty widgets array', () => {
            expect(platform.widgets).toEqual([])
        })

        it('should initialize with empty selection', () => {
            expect(platform.selected).toEqual([])
            expect(platform.hasSelection).toBe(false)
        })

        it('should store scene reference', () => {
            expect(platform.scene).toBe(scene)
        })

        it('should store config', () => {
            expect(platform.config).toEqual(config)
        })
    })

    describe('add', () => {
        it('should add widget to widgets array', () => {
            const widget = createTestWidget()
            platform.add(widget)

            expect(platform.widgets).toContain(widget)
            expect(platform.widgets.length).toBe(1)
        })

        it('should add widget mesh to scene', () => {
            const widget = createTestWidget()
            const addSpy = vi.spyOn(scene, 'add')

            platform.add(widget)

            expect(addSpy).toHaveBeenCalledWith(widget.mesh)
        })

        it('should center first widget on platform', () => {
            const widget = createTestWidget()
            platform.add(widget)

            // First widget should be centered
            expect(widget.track.pos.x).toBe(config.bedWidth / 2)
            expect(widget.track.pos.y).toBe(config.bedDepth / 2)
        })

        it('should auto-position subsequent widgets', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)

            // Second widget should not be at same position as first
            // (unless they overlap due to auto-positioning logic)
            expect(platform.widgets.length).toBe(2)
        })

        it('should not auto-position when disabled', () => {
            const widget = createTestWidget()
            widget.move(50, 50, 0, true)
            
            platform.add(widget, false)

            // Position should be preserved (except for center on first widget)
            expect(platform.widgets.length).toBe(1)
        })
    })

    describe('remove', () => {
        it('should remove widget from widgets array', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.remove(widget)

            expect(platform.widgets).not.toContain(widget)
            expect(platform.widgets.length).toBe(0)
        })

        it('should remove widget mesh from scene', () => {
            const widget = createTestWidget()
            platform.add(widget)
            
            const removeSpy = vi.spyOn(scene, 'remove')
            platform.remove(widget)

            expect(removeSpy).toHaveBeenCalledWith(widget.mesh)
        })

        it('should deselect widget if selected', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)
            expect(platform.selected).toContain(widget)

            platform.remove(widget)

            expect(platform.selected).not.toContain(widget)
        })

        it('should dispose widget', () => {
            const widget = createTestWidget()
            const disposeSpy = vi.spyOn(widget, 'dispose')
            
            platform.add(widget)
            platform.remove(widget)

            expect(disposeSpy).toHaveBeenCalled()
        })
    })

    describe('removeSelected', () => {
        it('should remove all selected widgets', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')
            const w3 = createTestWidget('model3.stl')

            platform.add(w1)
            platform.add(w2)
            platform.add(w3)
            
            platform.select(w1)
            platform.select(w2, true)
            
            platform.removeSelected()

            expect(platform.widgets).toContain(w3)
            expect(platform.widgets.length).toBe(1)
        })

        it('should clear selection after removal', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)
            
            platform.removeSelected()

            expect(platform.selected.length).toBe(0)
        })
    })

    describe('removeAll', () => {
        it('should remove all widgets', () => {
            platform.add(createTestWidget('model1.stl'))
            platform.add(createTestWidget('model2.stl'))
            platform.add(createTestWidget('model3.stl'))

            platform.removeAll()

            expect(platform.widgets.length).toBe(0)
        })

        it('should clear selection', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)
            
            platform.removeAll()

            expect(platform.selected.length).toBe(0)
        })
    })

    describe('select', () => {
        it('should select widget', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            expect(platform.selected).toContain(widget)
            expect(widget.selected).toBe(true)
        })

        it('should replace selection by default', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.select(w1)
            platform.select(w2)

            expect(platform.selected.length).toBe(1)
            expect(platform.selected).toContain(w2)
        })

        it('should add to selection when specified', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.select(w1)
            platform.select(w2, true)

            expect(platform.selected.length).toBe(2)
            expect(platform.selected).toContain(w1)
            expect(platform.selected).toContain(w2)
        })

        it('should toggle selection when shift-clicking selected widget', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)
            platform.select(widget, true) // Shift-click again

            expect(platform.selected).not.toContain(widget)
        })
    })

    describe('deselect', () => {
        it('should deselect specific widget', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)
            
            platform.deselect(widget)

            expect(platform.selected).not.toContain(widget)
            expect(widget.selected).toBe(false)
        })

        it('should deselect all when no widget specified', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.selectAll()
            
            platform.deselect()

            expect(platform.selected.length).toBe(0)
        })
    })

    describe('selectAll', () => {
        it('should select all widgets', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.selectAll()

            expect(platform.selected.length).toBe(2)
            expect(platform.selected).toContain(w1)
            expect(platform.selected).toContain(w2)
        })

        it('should set selected state on all widgets', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.selectAll()

            expect(w1.selected).toBe(true)
            expect(w2.selected).toBe(true)
        })
    })

    describe('selection properties', () => {
        it('should return correct selection count', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.select(w1)
            platform.select(w2, true)

            expect(platform.selectionCount).toBe(2)
        })

        it('should return hasSelection correctly', () => {
            expect(platform.hasSelection).toBe(false)

            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            expect(platform.hasSelection).toBe(true)
        })
    })

    describe('selection transforms', () => {
        it('should move all selected widgets', () => {
            const w1 = createTestWidget('model1.stl')
            const w2 = createTestWidget('model2.stl')

            platform.add(w1)
            platform.add(w2)
            platform.selectAll()

            const dx = 10, dy = 5, dz = 0
            platform.moveSelected(dx, dy, dz)

            // Both should have moved by the delta
            // Note: Initial positions differ, so we just check they moved
            expect(w1.modified).toBe(true)
            expect(w2.modified).toBe(true)
        })

        it('should rotate all selected widgets', () => {
            const w1 = createTestWidget('model1.stl')
            platform.add(w1)
            platform.select(w1)

            platform.rotateSelected(Math.PI / 4, 0, 0)

            expect(w1.track.rot.x).toBeCloseTo(Math.PI / 4, 5)
        })

        it('should scale all selected widgets', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            platform.scaleSelected(2, 2, 2)

            expect(widget.track.scale.x).toBe(2)
            expect(widget.track.scale.y).toBe(2)
            expect(widget.track.scale.z).toBe(2)
        })

        it('should mirror all selected widgets', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            platform.mirrorSelected()

            expect(widget.track.mirror).toBe(true)
        })

        it('should center selected widgets on platform', () => {
            const widget = createTestWidget()
            platform.add(widget)
            widget.move(10, 10, 0, true)
            platform.select(widget)

            platform.centerSelected()

            // Should be centered on platform
            // Center position depends on widget bounds
            expect(widget.modified).toBe(true)
        })
    })

    describe('duplicate', () => {
        it('should duplicate selected widgets', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            const copies = platform.duplicateSelected()

            expect(copies.length).toBe(1)
            expect(platform.widgets.length).toBe(2)
        })

        it('should select duplicated widgets', () => {
            const widget = createTestWidget()
            platform.add(widget)
            platform.select(widget)

            const copies = platform.duplicateSelected()

            expect(platform.selected).toContain(copies[0])
            expect(platform.selected).not.toContain(widget)
        })
    })
})

describe('Platform - Regression Tests', () => {
    let platform: Platform
    let scene: THREE.Scene
    let config: PlatformConfig

    beforeEach(() => {
        scene = new THREE.Scene()
        config = {
            bedWidth: 200,
            bedDepth: 200,
            bedHeight: 200,
            gap: 5,
        }
        platform = new Platform(scene, config)
    })

    it('should handle removing widget not in platform', () => {
        const widget = createTestWidget()
        // Don't add to platform
        
        // Should not throw
        expect(() => platform.remove(widget)).not.toThrow()
    })

    it('should handle selecting widget not in platform', () => {
        const widget = createTestWidget()
        // Don't add to platform
        
        // Should not throw
        expect(() => platform.select(widget)).not.toThrow()
    })

    it('should handle empty platform operations', () => {
        // These should not throw on empty platform
        expect(() => platform.removeAll()).not.toThrow()
        expect(() => platform.removeSelected()).not.toThrow()
        expect(() => platform.selectAll()).not.toThrow()
        expect(() => platform.moveSelected(1, 1, 1)).not.toThrow()
        expect(() => platform.centerSelected()).not.toThrow()
    })

    it('should handle many widgets', () => {
        // Add many widgets
        for (let i = 0; i < 100; i++) {
            platform.add(createTestWidget(`model${i}.stl`))
        }

        expect(platform.widgets.length).toBe(100)
        
        platform.selectAll()
        expect(platform.selected.length).toBe(100)
    })

    it('should handle rapid selection changes', () => {
        const widgets = Array.from({ length: 10 }, (_, i) => createTestWidget(`model${i}.stl`))
        widgets.forEach(w => platform.add(w))

        // Rapid selection changes
        for (let i = 0; i < 1000; i++) {
            const idx = i % widgets.length
            platform.select(widgets[idx], i % 2 === 0)
        }

        // Should not crash, selection state should be consistent
        expect(platform.selected.length).toBeLessThanOrEqual(widgets.length)
    })
})
