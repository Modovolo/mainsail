/**
 * Vitest Setup File
 * 
 * Global test configuration and mocks
 */

import { vi } from 'vitest'

// Mock Three.js for non-WebGL environments
vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three')
    return {
        ...actual,
        WebGLRenderer: vi.fn().mockImplementation(() => ({
            setSize: vi.fn(),
            setPixelRatio: vi.fn(),
            render: vi.fn(),
            dispose: vi.fn(),
            domElement: document.createElement('canvas'),
        })),
    }
})

// Global test utilities
declare global {
    function createTestSTLBuffer(triangles?: number): ArrayBuffer
    function createTestOBJString(): string
}

/**
 * Create a minimal binary STL buffer for testing
 * Creates a simple cube by default (12 triangles)
 */
globalThis.createTestSTLBuffer = function (triangles = 12): ArrayBuffer {
    // Binary STL format:
    // 80 bytes header
    // 4 bytes triangle count
    // For each triangle: 50 bytes (12 floats + 2 bytes attribute)
    const headerSize = 80
    const triangleCountSize = 4
    const triangleSize = 50 // 12 floats (normal + 3 vertices) + 2 bytes attr
    const totalSize = headerSize + triangleCountSize + triangles * triangleSize

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)

    // Write header (can contain text, we use zeros)
    // Header is already zeros

    // Write triangle count
    view.setUint32(80, triangles, true)

    // Create simple cube triangles
    // Each face has 2 triangles, cube has 6 faces = 12 triangles
    const cubeVertices = [
        // Front face (z=1)
        { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1]] },
        { n: [0, 0, 1], v: [[0, 0, 1], [1, 1, 1], [0, 1, 1]] },
        // Back face (z=0)
        { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] },
        { n: [0, 0, -1], v: [[1, 0, 0], [0, 1, 0], [1, 1, 0]] },
        // Top face (y=1)
        { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1]] },
        { n: [0, 1, 0], v: [[0, 1, 0], [1, 1, 1], [1, 1, 0]] },
        // Bottom face (y=0)
        { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0]] },
        { n: [0, -1, 0], v: [[0, 0, 1], [1, 0, 0], [1, 0, 1]] },
        // Right face (x=1)
        { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1]] },
        { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 1], [1, 0, 1]] },
        // Left face (x=0)
        { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0]] },
        { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 0], [0, 0, 0]] },
    ]

    let offset = 84
    for (let i = 0; i < Math.min(triangles, cubeVertices.length); i++) {
        const tri = cubeVertices[i]
        
        // Normal
        view.setFloat32(offset, tri.n[0], true); offset += 4
        view.setFloat32(offset, tri.n[1], true); offset += 4
        view.setFloat32(offset, tri.n[2], true); offset += 4
        
        // 3 vertices
        for (const vertex of tri.v) {
            view.setFloat32(offset, vertex[0], true); offset += 4
            view.setFloat32(offset, vertex[1], true); offset += 4
            view.setFloat32(offset, vertex[2], true); offset += 4
        }
        
        // Attribute byte count (unused, set to 0)
        view.setUint16(offset, 0, true); offset += 2
    }
    
    // Fill remaining triangles with zeros if more requested
    for (let i = cubeVertices.length; i < triangles; i++) {
        offset += 50
    }

    return buffer
}

/**
 * Create a minimal OBJ file string for testing
 */
globalThis.createTestOBJString = function (): string {
    // Simple cube OBJ
    return `# Test Cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1

vn 0 0 -1
vn 0 0 1
vn 0 -1 0
vn 0 1 0
vn -1 0 0
vn 1 0 0

f 1//1 2//1 3//1
f 1//1 3//1 4//1
f 5//2 7//2 6//2
f 5//2 8//2 7//2
f 1//3 6//3 2//3
f 1//3 5//3 6//3
f 4//4 3//4 7//4
f 4//4 7//4 8//4
f 1//5 4//5 8//5
f 1//5 8//5 5//5
f 2//6 6//6 7//6
f 2//6 7//6 3//6
`
}

/**
 * Create ASCII STL string for testing
 */
globalThis.createTestASCIISTL = function (): string {
    return `solid test
facet normal 0 0 1
    outer loop
        vertex 0 0 1
        vertex 1 0 1
        vertex 1 1 1
    endloop
endfacet
facet normal 0 0 1
    outer loop
        vertex 0 0 1
        vertex 1 1 1
        vertex 0 1 1
    endloop
endfacet
endsolid test
`
}

declare global {
    function createTestASCIISTL(): string
}
