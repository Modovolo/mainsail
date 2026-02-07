/**
 * OBJ Loader - Simple Wavefront OBJ parser
 * Handles vertices, texture coordinates, normals, and faces.
 */

import * as THREE from 'three'

export interface OBJParseResult {
    vertices: Float32Array
    normals: Float32Array | null
    uvs: Float32Array | null
}

export class OBJLoader {
    /**
     * Parse OBJ file content
     */
    parse(data: string): OBJParseResult {
        const vertices: number[] = []
        const normals: number[] = []
        const uvs: number[] = []
        
        const positionData: number[][] = []
        const normalData: number[][] = []
        const uvData: number[][] = []
        
        const lines = data.split('\n')
        
        for (let line of lines) {
            line = line.trim()
            if (line.length === 0 || line.startsWith('#')) continue
            
            const parts = line.split(/\s+/)
            const type = parts[0]
            
            switch (type) {
                case 'v': // Vertex position
                    positionData.push([
                        parseFloat(parts[1]) || 0,
                        parseFloat(parts[2]) || 0,
                        parseFloat(parts[3]) || 0,
                    ])
                    break
                    
                case 'vn': // Vertex normal
                    normalData.push([
                        parseFloat(parts[1]) || 0,
                        parseFloat(parts[2]) || 0,
                        parseFloat(parts[3]) || 0,
                    ])
                    break
                    
                case 'vt': // Texture coordinate
                    uvData.push([
                        parseFloat(parts[1]) || 0,
                        parseFloat(parts[2]) || 0,
                    ])
                    break
                    
                case 'f': // Face
                    this.parseFace(parts.slice(1), positionData, normalData, uvData, vertices, normals, uvs)
                    break
            }
        }
        
        return {
            vertices: new Float32Array(vertices),
            normals: normals.length > 0 ? new Float32Array(normals) : null,
            uvs: uvs.length > 0 ? new Float32Array(uvs) : null,
        }
    }

    /**
     * Parse and return a Three.js BufferGeometry
     */
    parseToGeometry(data: string): THREE.BufferGeometry {
        const result = this.parse(data)
        const geometry = new THREE.BufferGeometry()
        
        geometry.setAttribute('position', new THREE.BufferAttribute(result.vertices, 3))
        
        if (result.normals) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3))
        } else {
            geometry.computeVertexNormals()
        }
        
        if (result.uvs) {
            geometry.setAttribute('uv', new THREE.BufferAttribute(result.uvs, 2))
        }
        
        return geometry
    }

    private parseFace(
        parts: string[],
        positions: number[][],
        normals: number[][],
        uvs: number[][],
        outVertices: number[],
        outNormals: number[],
        outUvs: number[]
    ): void {
        // Triangulate polygon faces (assuming convex)
        const indices: Array<{ v: number; vt: number; vn: number }> = []
        
        for (const part of parts) {
            const [vStr, vtStr, vnStr] = part.split('/')
            indices.push({
                v: parseInt(vStr) - 1 || 0,
                vt: vtStr ? parseInt(vtStr) - 1 : -1,
                vn: vnStr ? parseInt(vnStr) - 1 : -1,
            })
        }
        
        // Triangulate (fan triangulation)
        for (let i = 1; i < indices.length - 1; i++) {
            const tri = [indices[0], indices[i], indices[i + 1]]
            
            for (const idx of tri) {
                // Position
                const pos = positions[idx.v]
                if (pos) {
                    outVertices.push(pos[0], pos[1], pos[2])
                } else {
                    outVertices.push(0, 0, 0)
                }
                
                // Normal
                if (idx.vn >= 0 && normals[idx.vn]) {
                    const norm = normals[idx.vn]
                    outNormals.push(norm[0], norm[1], norm[2])
                }
                
                // UV
                if (idx.vt >= 0 && uvs[idx.vt]) {
                    const uv = uvs[idx.vt]
                    outUvs.push(uv[0], uv[1])
                }
            }
        }
    }
}

export default OBJLoader
