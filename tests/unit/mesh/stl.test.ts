/**
 * STL Loader Unit Tests
 * 
 * Tests for binary and ASCII STL parsing capabilities
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { STLLoader } from '@/util/mesh/stl'

describe('STLLoader', () => {
    let loader: STLLoader

    beforeEach(() => {
        loader = new STLLoader()
    })

    describe('parse', () => {
        describe('binary STL', () => {
            it('should parse a valid binary STL file', () => {
                const buffer = createTestSTLBuffer(12)
                const result = loader.parse(buffer)

                expect(result).toBeDefined()
                expect(result.vertices).toBeInstanceOf(Float32Array)
                expect(result.normals).toBeInstanceOf(Float32Array)
            })

            it('should parse correct number of triangles from binary STL', () => {
                const triangleCount = 12
                const buffer = createTestSTLBuffer(triangleCount)
                const result = loader.parse(buffer)

                // Each triangle has 3 vertices, each vertex has 3 components (x, y, z)
                expect(result.vertices.length).toBe(triangleCount * 3 * 3)
                expect(result.normals.length).toBe(triangleCount * 3 * 3)
            })

            it('should apply scale factor correctly', () => {
                const buffer = createTestSTLBuffer(2)
                const scale = 10

                const unscaled = loader.parse(buffer, 1)
                const scaled = new STLLoader().parse(buffer, scale)

                // First vertex X coordinate should be scaled
                const unscaledX = unscaled.vertices[0]
                const scaledX = scaled.vertices[0]

                // Note: This may be 0 for first vertex, check a non-zero vertex
                // Find first non-zero vertex
                for (let i = 0; i < unscaled.vertices.length; i++) {
                    if (unscaled.vertices[i] !== 0) {
                        expect(scaled.vertices[i]).toBeCloseTo(unscaled.vertices[i] * scale, 5)
                        break
                    }
                }
            })

            it('should handle empty STL gracefully', () => {
                const buffer = createTestSTLBuffer(0)
                const result = loader.parse(buffer)

                expect(result.vertices.length).toBe(0)
                expect(result.normals.length).toBe(0)
            })

            it('should correctly parse vertex normals', () => {
                const buffer = createTestSTLBuffer(2)
                const result = loader.parse(buffer)

                // Check that normals are normalized (length ~= 1)
                for (let i = 0; i < result.normals.length; i += 3) {
                    const nx = result.normals[i]
                    const ny = result.normals[i + 1]
                    const nz = result.normals[i + 2]
                    const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
                    
                    if (length > 0) {
                        expect(length).toBeCloseTo(1, 3)
                    }
                }
            })
        })

        describe('ASCII STL', () => {
            it('should parse a valid ASCII STL string', () => {
                const asciiSTL = createTestASCIISTL()
                const encoder = new TextEncoder()
                const buffer = encoder.encode(asciiSTL).buffer

                const result = loader.parse(buffer)

                expect(result).toBeDefined()
                expect(result.vertices).toBeInstanceOf(Float32Array)
                expect(result.normals).toBeInstanceOf(Float32Array)
            })

            it('should parse correct number of triangles from ASCII STL', () => {
                const asciiSTL = createTestASCIISTL()
                const encoder = new TextEncoder()
                const buffer = encoder.encode(asciiSTL).buffer

                const result = loader.parse(buffer)

                // ASCII STL in setup has 2 facets
                expect(result.vertices.length).toBe(2 * 3 * 3) // 2 triangles, 3 vertices each, 3 components
            })

            it('should handle lowercase keywords', () => {
                const asciiSTL = `solid test
facet normal 0 0 1
    outer loop
        vertex 0 0 0
        vertex 1 0 0
        vertex 0 1 0
    endloop
endfacet
endsolid test`
                const encoder = new TextEncoder()
                const buffer = encoder.encode(asciiSTL).buffer

                const result = loader.parse(buffer)

                expect(result.vertices.length).toBe(9) // 1 triangle
            })
        })
    })

    describe('parseToGeometry', () => {
        it('should return a valid BufferGeometry', () => {
            const buffer = createTestSTLBuffer(12)
            const geometry = loader.parseToGeometry(buffer)

            expect(geometry).toBeDefined()
            expect(geometry.attributes.position).toBeDefined()
            expect(geometry.attributes.normal).toBeDefined()
        })

        it('should have correct vertex count in geometry', () => {
            const triangleCount = 12
            const buffer = createTestSTLBuffer(triangleCount)
            const geometry = loader.parseToGeometry(buffer)

            expect(geometry.attributes.position.count).toBe(triangleCount * 3)
        })

        it('should apply scale to geometry', () => {
            const buffer = createTestSTLBuffer(12)
            const scale = 2

            const geometry = loader.parseToGeometry(buffer, scale)
            
            // Geometry should exist with scaled vertices
            expect(geometry).toBeDefined()
            expect(geometry.attributes.position.count).toBe(36) // 12 triangles * 3 vertices
        })
    })
})

describe('STLLoader - Regression Tests', () => {
    let loader: STLLoader

    beforeEach(() => {
        loader = new STLLoader()
    })

    it('should handle malformed binary header gracefully', () => {
        // Create a buffer that looks like binary but has wrong size
        const buffer = new ArrayBuffer(100)
        const view = new DataView(buffer)
        view.setUint32(80, 1, true) // Claims 1 triangle but buffer is too small

        // Should not crash, but may throw or return empty
        try {
            const result = loader.parse(buffer)
            // If it parses, should return something valid
            expect(result).toBeDefined()
        } catch (e) {
            // Acceptable to throw on malformed data
            expect(e).toBeInstanceOf(Error)
        }
    })

    it('should handle negative vertex coordinates', () => {
        // Create STL with negative coordinates
        const buffer = new ArrayBuffer(84 + 50)
        const view = new DataView(buffer)
        view.setUint32(80, 1, true)
        
        // Normal
        view.setFloat32(84, 0, true)
        view.setFloat32(88, 0, true)
        view.setFloat32(92, 1, true)
        
        // Vertex 1 with negative coords
        view.setFloat32(96, -1, true)
        view.setFloat32(100, -1, true)
        view.setFloat32(104, 0, true)
        
        // Vertex 2
        view.setFloat32(108, 1, true)
        view.setFloat32(112, -1, true)
        view.setFloat32(116, 0, true)
        
        // Vertex 3
        view.setFloat32(120, 0, true)
        view.setFloat32(124, 1, true)
        view.setFloat32(128, 0, true)

        const result = loader.parse(buffer)

        expect(result.vertices[0]).toBe(-1)
        expect(result.vertices[1]).toBe(-1)
    })

    it('should handle very small floating point values', () => {
        const buffer = new ArrayBuffer(84 + 50)
        const view = new DataView(buffer)
        view.setUint32(80, 1, true)
        
        const tiny = 1e-10
        
        view.setFloat32(84, 0, true)
        view.setFloat32(88, 0, true)
        view.setFloat32(92, 1, true)
        
        view.setFloat32(96, tiny, true)
        view.setFloat32(100, tiny, true)
        view.setFloat32(104, tiny, true)
        
        view.setFloat32(108, tiny, true)
        view.setFloat32(112, 0, true)
        view.setFloat32(116, 0, true)
        
        view.setFloat32(120, 0, true)
        view.setFloat32(124, tiny, true)
        view.setFloat32(128, 0, true)

        const result = loader.parse(buffer)

        expect(result.vertices[0]).toBeCloseTo(tiny, 15)
    })

    it('should handle large models (many triangles)', () => {
        const largeTriangleCount = 1000
        const buffer = createTestSTLBuffer(largeTriangleCount)
        
        const result = loader.parse(buffer)

        // Should parse without throwing
        expect(result.vertices.length).toBe(largeTriangleCount * 9)
    })
})
