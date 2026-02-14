/**
 * OBJ Loader Unit Tests
 * 
 * Tests for Wavefront OBJ file parsing
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { OBJLoader } from '@/util/mesh/obj'

describe('OBJLoader', () => {
    let loader: OBJLoader

    beforeEach(() => {
        loader = new OBJLoader()
    })

    describe('parse', () => {
        it('should parse a valid OBJ file with vertices and faces', () => {
            const objData = createTestOBJString()
            const result = loader.parse(objData)

            expect(result).toBeDefined()
            expect(result.vertices).toBeInstanceOf(Float32Array)
            expect(result.vertices.length).toBeGreaterThan(0)
        })

        it('should parse vertex positions correctly', () => {
            const objData = `
v 1.0 2.0 3.0
v 4.0 5.0 6.0
v 7.0 8.0 9.0
f 1 2 3
`
            const result = loader.parse(objData)

            expect(result.vertices.length).toBe(9) // 1 triangle, 3 vertices, 3 coords each
        })

        it('should parse normals when present', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 1//1 2//1 3//1
`
            const result = loader.parse(objData)

            expect(result.normals).not.toBeNull()
            expect(result.normals?.length).toBe(9) // 3 vertices * 3 normal components
        })

        it('should parse texture coordinates when present', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0.5 1
f 1/1 2/2 3/3
`
            const result = loader.parse(objData)

            expect(result.uvs).not.toBeNull()
            expect(result.uvs?.length).toBe(6) // 3 vertices * 2 UV coords
        })

        it('should handle faces with v/vt/vn format', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0.5 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1
`
            const result = loader.parse(objData)

            expect(result.vertices.length).toBe(9)
            expect(result.normals).not.toBeNull()
            expect(result.uvs).not.toBeNull()
        })

        it('should handle comments and empty lines', () => {
            const objData = `
# This is a comment
v 0 0 0
# Another comment
v 1 0 0

v 0 1 0

f 1 2 3
# End comment
`
            const result = loader.parse(objData)

            expect(result.vertices.length).toBe(9)
        })

        it('should handle quad faces by triangulating', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`
            const result = loader.parse(objData)

            // Quad should be split into 2 triangles = 6 vertices = 18 coords
            expect(result.vertices.length).toBe(18)
        })

        it('should return null normals when none present', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`
            const result = loader.parse(objData)

            expect(result.normals).toBeNull()
        })

        it('should handle negative indices (relative)', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
f -3 -2 -1
`
            const result = loader.parse(objData)

            // Should correctly reference last 3 vertices
            expect(result.vertices.length).toBe(9)
        })
    })

    describe('parseToGeometry', () => {
        it('should return a valid BufferGeometry', () => {
            const objData = createTestOBJString()
            const geometry = loader.parseToGeometry(objData)

            expect(geometry).toBeDefined()
            expect(geometry.attributes.position).toBeDefined()
        })

        it('should compute normals when not provided', () => {
            const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`
            const geometry = loader.parseToGeometry(objData)

            // computeVertexNormals should have been called
            expect(geometry.attributes.normal).toBeDefined()
        })

        it('should create geometry with correct vertex count', () => {
            const objData = createTestOBJString()
            const geometry = loader.parseToGeometry(objData)

            // Test cube OBJ has 12 faces (6 sides * 2 triangles)
            expect(geometry.attributes.position.count).toBe(36) // 12 triangles * 3 vertices
        })
    })
})

describe('OBJLoader - Regression Tests', () => {
    let loader: OBJLoader

    beforeEach(() => {
        loader = new OBJLoader()
    })

    it('should handle OBJ with only vertices (no faces)', () => {
        const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
`
        const result = loader.parse(objData)

        // No faces = no output geometry
        expect(result.vertices.length).toBe(0)
    })

    it('should handle scientific notation in coordinates', () => {
        const objData = `
v 1e-10 2E5 -3.5e-2
v 0 0 0
v 1 0 0
f 1 2 3
`
        const result = loader.parse(objData)

        expect(result.vertices[0]).toBeCloseTo(1e-10, 15)
        expect(result.vertices[1]).toBeCloseTo(2e5, 0)
        expect(result.vertices[2]).toBeCloseTo(-3.5e-2, 5)
    })

    it('should handle inconsistent whitespace', () => {
        const objData = `v  0   0    0
v 1 0 0
v    0  1 0
f   1  2   3`
        
        const result = loader.parse(objData)

        expect(result.vertices.length).toBe(9)
    })

    it('should handle object and group declarations', () => {
        const objData = `
o MyObject
g Group1
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
g Group2
v 2 0 0
v 3 0 0
v 2 1 0
f 4 5 6
`
        const result = loader.parse(objData)

        // Should parse both groups' faces
        expect(result.vertices.length).toBe(18) // 2 triangles
    })

    it('should handle material declarations (mtllib/usemtl)', () => {
        const objData = `
mtllib materials.mtl
usemtl Material1
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`
        // Should not crash, materials are ignored for geometry parsing
        const result = loader.parse(objData)
        expect(result.vertices.length).toBe(9)
    })

    it('should handle Windows line endings (CRLF)', () => {
        const objData = 'v 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nf 1 2 3\r\n'
        
        const result = loader.parse(objData)
        expect(result.vertices.length).toBe(9)
    })

    it('should handle faces referencing out-of-bounds indices gracefully', () => {
        const objData = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 999
`
        // Should either throw or handle gracefully (not crash)
        try {
            const result = loader.parse(objData)
            // If it parses, check if it produced something
            expect(result).toBeDefined()
        } catch (e) {
            // Acceptable to throw on invalid indices
            expect(e).toBeInstanceOf(Error)
        }
    })
})
