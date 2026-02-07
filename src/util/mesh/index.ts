/**
 * Mesh Loaders - Index file
 * 
 * Provides unified access to STL, 3MF, and OBJ loaders.
 * Adapted from Kiri:Moto (MIT License).
 */

export { STLLoader, encodeSTL } from './stl'
export { ThreeMFLoader, encode3MF } from './threemf'
export { OBJLoader } from './obj'
export { PrepareWidget } from './widget'
export { Platform } from './platform'
export type { PlatformConfig } from './platform'
export { Packer, packBlocks, findNonCollidingPosition } from './packer'

import * as THREE from 'three'
import { STLLoader } from './stl'
import { ThreeMFLoader } from './threemf'
import { OBJLoader } from './obj'

export interface LoadResult {
    geometries: Array<{ name: string; geometry: THREE.BufferGeometry }>
    bounds: THREE.Box3
    triangleCount: number
    vertexCount: number
}

/**
 * Load a mesh file and return Three.js geometries
 * Automatically detects format from file extension or content
 */
export async function loadMeshFile(
    file: File,
    options: { scale?: number } = {}
): Promise<LoadResult> {
    const { scale = 1 } = options
    const extension = getFileExtension(file.name)
    
    const buffer = await file.arrayBuffer()
    
    let geometries: Array<{ name: string; geometry: THREE.BufferGeometry }> = []
    
    switch (extension) {
        case 'stl': {
            const loader = new STLLoader()
            const geometry = loader.parseToGeometry(buffer, scale)
            geometries.push({ name: file.name, geometry })
            break
        }
        
        case '3mf': {
            const loader = new ThreeMFLoader()
            geometries = await loader.parseToGeometries(buffer)
            break
        }
        
        case 'obj': {
            const text = await file.text()
            const loader = new OBJLoader()
            const geometry = loader.parseToGeometry(text)
            geometries.push({ name: file.name, geometry })
            break
        }
        
        default:
            throw new Error(`Unsupported file format: ${extension}`)
    }
    
    // Compute bounds and stats
    const bounds = new THREE.Box3()
    let triangleCount = 0
    let vertexCount = 0
    
    for (const { geometry } of geometries) {
        geometry.computeBoundingBox()
        if (geometry.boundingBox) {
            bounds.union(geometry.boundingBox)
        }
        
        const positions = geometry.attributes.position
        if (positions) {
            vertexCount += positions.count
            triangleCount += positions.count / 3
        }
    }
    
    return { geometries, bounds, triangleCount, vertexCount }
}

/**
 * Center geometry on the build plate
 */
export function centerGeometryOnPlate(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox()
    
    if (!geometry.boundingBox) return
    
    const center = new THREE.Vector3()
    geometry.boundingBox.getCenter(center)
    
    // Center X and Z, place bottom on plate (Y=0)
    geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z)
}

/**
 * Calculate mesh volume (assumes watertight mesh)
 * Uses signed tetrahedron volume method
 */
export function calculateVolume(geometry: THREE.BufferGeometry): number {
    const positions = geometry.attributes.position
    if (!positions) return 0
    
    let volume = 0
    const p1 = new THREE.Vector3()
    const p2 = new THREE.Vector3()
    const p3 = new THREE.Vector3()
    
    for (let i = 0; i < positions.count; i += 3) {
        p1.fromBufferAttribute(positions, i)
        p2.fromBufferAttribute(positions, i + 1)
        p3.fromBufferAttribute(positions, i + 2)
        
        // Signed volume of tetrahedron formed with origin
        volume += signedVolumeOfTriangle(p1, p2, p3)
    }
    
    return Math.abs(volume)
}

function signedVolumeOfTriangle(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3
): number {
    return p1.dot(p2.clone().cross(p3)) / 6
}

/**
 * Check if mesh is watertight (manifold)
 * Simple check: every edge should be shared by exactly 2 faces
 */
export function checkWatertight(geometry: THREE.BufferGeometry): boolean {
    const positions = geometry.attributes.position
    if (!positions) return false
    
    const edgeCount = new Map<string, number>()
    
    for (let i = 0; i < positions.count; i += 3) {
        for (let j = 0; j < 3; j++) {
            const v1 = i + j
            const v2 = i + ((j + 1) % 3)
            
            const key = makeEdgeKey(positions, v1, v2)
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
        }
    }
    
    // Every edge should appear exactly twice
    for (const count of edgeCount.values()) {
        if (count !== 2) return false
    }
    
    return true
}

function makeEdgeKey(
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    i1: number,
    i2: number
): string {
    const x1 = positions.getX(i1).toFixed(6)
    const y1 = positions.getY(i1).toFixed(6)
    const z1 = positions.getZ(i1).toFixed(6)
    const x2 = positions.getX(i2).toFixed(6)
    const y2 = positions.getY(i2).toFixed(6)
    const z2 = positions.getZ(i2).toFixed(6)
    
    const key1 = `${x1},${y1},${z1}-${x2},${y2},${z2}`
    const key2 = `${x2},${y2},${z2}-${x1},${y1},${z1}`
    
    return key1 < key2 ? key1 : key2
}

function getFileExtension(filename: string): string {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}
