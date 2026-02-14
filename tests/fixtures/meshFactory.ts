/**
 * Test Fixtures Factory
 * 
 * Functions to generate test STL, OBJ, and other mesh files
 * These are used by both unit tests and E2E tests
 */

/**
 * Create a minimal binary STL cube
 */
export function createCubeSTL(size = 10): ArrayBuffer {
    const triangles = 12
    const headerSize = 80
    const triangleSize = 50
    const totalSize = headerSize + 4 + triangles * triangleSize

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)

    // Write triangle count at offset 80
    view.setUint32(80, triangles, true)

    // Cube triangles
    const cubeData = [
        // Front face (z=size)
        { n: [0, 0, 1], v: [[0, 0, size], [size, 0, size], [size, size, size]] },
        { n: [0, 0, 1], v: [[0, 0, size], [size, size, size], [0, size, size]] },
        // Back face (z=0)
        { n: [0, 0, -1], v: [[size, 0, 0], [0, 0, 0], [0, size, 0]] },
        { n: [0, 0, -1], v: [[size, 0, 0], [0, size, 0], [size, size, 0]] },
        // Top face (y=size)
        { n: [0, 1, 0], v: [[0, size, 0], [0, size, size], [size, size, size]] },
        { n: [0, 1, 0], v: [[0, size, 0], [size, size, size], [size, size, 0]] },
        // Bottom face (y=0)
        { n: [0, -1, 0], v: [[0, 0, size], [0, 0, 0], [size, 0, 0]] },
        { n: [0, -1, 0], v: [[0, 0, size], [size, 0, 0], [size, 0, size]] },
        // Right face (x=size)
        { n: [1, 0, 0], v: [[size, 0, 0], [size, size, 0], [size, size, size]] },
        { n: [1, 0, 0], v: [[size, 0, 0], [size, size, size], [size, 0, size]] },
        // Left face (x=0)
        { n: [-1, 0, 0], v: [[0, 0, size], [0, size, size], [0, size, 0]] },
        { n: [-1, 0, 0], v: [[0, 0, size], [0, size, 0], [0, 0, 0]] },
    ]

    let offset = 84
    for (let i = 0; i < triangles; i++) {
        const tri = cubeData[i]
        
        // Normal
        view.setFloat32(offset, tri.n[0], true); offset += 4
        view.setFloat32(offset, tri.n[1], true); offset += 4
        view.setFloat32(offset, tri.n[2], true); offset += 4
        
        // Vertices
        for (const v of tri.v) {
            view.setFloat32(offset, v[0], true); offset += 4
            view.setFloat32(offset, v[1], true); offset += 4
            view.setFloat32(offset, v[2], true); offset += 4
        }
        
        // Attribute byte count
        view.setUint16(offset, 0, true); offset += 2
    }

    return buffer
}

/**
 * Create ASCII STL cube
 */
export function createASCIICubeSTL(size = 10): string {
    return `solid cube
facet normal 0 0 1
  outer loop
    vertex 0 0 ${size}
    vertex ${size} 0 ${size}
    vertex ${size} ${size} ${size}
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 ${size}
    vertex ${size} ${size} ${size}
    vertex 0 ${size} ${size}
  endloop
endfacet
facet normal 0 0 -1
  outer loop
    vertex ${size} 0 0
    vertex 0 0 0
    vertex 0 ${size} 0
  endloop
endfacet
facet normal 0 0 -1
  outer loop
    vertex ${size} 0 0
    vertex 0 ${size} 0
    vertex ${size} ${size} 0
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 ${size} 0
    vertex 0 ${size} ${size}
    vertex ${size} ${size} ${size}
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 ${size} 0
    vertex ${size} ${size} ${size}
    vertex ${size} ${size} 0
  endloop
endfacet
facet normal 0 -1 0
  outer loop
    vertex 0 0 ${size}
    vertex 0 0 0
    vertex ${size} 0 0
  endloop
endfacet
facet normal 0 -1 0
  outer loop
    vertex 0 0 ${size}
    vertex ${size} 0 0
    vertex ${size} 0 ${size}
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex ${size} 0 0
    vertex ${size} ${size} 0
    vertex ${size} ${size} ${size}
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex ${size} 0 0
    vertex ${size} ${size} ${size}
    vertex ${size} 0 ${size}
  endloop
endfacet
facet normal -1 0 0
  outer loop
    vertex 0 0 ${size}
    vertex 0 ${size} ${size}
    vertex 0 ${size} 0
  endloop
endfacet
facet normal -1 0 0
  outer loop
    vertex 0 0 ${size}
    vertex 0 ${size} 0
    vertex 0 0 0
  endloop
endfacet
endsolid cube`
}

/**
 * Create OBJ cube
 */
export function createCubeOBJ(size = 10): string {
    return `# Cube OBJ file
o Cube

# Vertices
v 0 0 0
v ${size} 0 0
v ${size} ${size} 0
v 0 ${size} 0
v 0 0 ${size}
v ${size} 0 ${size}
v ${size} ${size} ${size}
v 0 ${size} ${size}

# Normals
vn 0 0 -1
vn 0 0 1
vn 0 -1 0
vn 0 1 0
vn -1 0 0
vn 1 0 0

# Faces
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
 * Create a pyramid STL (non-cube shape for variety)
 */
export function createPyramidSTL(baseSize = 10, height = 15): ArrayBuffer {
    const triangles = 6 // 4 sides + 2 for base
    const headerSize = 80
    const triangleSize = 50
    const totalSize = headerSize + 4 + triangles * triangleSize

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)

    view.setUint32(80, triangles, true)

    const half = baseSize / 2
    const apex = [half, half, height]
    
    const pyramidData = [
        // Front face
        { n: [0, -1, 0.5], v: [[0, 0, 0], [baseSize, 0, 0], apex] },
        // Right face
        { n: [1, 0, 0.5], v: [[baseSize, 0, 0], [baseSize, baseSize, 0], apex] },
        // Back face
        { n: [0, 1, 0.5], v: [[baseSize, baseSize, 0], [0, baseSize, 0], apex] },
        // Left face
        { n: [-1, 0, 0.5], v: [[0, baseSize, 0], [0, 0, 0], apex] },
        // Base (2 triangles)
        { n: [0, 0, -1], v: [[0, 0, 0], [0, baseSize, 0], [baseSize, baseSize, 0]] },
        { n: [0, 0, -1], v: [[0, 0, 0], [baseSize, baseSize, 0], [baseSize, 0, 0]] },
    ]

    let offset = 84
    for (const tri of pyramidData) {
        view.setFloat32(offset, tri.n[0], true); offset += 4
        view.setFloat32(offset, tri.n[1], true); offset += 4
        view.setFloat32(offset, tri.n[2], true); offset += 4
        
        for (const v of tri.v) {
            view.setFloat32(offset, v[0], true); offset += 4
            view.setFloat32(offset, v[1], true); offset += 4
            view.setFloat32(offset, v[2], true); offset += 4
        }
        
        view.setUint16(offset, 0, true); offset += 2
    }

    return buffer
}

/**
 * Create a cylinder approximation STL
 */
export function createCylinderSTL(radius = 5, height = 20, segments = 16): ArrayBuffer {
    // Each segment has 2 triangles on the side + 1 on top + 1 on bottom = 4
    const triangles = segments * 4
    const headerSize = 80
    const triangleSize = 50
    const totalSize = headerSize + 4 + triangles * triangleSize

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)

    view.setUint32(80, triangles, true)

    let offset = 84
    
    const center = radius // Center at (radius, radius)
    
    for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2
        const angle2 = ((i + 1) / segments) * Math.PI * 2
        
        const x1 = center + Math.cos(angle1) * radius
        const y1 = center + Math.sin(angle1) * radius
        const x2 = center + Math.cos(angle2) * radius
        const y2 = center + Math.sin(angle2) * radius
        
        const nx = Math.cos((angle1 + angle2) / 2)
        const ny = Math.sin((angle1 + angle2) / 2)
        
        // Side triangle 1
        writeTriangle(view, offset, [nx, ny, 0], [[x1, y1, 0], [x2, y2, 0], [x2, y2, height]])
        offset += 50
        
        // Side triangle 2
        writeTriangle(view, offset, [nx, ny, 0], [[x1, y1, 0], [x2, y2, height], [x1, y1, height]])
        offset += 50
        
        // Top triangle
        writeTriangle(view, offset, [0, 0, 1], [[center, center, height], [x1, y1, height], [x2, y2, height]])
        offset += 50
        
        // Bottom triangle
        writeTriangle(view, offset, [0, 0, -1], [[center, center, 0], [x2, y2, 0], [x1, y1, 0]])
        offset += 50
    }

    return buffer
}

function writeTriangle(view: DataView, offset: number, normal: number[], vertices: number[][]) {
    view.setFloat32(offset, normal[0], true)
    view.setFloat32(offset + 4, normal[1], true)
    view.setFloat32(offset + 8, normal[2], true)
    
    let o = offset + 12
    for (const v of vertices) {
        view.setFloat32(o, v[0], true)
        view.setFloat32(o + 4, v[1], true)
        view.setFloat32(o + 8, v[2], true)
        o += 12
    }
    
    view.setUint16(o, 0, true)
}

/**
 * Create invalid/malformed STL for error testing
 */
export function createMalformedSTL(): ArrayBuffer {
    const buffer = new ArrayBuffer(100) // Too short
    const view = new DataView(buffer)
    view.setUint32(80, 1000, true) // Claims 1000 triangles but buffer is tiny
    return buffer
}

/**
 * Create empty STL (valid header, 0 triangles)
 */
export function createEmptySTL(): ArrayBuffer {
    const buffer = new ArrayBuffer(84)
    const view = new DataView(buffer)
    view.setUint32(80, 0, true)
    return buffer
}
