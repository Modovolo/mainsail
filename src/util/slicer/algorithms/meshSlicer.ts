/**
 * Mesh Slicer — Triangle-Plane Intersection
 *
 * Takes raw triangle vertices (flat Float32Array from Three.js BufferGeometry)
 * and intersects them with horizontal Z-planes to produce 2D contours per layer.
 *
 * Algorithm:
 * 1. Parse vertices into triangles, find Z bounds
 * 2. For each Z-plane, find all triangles that cross it
 * 3. Compute intersection line segments (triangle-plane intersection)
 * 4. Chain line segments into closed contours
 * 5. Compute winding / area to classify outer vs hole
 */

import { Vec2, Vec3, Triangle, Contour, SliceLayer, SlicerConfig } from '../types'

const EPSILON = 1e-6

/**
 * Parse a flat Float32Array of vertices into Triangle objects.
 * Every 9 floats = 1 triangle (3 vertices × 3 components).
 */
function parseTriangles(vertices: Float32Array): Triangle[] {
    const count = vertices.length / 9
    const triangles: Triangle[] = new Array(count)
    for (let i = 0; i < count; i++) {
        const o = i * 9
        triangles[i] = {
            a: { x: vertices[o], y: vertices[o + 1], z: vertices[o + 2] },
            b: { x: vertices[o + 3], y: vertices[o + 4], z: vertices[o + 5] },
            c: { x: vertices[o + 6], y: vertices[o + 7], z: vertices[o + 8] },
        }
    }
    return triangles
}

/**
 * Find min/max Z of the mesh
 */
function findZBounds(triangles: Triangle[]): { zMin: number; zMax: number } {
    let zMin = Infinity
    let zMax = -Infinity
    for (const t of triangles) {
        const lo = Math.min(t.a.z, t.b.z, t.c.z)
        const hi = Math.max(t.a.z, t.b.z, t.c.z)
        if (lo < zMin) zMin = lo
        if (hi > zMax) zMax = hi
    }
    return { zMin, zMax }
}

/**
 * Intersect one edge (p1→p2) with a Z-plane.
 * Returns the 2D intersection point or null if edge doesn't cross the plane.
 */
function edgePlaneIntersect(p1: Vec3, p2: Vec3, z: number): Vec2 | null {
    if ((p1.z < z && p2.z < z) || (p1.z > z && p2.z > z)) return null
    if (Math.abs(p1.z - p2.z) < EPSILON) return null

    const t = (z - p1.z) / (p2.z - p1.z)
    if (t < -EPSILON || t > 1 + EPSILON) return null

    return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
    }
}

/**
 * Intersect a triangle with a Z-plane.
 * Returns 0 or 1 line segment (two points).
 */
function trianglePlaneIntersect(tri: Triangle, z: number): [Vec2, Vec2] | null {
    const pts: Vec2[] = []

    const ab = edgePlaneIntersect(tri.a, tri.b, z)
    const bc = edgePlaneIntersect(tri.b, tri.c, z)
    const ca = edgePlaneIntersect(tri.c, tri.a, z)

    if (ab) pts.push(ab)
    if (bc) pts.push(bc)
    if (ca) pts.push(ca)

    // Need exactly 2 intersection points for a line segment
    if (pts.length < 2) return null

    // Deduplicate near-coincident points
    if (pts.length > 2) {
        // Take the two most distant points
        let maxDist = 0
        let best: [Vec2, Vec2] = [pts[0], pts[1]]
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2
                if (d > maxDist) {
                    maxDist = d
                    best = [pts[i], pts[j]]
                }
            }
        }
        return best
    }

    return [pts[0], pts[1]]
}

/**
 * Chain line segments into closed contours.
 * Segments are unordered — we build chains by matching endpoints.
 */
function chainSegments(segments: [Vec2, Vec2][]): Contour[] {
    if (segments.length === 0) return []

    const tolerance = 0.01 // mm
    const tolSq = tolerance * tolerance
    const used = new Array(segments.length).fill(false)
    const contours: Contour[] = []

    function ptEq(a: Vec2, b: Vec2): boolean {
        return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < tolSq
    }

    for (let start = 0; start < segments.length; start++) {
        if (used[start]) continue
        used[start] = true

        const chain: Vec2[] = [segments[start][0], segments[start][1]]
        let changed = true

        while (changed) {
            changed = false
            for (let i = 0; i < segments.length; i++) {
                if (used[i]) continue
                const [a, b] = segments[i]
                const head = chain[0]
                const tail = chain[chain.length - 1]

                if (ptEq(tail, a)) {
                    chain.push(b)
                    used[i] = true
                    changed = true
                } else if (ptEq(tail, b)) {
                    chain.push(a)
                    used[i] = true
                    changed = true
                } else if (ptEq(head, b)) {
                    chain.unshift(a)
                    used[i] = true
                    changed = true
                } else if (ptEq(head, a)) {
                    chain.unshift(b)
                    used[i] = true
                    changed = true
                }
            }
        }

        // Check if closed
        const closed = chain.length > 2 && ptEq(chain[0], chain[chain.length - 1])
        if (closed) chain.pop() // remove duplicate closing point

        const area = computeSignedArea(chain)

        contours.push({
            points: chain,
            closed,
            area,
        })
    }

    return contours
}

/**
 * Compute signed area of a polygon using the shoelace formula.
 * Positive = counter-clockwise (outer), Negative = clockwise (hole)
 */
function computeSignedArea(pts: Vec2[]): number {
    let area = 0
    const n = pts.length
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i].x * pts[j].y
        area -= pts[j].x * pts[i].y
    }
    return area / 2
}

/**
 * Sort layer contours: outer contours first (positive area), then holes (negative area).
 * Outer contours sorted by descending area.
 */
function sortContours(contours: Contour[]): Contour[] {
    const outer = contours.filter((c) => c.area > 0).sort((a, b) => b.area - a.area)
    const holes = contours.filter((c) => c.area <= 0).sort((a, b) => a.area - b.area)
    return [...outer, ...holes]
}

export interface SliceProgress {
    stage: string
    progress: number
    message: string
}

/**
 * Main slicing function.
 *
 * Takes raw vertex data and config, returns an array of SliceLayers
 * with 2D contours at each Z height.
 */
export function sliceMesh(
    vertices: Float32Array,
    config: SlicerConfig,
    onProgress?: (p: SliceProgress) => void
): SliceLayer[] {
    const triangles = parseTriangles(vertices)
    if (triangles.length === 0) return []

    const { zMin, zMax } = findZBounds(triangles)

    // Generate Z heights for each layer
    const zHeights: number[] = []
    let z = zMin + config.firstLayerHeight
    zHeights.push(z)
    z += config.layerHeight
    while (z <= zMax + EPSILON) {
        zHeights.push(z)
        z += config.layerHeight
    }

    if (zHeights.length === 0) return []

    // Pre-sort triangles by Z range for faster lookup
    // Build an interval list: for each triangle, store its zMin and zMax
    const triZRanges = triangles.map((t) => ({
        zMin: Math.min(t.a.z, t.b.z, t.c.z),
        zMax: Math.max(t.a.z, t.b.z, t.c.z),
    }))

    const layers: SliceLayer[] = []

    for (let li = 0; li < zHeights.length; li++) {
        const layerZ = zHeights[li]
        const segments: [Vec2, Vec2][] = []

        // Find all triangles that intersect this Z plane
        for (let ti = 0; ti < triangles.length; ti++) {
            if (triZRanges[ti].zMin > layerZ || triZRanges[ti].zMax < layerZ) continue
            const seg = trianglePlaneIntersect(triangles[ti], layerZ)
            if (seg) segments.push(seg)
        }

        // Chain segments into contours
        let contours = chainSegments(segments)
        contours = sortContours(contours)

        layers.push({
            z: layerZ,
            layerIndex: li,
            layerHeight: li === 0 ? config.firstLayerHeight : config.layerHeight,
            contours,
        })

        // Report progress
        if (onProgress && li % 10 === 0) {
            onProgress({
                stage: 'slicing',
                progress: (li / zHeights.length) * 100,
                message: `Slicing layer ${li + 1}/${zHeights.length} (Z=${layerZ.toFixed(2)}mm)`,
            })
        }
    }

    return layers
}
