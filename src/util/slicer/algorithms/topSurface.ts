/**
 * Per-region top/bottom surface detection
 *
 * Computes which regions of a layer are "exposed" — not covered by the layer
 * above (top surface) or below (bottom surface).  These regions need solid
 * infill (100 % density) to form proper skins, regardless of their global
 * layer index.
 *
 * Uses Clipper boolean difference: exposed = current MINUS above/below.
 */

import { Vec2, Contour } from '../types'
import * as ClipperLib from 'clipper-lib'

const CLIPPER_SCALE = 100000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeArea(pts: Vec2[]): number {
    let area = 0
    const n = pts.length
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    return area / 2
}

function contoursToClipperPaths(
    contours: Contour[],
    clipper: any,
): Array<Array<{ X: number; Y: number }>> {
    const paths: Array<Array<{ X: number; Y: number }>> = []
    for (const c of contours) {
        if (c.points.length < 3 || !c.closed) continue
        const path = c.points.map((p) => ({
            X: Math.round(p.x * CLIPPER_SCALE),
            Y: Math.round(p.y * CLIPPER_SCALE),
        }))
        paths.push(path)
    }
    return paths
}

function clipperPathsToContours(
    solution: Array<Array<{ X: number; Y: number }>>,
    minArea: number = 0.5,
): Contour[] {
    const result: Contour[] = []
    for (const poly of solution) {
        if (poly.length < 3) continue
        const pts = poly.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
        const area = computeArea(pts)
        if (Math.abs(area) < minArea) continue // skip tiny slivers
        // Preserve winding: CCW = outer (positive area), CW = hole (negative area).
        // Downstream Clipper operations need correct winding to handle holes.
        result.push({ points: pts, closed: true, area })
    }
    return result
}

// ---------------------------------------------------------------------------
// Boolean operations on contour sets
// ---------------------------------------------------------------------------

/**
 * Compute `subject MINUS clip` (Clipper difference).
 * Returns contours of regions present in subject but not in clip.
 */
export function contourDifference(subject: Contour[], clip: Contour[]): Contour[] {
    const clipper = ClipperLib as any
    const subPaths = contoursToClipperPaths(subject, clipper)
    const clipPaths = contoursToClipperPaths(clip, clipper)

    if (subPaths.length === 0) return []
    if (clipPaths.length === 0) return subject.filter((c) => c.closed && c.points.length >= 3)

    const cpr = new clipper.Clipper()
    for (const p of subPaths) cpr.AddPath(p, clipper.PolyType.ptSubject, true)
    for (const p of clipPaths) cpr.AddPath(p, clipper.PolyType.ptClip, true)

    const solution: Array<Array<{ X: number; Y: number }>> = []
    cpr.Execute(
        clipper.ClipType.ctDifference,
        solution,
        clipper.PolyFillType.pftNonZero,
        clipper.PolyFillType.pftNonZero,
    )

    return clipperPathsToContours(solution)
}

/**
 * Compute `subject AND clip` (Clipper intersection).
 * Returns contours of regions present in both subject and clip.
 */
export function contourIntersection(subject: Contour[], clip: Contour[]): Contour[] {
    const clipper = ClipperLib as any
    const subPaths = contoursToClipperPaths(subject, clipper)
    const clipPaths = contoursToClipperPaths(clip, clipper)

    if (subPaths.length === 0 || clipPaths.length === 0) return []

    const cpr = new clipper.Clipper()
    for (const p of subPaths) cpr.AddPath(p, clipper.PolyType.ptSubject, true)
    for (const p of clipPaths) cpr.AddPath(p, clipper.PolyType.ptClip, true)

    const solution: Array<Array<{ X: number; Y: number }>> = []
    cpr.Execute(
        clipper.ClipType.ctIntersection,
        solution,
        clipper.PolyFillType.pftNonZero,
        clipper.PolyFillType.pftNonZero,
    )

    return clipperPathsToContours(solution)
}

/**
 * Compute `a OR b` (Clipper union).
 */
export function contourUnion(a: Contour[], b: Contour[]): Contour[] {
    const clipper = ClipperLib as any
    const aPaths = contoursToClipperPaths(a, clipper)
    const bPaths = contoursToClipperPaths(b, clipper)

    if (aPaths.length === 0) return b.filter((c) => c.closed && c.points.length >= 3)
    if (bPaths.length === 0) return a.filter((c) => c.closed && c.points.length >= 3)

    const cpr = new clipper.Clipper()
    for (const p of aPaths) cpr.AddPath(p, clipper.PolyType.ptSubject, true)
    for (const p of bPaths) cpr.AddPath(p, clipper.PolyType.ptClip, true)

    const solution: Array<Array<{ X: number; Y: number }>> = []
    cpr.Execute(
        clipper.ClipType.ctUnion,
        solution,
        clipper.PolyFillType.pftNonZero,
        clipper.PolyFillType.pftNonZero,
    )

    return clipperPathsToContours(solution)
}

// ---------------------------------------------------------------------------
// Top / bottom surface computation
// ---------------------------------------------------------------------------

/**
 * Compute the top-surface regions for each layer.
 *
 * A region of layer `i` is a "top surface" if it is NOT covered by the raw
 * contours of layer `i+1`.  For `topLayers > 1` the solid fill is also
 * propagated downward: if layer `i` has an exposed region, layers
 * `i-1 … i-(topLayers-1)` get that same region marked as needing solid fill
 * (so the solid skin has the requested thickness).
 *
 * Returns an array (one per layer) of Contour[] representing the regions
 * that need solid roof fill.
 */
export function computeTopSurfaceRegions(
    layerContours: Contour[][],
    topLayers: number,
): Contour[][] {
    const n = layerContours.length
    const result: Contour[][] = new Array(n).fill(null).map(() => [])

    // Pass 1: compute raw exposed regions (current minus next layer)
    // These are the layers where the geometry actually ends (the "skin boundary").
    const rawExposed: Contour[][] = new Array(n).fill(null).map(() => [])
    for (let i = 0; i < n; i++) {
        const current = layerContours[i].filter((c) => c.closed)
        const above = i + 1 < n ? layerContours[i + 1].filter((c) => c.closed) : null

        const exposed = contourDifference(current, above ?? [])
        if (exposed.length > 0) {
            rawExposed[i] = exposed
            result[i] = exposed
        }
    }

    // Pass 2: propagate raw exposed regions downward for topLayers thickness.
    // Only propagate from rawExposed (pass 1) — NOT from already-propagated
    // regions, to avoid unbounded cascade.
    if (topLayers > 1) {
        for (let i = n - 2; i >= 0; i--) {
            for (let k = 1; k < topLayers && i + k < n; k++) {
                if (rawExposed[i + k].length === 0) continue
                const currentContours = layerContours[i].filter((c) => c.closed)
                const overlap = contourIntersection(rawExposed[i + k], currentContours)
                if (overlap.length > 0) {
                    result[i] = contourUnion(result[i], overlap)
                }
            }
        }
    }

    return result
}

/**
 * Same as computeTopSurfaceRegions but for bottom surfaces.
 * Exposed = current layer contour MINUS contour of layer below.
 */
export function computeBottomSurfaceRegions(
    layerContours: Contour[][],
    bottomLayers: number,
): Contour[][] {
    const n = layerContours.length
    const result: Contour[][] = new Array(n).fill(null).map(() => [])
    const rawExposed: Contour[][] = new Array(n).fill(null).map(() => [])

    for (let i = 0; i < n; i++) {
        const current = layerContours[i].filter((c) => c.closed)
        const below = i - 1 >= 0 ? layerContours[i - 1].filter((c) => c.closed) : null

        const exposed = contourDifference(current, below ?? [])
        if (exposed.length > 0) {
            rawExposed[i] = exposed
            result[i] = exposed
        }
    }

    // Propagate upward from raw exposed only
    if (bottomLayers > 1) {
        for (let i = 1; i < n; i++) {
            for (let k = 1; k < bottomLayers && i - k >= 0; k++) {
                if (rawExposed[i - k].length === 0) continue
                const currentContours = layerContours[i].filter((c) => c.closed)
                const overlap = contourIntersection(rawExposed[i - k], currentContours)
                if (overlap.length > 0) {
                    result[i] = contourUnion(result[i], overlap)
                }
            }
        }
    }

    return result
}
