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
    // Both strictly below or strictly above the plane
    if ((p1.z < z - EPSILON && p2.z < z - EPSILON) || (p1.z > z + EPSILON && p2.z > z + EPSILON)) return null
    // Edge is coplanar — skip and let the Z-nudge mechanism handle it
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
 * Returns 0 or 1 DIRECTED line segment (two points ordered by face normal).
 *
 * The segment direction is determined by the triangle's face normal so that
 * when segments are chained, outer boundaries wind CCW (positive area) and
 * holes wind CW (negative area).  This is the standard approach used by
 * production slicers (PrusaSlicer, Slic3r).
 *
 * The ordering criterion: the segment's 2D left-normal (-dy, dx) should
 * point in the same direction as the face normal's XY projection.
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
        pts[0] = best[0]
        pts[1] = best[1]
    }

    // Compute face normal N = (B-A) × (C-A)
    const e1x = tri.b.x - tri.a.x, e1y = tri.b.y - tri.a.y, e1z = tri.b.z - tri.a.z
    const e2x = tri.c.x - tri.a.x, e2y = tri.c.y - tri.a.y, e2z = tri.c.z - tri.a.z
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z

    // Segment direction: d = pts[1] - pts[0]
    const dx = pts[1].x - pts[0].x
    const dy = pts[1].y - pts[0].y

    // Left-normal of segment (-dy, dx) should oppose face normal XY (nx, ny)
    // for outer surfaces (outward normal), giving CCW winding.
    // Equivalently: right-normal (dy, -dx) should align with face normal.
    // dot = (-dy)*nx + dx*ny; swap when dot > 0.
    const dot = -dy * nx + dx * ny

    if (dot > 0) {
        return [pts[1], pts[0]]
    }

    return [pts[0], pts[1]]
}

/**
 * Chain line segments into closed contours.
 * Segments are directed (from trianglePlaneIntersect face-normal ordering).
 * Prefers head-to-tail matching to preserve winding direction; falls back to
 * reversed matching for floating-point gaps.
 */
function chainSegments(segments: [Vec2, Vec2][]): Contour[] {
    if (segments.length === 0) return []

    const tolerance = 0.05 // mm — generous to handle FP gaps in complex meshes
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

            // Pass 1: directed matching (head-to-tail) — preserves winding
            for (let i = 0; i < segments.length; i++) {
                if (used[i]) continue
                const [a, b] = segments[i]
                const head = chain[0]
                const tail = chain[chain.length - 1]

                if (ptEq(tail, a)) {
                    chain.push(b)
                    used[i] = true
                    changed = true
                    break
                } else if (ptEq(head, b)) {
                    chain.unshift(a)
                    used[i] = true
                    changed = true
                    break
                }
            }

            if (changed) continue

            // Pass 2: reversed matching (fallback for FP issues)
            for (let i = 0; i < segments.length; i++) {
                if (used[i]) continue
                const [a, b] = segments[i]
                const head = chain[0]
                const tail = chain[chain.length - 1]

                if (ptEq(tail, b)) {
                    chain.push(a)
                    used[i] = true
                    changed = true
                    break
                } else if (ptEq(head, a)) {
                    chain.unshift(b)
                    used[i] = true
                    changed = true
                    break
                }
            }
        }

        // Check if closed
        const closed = chain.length > 2 && ptEq(chain[0], chain[chain.length - 1])
        if (closed) chain.pop() // remove duplicate closing point

        // Force-close contours that are nearly closed (gap < 0.5mm).
        // Complex meshes often produce contours whose endpoints are very close
        // but just outside the chaining tolerance. Leaving them open causes
        // shells.ts to discard them, creating missing-layer gaps.
        const forceClose = !closed && chain.length > 4 &&
            Math.sqrt((chain[0].x - chain[chain.length - 1].x) ** 2 +
                       (chain[0].y - chain[chain.length - 1].y) ** 2) < 0.5

        const area = computeSignedArea(chain)

        contours.push({
            points: chain,
            closed: closed || forceClose,
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

/** Compute the 2D bounding box of a set of contours */
function contourBounds(contours: Contour[]): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const c of contours) {
        for (const p of c.points) {
            if (p.x < xMin) xMin = p.x
            if (p.x > xMax) xMax = p.x
            if (p.y < yMin) yMin = p.y
            if (p.y > yMax) yMax = p.y
        }
    }
    if (!Number.isFinite(xMin)) return null
    return { xMin, xMax, yMin, yMax }
}

/** Check if two bounding boxes overlap with a tolerance margin */
function boundsOverlap(
    a: { xMin: number; xMax: number; yMin: number; yMax: number },
    b: { xMin: number; xMax: number; yMin: number; yMax: number },
    tolerance: number
): boolean {
    return (
        a.xMin <= b.xMax + tolerance &&
        a.xMax >= b.xMin - tolerance &&
        a.yMin <= b.yMax + tolerance &&
        a.yMax >= b.yMin - tolerance
    )
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
        const nominalZ = zHeights[li]

        // Try the nominal Z first; if no usable contours are produced
        // (degenerate plane coinciding with mesh edges/vertices), nudge Z
        // slightly with increasingly aggressive offsets.
        let contours: Contour[] = []
        let fallbackContours: Contour[] = []
        for (const offset of [0, 1e-4, -1e-4, 5e-4, -5e-4, 1e-3, -1e-3, 2e-3, -2e-3, 5e-3, -5e-3]) {
            const layerZ = nominalZ + offset
            const segments: [Vec2, Vec2][] = []

            for (let ti = 0; ti < triangles.length; ti++) {
                if (triZRanges[ti].zMin > layerZ + EPSILON || triZRanges[ti].zMax < layerZ - EPSILON) continue
                const seg = trianglePlaneIntersect(triangles[ti], layerZ)
                if (seg) segments.push(seg)
            }

            if (segments.length === 0) continue

            const candidateContours = sortContours(chainSegments(segments))
            // Accept this Z offset if we got at least one usable contour
            // (closed, or open with enough area to be force-closed by shells)
            const hasUsable = candidateContours.some((c) => c.closed || Math.abs(c.area) > 0.1)
            if (hasUsable) {
                contours = candidateContours
                break
            }
            // Keep the best fallback (most contours / largest area) in case
            // none of the offsets produce ideal contours
            if (candidateContours.length > fallbackContours.length) {
                fallbackContours = candidateContours
            }
        }

        // If no offset produced "usable" contours, fall back to whatever
        // we found rather than skipping the layer entirely, but only if the
        // fallback contours have reasonable area (>= 1.0mm²).
        if (contours.length === 0 && fallbackContours.length > 0) {
            const usableFallback = fallbackContours.filter((c) => c.closed || Math.abs(c.area) > 0.1)
            if (usableFallback.length > 0) {
                contours = fallbackContours
            }
        }

        // Skip layers that produced no usable geometry
        const usableContours = contours.filter((c) => c.closed || Math.abs(c.area) > 0.1)
        if (usableContours.length === 0) continue

        layers.push({
            z: nominalZ,
            layerIndex: layers.length,
            layerHeight: li === 0 ? config.firstLayerHeight : config.layerHeight,
            contours: usableContours,
        })

        // Report progress
        if (onProgress && li % 10 === 0) {
            onProgress({
                stage: 'slicing',
                progress: (li / zHeights.length) * 100,
                message: `Slicing layer ${li + 1}/${zHeights.length} (Z=${nominalZ.toFixed(2)}mm)`,
            })
        }
    }

    // Re-index layers sequentially
    for (let i = 0; i < layers.length; i++) {
        layers[i].layerIndex = i
    }

    return layers
}
