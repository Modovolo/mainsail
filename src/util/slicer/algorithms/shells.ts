/**
 * Shell / Perimeter Generation
 *
 * Takes contours from mesh slicing and generates wall toolpaths
 * by offsetting the contours inward.
 *
 * Uses clipper-lib polygon offset for robust polygon operations.
 */

import { Vec2, Contour, ToolpathSegment, MoveType, SlicerConfig } from '../types'
import * as ClipperLib from 'clipper-lib'

const EPSILON = 1e-6
const CLIPPER_SCALE = 100000

/**
 * Union all contours into a clean boundary, preserving hole topology.
 *
 * Keeps original winding — CCW paths represent outer boundaries (winding +1),
 * CW paths represent holes (winding -1).  Clipper union with pftNonZero fills
 * any region where |winding| > 0 and leaves regions where winding = 0 as
 * holes (e.g. CW hole inside CCW outer: +1 + (-1) = 0 → hole preserved).
 *
 * Standalone CW fragments (not inside any CCW contour) have winding -1 which
 * is still non-zero, so they are treated as filled — this handles meshes whose
 * fragments have inconsistent winding.
 *
 * Falls back to normalise-all-to-CCW if the original-winding union produces
 * no outer (positive-area) contours.
 */
function unionAllContours(contours: Contour[]): Contour[] {
    if (contours.length === 0) return []
    if (contours.length === 1) return normalizeContours(contours)

    const clipper = ClipperLib as any

    // --- Phase 1: try union with original winding (preserves holes) ---
    const paths: Array<Array<{ X: number; Y: number }>> = []
    for (const contour of contours) {
        if (contour.points.length < 3) continue
        const path = contour.points.map((p: Vec2) => ({
            X: Math.round(p.x * CLIPPER_SCALE),
            Y: Math.round(p.y * CLIPPER_SCALE),
        }))
        // Keep original winding — CCW = outer (+1), CW = hole (-1)
        paths.push(path)
    }

    if (paths.length === 0) return normalizeContours(contours)

    const cpr = new clipper.Clipper()
    for (const path of paths) {
        cpr.AddPath(path, clipper.PolyType.ptSubject, true)
    }

    const solution: Array<Array<{ X: number; Y: number }>> = []
    cpr.Execute(clipper.ClipType.ctUnion, solution, clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero)

    const result: Contour[] = []
    for (const poly of solution) {
        if (poly.length < 3) continue
        const pts = poly.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
        const area = computeArea(pts)
        if (Math.abs(area) < 0.01) continue
        // Preserve natural Clipper winding: CCW = outer (positive), CW = hole (negative)
        result.push({ points: pts, closed: true, area })
    }

    // If we got at least one outer contour, use this result (holes preserved)
    if (result.some((c) => c.area > 0)) return result

    // --- Phase 2: fallback — normalise all to CCW (for all-CW fragment meshes) ---
    const normalizedPaths: Array<Array<{ X: number; Y: number }>> = []
    for (const contour of contours) {
        if (contour.points.length < 3) continue
        const path = contour.points.map((p: Vec2) => ({
            X: Math.round(p.x * CLIPPER_SCALE),
            Y: Math.round(p.y * CLIPPER_SCALE),
        }))
        if (!clipper.Clipper.Orientation(path)) {
            path.reverse()
        }
        normalizedPaths.push(path)
    }

    const cpr2 = new clipper.Clipper()
    for (const path of normalizedPaths) {
        cpr2.AddPath(path, clipper.PolyType.ptSubject, true)
    }

    const solution2: Array<Array<{ X: number; Y: number }>> = []
    cpr2.Execute(clipper.ClipType.ctUnion, solution2, clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero)

    const result2: Contour[] = []
    for (const poly of solution2) {
        if (poly.length < 3) continue
        const pts = poly.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
        const area = computeArea(pts)
        if (Math.abs(area) < 0.01) continue
        if (area < 0) pts.reverse()
        result2.push({ points: pts, closed: true, area: computeArea(pts) })
    }

    return result2.length > 0 ? result2 : normalizeContours(contours)
}

/**
 * Fallback normalisation: reverse CW contours to CCW so they are treated
 * as outer boundaries rather than holes.
 */
function normalizeContours(contours: Contour[]): Contour[] {
    return contours.map((c) => {
        if (c.area < 0 && c.points.length >= 3) {
            const reversed = [...c.points].reverse()
            return { points: reversed, closed: c.closed, area: -c.area }
        }
        return c
    })
}

function offsetPolygonPaths(points: Vec2[], distance: number): Vec2[][] {
    if (points.length < 3 || Math.abs(distance) < EPSILON) return []

    const path = points.map((p) => ({
        X: Math.round(p.x * CLIPPER_SCALE),
        Y: Math.round(p.y * CLIPPER_SCALE),
    }))

    const clipper = ClipperLib as any
    const co = new clipper.ClipperOffset(2, 0.25 * CLIPPER_SCALE)
    co.AddPath(path, clipper.JoinType.jtMiter, clipper.EndType.etClosedPolygon)

    const solution: Array<Array<{ X: number; Y: number }>> = []
    co.Execute(solution, distance * CLIPPER_SCALE)

    const result: Vec2[][] = []
    for (const poly of solution) {
        if (poly.length < 3) continue
        const pts = poly.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
        const area = computeArea(pts)
        if (Math.abs(area) < 0.01) continue
        if (area < 0) pts.reverse()
        result.push(pts)
    }

    return result
}

/**
 * Offset a compound polygon (outer boundary + holes) as a single shape.
 * The outer is CCW (positive area), holes are CW (negative area).
 * Returns the offset result as polygons — all normalised to positive area
 * (CCW), consistent with offsetPolygonPaths output.
 */
function offsetCompoundPolygon(
    outer: Vec2[],
    holes: Vec2[][],
    distance: number
): Vec2[][] {
    if (outer.length < 3 || Math.abs(distance) < EPSILON) return []
    return batchOffsetCompound(outer, holes, [distance])[0]
}

/**
 * Batch offset a compound polygon at multiple distances.
 * Creates the ClipperOffset object once and executes for each distance,
 * avoiding redundant path setup.  Returns one polygon array per distance.
 */
function batchOffsetCompound(
    outer: Vec2[],
    holes: Vec2[][],
    distances: number[]
): Vec2[][][] {
    if (outer.length < 3) return distances.map(() => [])

    const clipper = ClipperLib as any
    const co = new clipper.ClipperOffset(2, 0.25 * CLIPPER_SCALE)

    // Add outer boundary (CCW)
    const outerPath = outer.map((p) => ({
        X: Math.round(p.x * CLIPPER_SCALE),
        Y: Math.round(p.y * CLIPPER_SCALE),
    }))
    co.AddPath(outerPath, clipper.JoinType.jtMiter, clipper.EndType.etClosedPolygon)

    // Add holes (CW) — must be reversed to CW for Clipper offset
    for (const hole of holes) {
        if (hole.length < 3) continue
        const holePath = hole.map((p) => ({
            X: Math.round(p.x * CLIPPER_SCALE),
            Y: Math.round(p.y * CLIPPER_SCALE),
        }))
        // Ensure hole is CW (negative orientation)
        if (clipper.Clipper.Orientation(holePath)) {
            holePath.reverse()
        }
        co.AddPath(holePath, clipper.JoinType.jtMiter, clipper.EndType.etClosedPolygon)
    }

    return distances.map((distance) => {
        if (Math.abs(distance) < EPSILON) return []
        const solution: Array<Array<{ X: number; Y: number }>> = []
        co.Execute(solution, distance * CLIPPER_SCALE)

        const result: Vec2[][] = []
        for (const poly of solution) {
            if (poly.length < 3) continue
            const pts = poly.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
            const area = computeArea(pts)
            if (Math.abs(area) < 0.01) continue
            if (area < 0) pts.reverse()
            result.push(pts)
        }
        return result
    })
}

function computeArea(pts: Vec2[]): number {
    let area = 0
    const n = pts.length
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    return area / 2
}

/**
 * Convert a polygon (list of points) into toolpath segments.
 * Creates segments from each point to the next, closing the loop.
 */
function polygonToSegments(
    points: Vec2[],
    type: MoveType,
    z: number,
    feedrate: number,
    lineWidth: number,
    layerHeight: number,
    filamentDiameter: number,
    extrusionMultiplier: number = 1.0
): ToolpathSegment[] {
    const segments: ToolpathSegment[] = []
    const filamentArea = Math.PI * (filamentDiameter / 2) ** 2

    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length
        const dx = points[j].x - points[i].x
        const dy = points[j].y - points[i].y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // E = (lineWidth * layerHeight * distance) / filamentArea * multiplier
        const extrusionAmount = (lineWidth * layerHeight * dist) / filamentArea * extrusionMultiplier

        segments.push({
            from: points[i],
            to: points[j],
            type,
            z,
            feedrate,
            extrusionWidth: lineWidth,
            extrusionHeight: layerHeight,
            extrusionAmount,
        })
    }

    return segments
}

/**
 * Generate shell/perimeter toolpaths for a single layer.
 *
 * Unions ALL input contours to derive the true outer boundary and topological
 * holes, then uses compound polygon offset (outer + holes together) so that
 * shells naturally wrap around holes without ever extending past the outer
 * wall boundary.
 */
export function generateShells(
    contours: Contour[],
    z: number,
    layerHeight: number,
    config: SlicerConfig
): { segments: ToolpathSegment[]; innerContours: Contour[] } {
    const segments: ToolpathSegment[] = []
    const innerContours: Contour[] = []
    const wallSpeed = (config.wallSpeed || config.printSpeed) * 60 // mm/s → mm/min

    // Union ALL contours into a clean boundary.
    // For complex meshes with fragmented contours, the area sign (outer vs hole)
    // is unreliable because winding depends on segment chaining order.
    // unionAllContours normalises every fragment to CCW = solid, unions them,
    // and lets Clipper derive proper outer/hole classification from topology.
    const closedContours = contours.filter((c) => c.points.length >= 3)
    const cleanContours = unionAllContours(closedContours)
    const outerContours = cleanContours.filter((c) => c.area > 0)
    const holeContours = cleanContours.filter((c) => c.area <= 0)

    // Assign each hole to its containing outer contour.
    // Uses point-in-polygon test on the hole's first vertex.
    const holesByOuter = new Map<number, Vec2[][]>()
    for (let oi = 0; oi < outerContours.length; oi++) {
        holesByOuter.set(oi, [])
    }
    for (const hole of holeContours) {
        if (hole.points.length === 0) continue
        const testPt = hole.points[0]
        for (let oi = 0; oi < outerContours.length; oi++) {
            if (pointInPolygon(testPt, outerContours[oi].points)) {
                holesByOuter.get(oi)!.push(hole.points)
                break
            }
        }
    }

    // Process each outer contour with its holes as a compound polygon.
    // Using compound offset ensures hole perimeters never extend past the
    // outer wall boundary — the offset naturally wraps around holes while
    // staying within the outer shell.
    for (let oi = 0; oi < outerContours.length; oi++) {
        const outerPts = outerContours[oi].points
        const holes = holesByOuter.get(oi) || []

        // Compute all wall offsets + infill offset in a single batch.
        // This reuses the ClipperOffset object (paths added once) for all
        // delta values, which is much faster than creating it N+1 times.
        const deltas: number[] = []
        for (let shell = 0; shell < config.wallCount; shell++) {
            deltas.push(-config.lineWidth / 2 - shell * config.lineWidth)
        }
        // Infill boundary: one more offset inward from the innermost wall
        const infillDelta = -config.lineWidth / 2 - config.wallCount * config.lineWidth
        deltas.push(infillDelta)

        const allOffsets = batchOffsetCompound(outerPts, holes, deltas)

        for (let shell = 0; shell < config.wallCount; shell++) {
            const shellPolys = allOffsets[shell]
            if (shellPolys.length === 0) break

            const type: MoveType = shell === 0 ? 'wall-outer' : 'wall-inner'

            for (const poly of shellPolys) {
                const segs = polygonToSegments(
                    poly,
                    type,
                    z,
                    wallSpeed,
                    config.lineWidth,
                    layerHeight,
                    config.filamentDiameter,
                    config.extrusionMultiplier
                )
                segments.push(...segs)
            }
        }

        // Infill contours from the last batch slot
        let infillPolys = allOffsets[config.wallCount]

        // Thin-feature gap fill: if the infill boundary collapsed (too narrow
        // for wallCount walls), retry with progressively fewer walls so the
        // region still gets solid fill on top/bottom surfaces.
        if (infillPolys.length === 0 && config.wallCount > 1) {
            for (let reducedWalls = config.wallCount - 1; reducedWalls >= 1; reducedWalls--) {
                const fallbackDelta = -config.lineWidth / 2 - reducedWalls * config.lineWidth
                const fallback = batchOffsetCompound(outerPts, holes, [fallbackDelta])
                if (fallback[0].length > 0) {
                    infillPolys = fallback[0]
                    break
                }
            }
        }

        for (const poly of infillPolys) {
            innerContours.push({
                points: poly,
                closed: true,
                area: computeArea(poly),
            })
        }
    }

    return { segments, innerContours }
}

/** Point-in-polygon test (ray casting). */
function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
    let inside = false
    const n = polygon.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = polygon[i].y, yj = polygon[j].y
        const xi = polygon[i].x, xj = polygon[j].x
        if ((yi > pt.y) !== (yj > pt.y) &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
            inside = !inside
        }
    }
    return inside
}
