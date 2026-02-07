/**
 * STL Loader - Adapted from Kiri:Moto (MIT License)
 * Copyright Stewart Allen <sa@grid.space>
 * 
 * Handles both ASCII and binary STL file formats.
 */

import * as THREE from 'three'

export interface STLParseResult {
    vertices: Float32Array
    normals: Float32Array
    colors: Float32Array | null
}

export class STLLoader {
    private vertices: Float32Array | null = null
    private normals: Float32Array | null = null
    private colors: Float32Array | null = null

    /**
     * Parse STL data from ArrayBuffer
     */
    parse(data: ArrayBuffer, scale = 1): STLParseResult {
        const binData = this.ensureBinary(data)
        
        if (this.isBinary(binData)) {
            return this.parseBinary(binData, scale)
        } else {
            return this.parseASCII(this.convertToString(data), scale)
        }
    }

    /**
     * Parse and return a Three.js BufferGeometry
     */
    parseToGeometry(data: ArrayBuffer, scale = 1): THREE.BufferGeometry {
        const result = this.parse(data, scale)
        const geometry = new THREE.BufferGeometry()
        
        geometry.setAttribute('position', new THREE.BufferAttribute(result.vertices, 3))
        geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3))
        
        if (result.colors) {
            geometry.setAttribute('color', new THREE.BufferAttribute(result.colors, 3))
        }
        
        return geometry
    }

    private isBinary(data: ArrayBuffer): boolean {
        const reader = new DataView(data)
        const faceSize = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8) // 50 bytes
        const nFaces = reader.getUint32(80, true)
        const expectedLength = 80 + 4 + (nFaces * faceSize)
        return expectedLength === data.byteLength
    }

    private parseBinary(data: ArrayBuffer, scale = 1): STLParseResult {
        const reader = new DataView(data)
        const faces = reader.getUint32(80, true)
        
        let hasColors = false
        let defaultR = 0, defaultG = 0, defaultB = 0

        // Check for COLOR= header
        for (let index = 0; index < 70; index++) {
            if (
                reader.getUint32(index, false) === 0x434F4C4F && // 'COLO'
                reader.getUint8(index + 4) === 0x52 && // 'R'
                reader.getUint8(index + 5) === 0x3D    // '='
            ) {
                hasColors = true
                defaultR = reader.getUint8(index + 6) / 255
                defaultG = reader.getUint8(index + 7) / 255
                defaultB = reader.getUint8(index + 8) / 255
                break
            }
        }

        const vertices = new Float32Array(faces * 3 * 3)
        const normals = new Float32Array(faces * 3 * 3)
        const colors = hasColors ? new Float32Array(faces * 3 * 3) : null

        let offset = 0
        const faceLength = 50 // bytes per triangle

        for (let face = 0; face < faces; face++) {
            const start = 84 + face * faceLength
            
            const normalX = reader.getFloat32(start, true)
            const normalY = reader.getFloat32(start + 4, true)
            const normalZ = reader.getFloat32(start + 8, true)

            let r = defaultR, g = defaultG, b = defaultB
            
            if (hasColors) {
                const packedColor = reader.getUint16(start + 48, true)
                if ((packedColor & 0x8000) === 0) {
                    r = (packedColor & 0x1F) / 31
                    g = ((packedColor >> 5) & 0x1F) / 31
                    b = ((packedColor >> 10) & 0x1F) / 31
                }
            }

            // Read 3 vertices
            for (let i = 1; i <= 3; i++) {
                const vertexStart = start + i * 12
                
                vertices[offset] = reader.getFloat32(vertexStart, true) * scale
                vertices[offset + 1] = reader.getFloat32(vertexStart + 4, true) * scale
                vertices[offset + 2] = reader.getFloat32(vertexStart + 8, true) * scale
                
                normals[offset] = normalX
                normals[offset + 1] = normalY
                normals[offset + 2] = normalZ
                
                if (colors) {
                    colors[offset] = r
                    colors[offset + 1] = g
                    colors[offset + 2] = b
                }
                
                offset += 3
            }
        }

        return { vertices, normals, colors }
    }

    private parseASCII(data: string, scale = 1): STLParseResult {
        const vertices: number[] = []
        const normals: number[] = []
        
        const patternFace = /facet([\s\S]*?)endfacet/g
        const patternNormal = /normal\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)/
        const patternVertex = /vertex\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)\s+([\-+]?\d*\.?\d+(?:[eE][\-+]?\d+)?)/g

        let match
        while ((match = patternFace.exec(data)) !== null) {
            const faceText = match[0]
            
            // Parse normal
            const normalMatch = patternNormal.exec(faceText)
            const nx = normalMatch ? parseFloat(normalMatch[1]) : 0
            const ny = normalMatch ? parseFloat(normalMatch[2]) : 0
            const nz = normalMatch ? parseFloat(normalMatch[3]) : 0

            // Parse vertices
            let vertexMatch
            let vertCount = 0
            while ((vertexMatch = patternVertex.exec(faceText)) !== null && vertCount < 3) {
                vertices.push(
                    parseFloat(vertexMatch[1]) * scale,
                    parseFloat(vertexMatch[2]) * scale,
                    parseFloat(vertexMatch[3]) * scale
                )
                normals.push(nx, ny, nz)
                vertCount++
            }
        }

        return {
            vertices: new Float32Array(vertices),
            normals: new Float32Array(normals),
            colors: null
        }
    }

    private ensureBinary(data: ArrayBuffer | string): ArrayBuffer {
        if (typeof data === 'string') {
            const array = new Uint8Array(data.length)
            for (let i = 0; i < data.length; i++) {
                array[i] = data.charCodeAt(i) & 0xff
            }
            return array.buffer
        }
        return data
    }

    private convertToString(buf: ArrayBuffer): string {
        const array = new Uint8Array(buf)
        let str = ''
        for (let i = 0; i < array.length; i++) {
            str += String.fromCharCode(array[i])
        }
        return str
    }
}

/**
 * Encode vertex arrays to binary STL format
 */
export function encodeSTL(
    records: Array<{ file: string; vertices: Float32Array }>,
    header = ''
): Uint8Array {
    // Calculate total vertices
    let totalVertices = 0
    for (const rec of records) {
        totalVertices += rec.vertices.length / 3
    }

    const triangleCount = totalVertices / 3
    // 80 byte header + 4 byte count + 50 bytes per triangle
    const buffer = new Uint8Array(80 + 4 + triangleCount * 50)
    const view = new DataView(buffer.buffer)
    let pos = 84

    // Write header
    const headerBytes = header.substring(0, 80)
    for (let i = 0; i < headerBytes.length; i++) {
        view.setUint8(i, headerBytes.charCodeAt(i))
    }

    // Write triangle count
    view.setUint32(80, triangleCount, true)

    // Write triangles
    for (const rec of records) {
        const varr = rec.vertices
        for (let i = 0; i < varr.length; i += 9) {
            // Compute face normal
            const p0 = new THREE.Vector3(varr[i], varr[i + 1], varr[i + 2])
            const p1 = new THREE.Vector3(varr[i + 3], varr[i + 4], varr[i + 5])
            const p2 = new THREE.Vector3(varr[i + 6], varr[i + 7], varr[i + 8])
            
            const edge1 = new THREE.Vector3().subVectors(p1, p0)
            const edge2 = new THREE.Vector3().subVectors(p2, p0)
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()

            // Write normal
            view.setFloat32(pos, normal.x, true)
            view.setFloat32(pos + 4, normal.y, true)
            view.setFloat32(pos + 8, normal.z, true)

            // Write vertices
            view.setFloat32(pos + 12, p0.x, true)
            view.setFloat32(pos + 16, p0.y, true)
            view.setFloat32(pos + 20, p0.z, true)
            view.setFloat32(pos + 24, p1.x, true)
            view.setFloat32(pos + 28, p1.y, true)
            view.setFloat32(pos + 32, p1.z, true)
            view.setFloat32(pos + 36, p2.x, true)
            view.setFloat32(pos + 40, p2.y, true)
            view.setFloat32(pos + 44, p2.z, true)

            // Attribute byte count
            view.setUint16(pos + 48, 0, true)

            pos += 50
        }
    }

    return buffer
}

export default STLLoader
