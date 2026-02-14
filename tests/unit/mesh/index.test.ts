/**
 * Mesh Index/Loader Unit Tests
 * 
 * Tests for the unified loadMeshFile function and mesh utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadMeshFile } from '@/util/mesh/index'

describe('loadMeshFile', () => {
    describe('file type detection', () => {
        it('should load STL files', async () => {
            const stlBuffer = createTestSTLBuffer(12)
            const file = new File([stlBuffer], 'test.stl', { type: 'application/octet-stream' })

            const result = await loadMeshFile(file)

            expect(result).toBeDefined()
            expect(result.geometries).toHaveLength(1)
            expect(result.geometries[0].name).toBe('test.stl')
        })

        it('should load OBJ files', async () => {
            const objString = createTestOBJString()
            const file = new File([objString], 'test.obj', { type: 'text/plain' })

            const result = await loadMeshFile(file)

            expect(result).toBeDefined()
            expect(result.geometries).toHaveLength(1)
            expect(result.geometries[0].name).toBe('test.obj')
        })

        it('should reject unsupported file types', async () => {
            const file = new File(['invalid'], 'test.xyz', { type: 'text/plain' })

            await expect(loadMeshFile(file)).rejects.toThrow(/unsupported/i)
        })

        it('should handle case-insensitive extensions', async () => {
            const stlBuffer = createTestSTLBuffer(12)
            const file = new File([stlBuffer], 'test.STL', { type: 'application/octet-stream' })

            const result = await loadMeshFile(file)

            expect(result).toBeDefined()
            expect(result.geometries.length).toBeGreaterThan(0)
        })
    })

    describe('result data', () => {
        it('should return correct triangle count', async () => {
            const triangleCount = 12
            const stlBuffer = createTestSTLBuffer(triangleCount)
            const file = new File([stlBuffer], 'cube.stl')

            const result = await loadMeshFile(file)

            expect(result.triangleCount).toBe(triangleCount)
        })

        it('should return correct vertex count', async () => {
            const triangleCount = 12
            const stlBuffer = createTestSTLBuffer(triangleCount)
            const file = new File([stlBuffer], 'cube.stl')

            const result = await loadMeshFile(file)

            // Each triangle has 3 vertices
            expect(result.vertexCount).toBe(triangleCount * 3)
        })

        it('should compute bounds correctly', async () => {
            const stlBuffer = createTestSTLBuffer(12) // 1x1x1 cube
            const file = new File([stlBuffer], 'cube.stl')

            const result = await loadMeshFile(file)

            expect(result.bounds).toBeDefined()
            // Cube is 0-1 in all dimensions
            expect(result.bounds.min.x).toBeCloseTo(0, 1)
            expect(result.bounds.max.x).toBeCloseTo(1, 1)
        })

        it('should apply scale option', async () => {
            const stlBuffer = createTestSTLBuffer(12)
            const file = new File([stlBuffer], 'cube.stl')
            const scale = 10

            const result = await loadMeshFile(file, { scale })

            // Bounds should be 10x larger
            expect(result.bounds.max.x).toBeCloseTo(10, 1)
        })
    })

    describe('geometry output', () => {
        it('should return BufferGeometry with position attribute', async () => {
            const stlBuffer = createTestSTLBuffer(12)
            const file = new File([stlBuffer], 'cube.stl')

            const result = await loadMeshFile(file)

            expect(result.geometries[0].geometry.attributes.position).toBeDefined()
        })

        it('should return BufferGeometry with normal attribute', async () => {
            const stlBuffer = createTestSTLBuffer(12)
            const file = new File([stlBuffer], 'cube.stl')

            const result = await loadMeshFile(file)

            expect(result.geometries[0].geometry.attributes.normal).toBeDefined()
        })
    })
})

describe('loadMeshFile - Regression Tests', () => {
    it('should handle file with no extension', async () => {
        const file = new File(['test'], 'noextension', { type: 'text/plain' })

        await expect(loadMeshFile(file)).rejects.toThrow()
    })

    it('should handle empty file', async () => {
        const file = new File([], 'empty.stl')

        // Should throw or return empty result, not crash
        try {
            const result = await loadMeshFile(file)
            expect(result.geometries).toHaveLength(0)
        } catch (e) {
            expect(e).toBeInstanceOf(Error)
        }
    })

    it('should handle very large file names', async () => {
        const longName = 'a'.repeat(255) + '.stl'
        const stlBuffer = createTestSTLBuffer(2)
        const file = new File([stlBuffer], longName)

        const result = await loadMeshFile(file)

        expect(result.geometries[0].name).toBe(longName)
    })

    it('should handle unicode file names', async () => {
        const unicodeName = '日本語モデル.stl'
        const stlBuffer = createTestSTLBuffer(2)
        const file = new File([stlBuffer], unicodeName)

        const result = await loadMeshFile(file)

        expect(result.geometries[0].name).toBe(unicodeName)
    })

    it('should handle file names with spaces', async () => {
        const spacedName = 'my model file.stl'
        const stlBuffer = createTestSTLBuffer(2)
        const file = new File([stlBuffer], spacedName)

        const result = await loadMeshFile(file)

        expect(result.geometries[0].name).toBe(spacedName)
    })
})
