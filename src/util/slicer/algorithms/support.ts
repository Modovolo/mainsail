/**
 * Support Generation
 *
 * Detects overhangs by comparing each layer's contour footprint with
 * the layer below, then fills the unsupported regions with a line pattern.
 *
 * Algorithm:
 * 1. For each layer, compute the union of its contours (footprint).
 * 2. Expand the footprint of the layer below by a small margin.
 * 3. Subtract the expanded lower footprint from the upper footprint.
 *    The remainder is the overhang region that needs support.
 * 4. Propagate support regions downward to the build plate.
 * 5. Fill each layer's support region with parallel lines at the configured density.
 */

import { Vec2, Contour, ToolpathSegment, SlicerConfig, SliceLayer } from '../types'
import * as ClipperLib from 'clipper-lib'

const CLIPPER_SCALE = 100000
const EPSILON = 1e-6

// Minimum polygon area (mm²) to consider as a support region
const MIN_SUPPORT_AREA = 1.0

/** Convert Vec2[] → Clipper path */
function toClipperPath(pts: Vec2[]): Array<{ X: number; Y: number }> {
    return pts.map((p) => ({
        X: Math.round(p.x * CLIPPER_SCALE),
        Y: Math.round(p.y * CLIPPER_SCALE),
    }))
}

/** Convert Clipper path → Vec2[] */
function fromClipperPath(path: Array<{ X: number; Y: number }>): Vec2[] {
    return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

/** Compute signed area of a polygon */
function computeArea(pts: Vec2[]): number {
    let area = 0
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y)
    }
    return area / 2
}

type ClipperPath = Array<{ X: number; Y: number }>

/**
 * Union a set of contours into a single set of Clipper paths.
 */
function unionContours(contours: Contour[]): ClipperPath[] {
    const clipper = ClipperLib as any

    const paths: ClipperPath[] = []
    for (const c of contours) {
        if (c.points.length < 3) continue
        paths.push(toClipperPath(c.points))
    }
    if (paths.length === 0) return []

    const cpr = new clipper.Clipper()
    for (const path of paths) {
        cpr.AddPath(path, clipper.PolyType.ptSubject, true)
    }

    const solution: ClipperPath[] = []
    cpr.Execute(
        clipper.ClipType.ctUnion, solution,
        clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero
    )
    return solution
}

/**
 * Offset Clipper paths by a given distance (mm).
 */
function offsetPaths(paths: ClipperPath[], distance: number): ClipperPath[] {
    if (paths.length === 0 || Math.abs(distance) < EPSILON) return paths

    const clipper = ClipperLib as any
    const co = new clipper.ClipperOffset(2, 0.25 * CLIPPER_SCALE)

    for (const path of paths) {
        co.AddPath(path, clipper.JoinType.jtMiter, clipper.EndType.etClosedPolygon)
    }

    const solution: ClipperPath[] = []
    co.Execute(solution, distance * CLIPPER_SCALE)
    return solution
}

/**
 * Subtract clip paths from subject paths (subject - clip).
 */
function subtractPaths(subject: ClipperPath[], clip: ClipperPath[]): ClipperPath[] {
    if (subject.length === 0) return []
    if (clip.length === 0) return subject

    const clipper = ClipperLib as any
    const cpr = new clipper.Clipper()

    for (const path of subject) {
        cpr.AddPath(path, clipper.PolyType.ptSubject, true)
    }
    for (const path of clip) {
        cpr.AddPath(path, clipper.PolyType.ptClip, true)
    }

    const solution: ClipperPath[] = []
    cpr.Execute(
        clipper.ClipType.ctDifference, solution,
        clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero
    )
    return solution
}

/**
 * Union two sets of Clipper paths.
 */
function unionPaths(a: ClipperPath[], b: ClipperPath[]): ClipperPath[] {
    if (a.length === 0) return b
    if (b.length === 0) return a

    const clipper = ClipperLib as any
    const cpr = new clipper.Clipper()

    for (const path of a) {
        cpr.AddPath(path, clipper.PolyType.ptSubject, true)
    }
    for (const path of b) {
        cpr.AddPath(path, clipper.PolyType.ptClip, true)
    }

    const solution: ClipperPath[] = []
    cpr.Execute(
        clipper.ClipType.ctUnion, solution,
        clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero
    )
    return solution
}

/**
 * Filter out tiny polygons below minimum area.
 */
function filterSmallPaths(paths: ClipperPath[]): ClipperPath[] {
    const clipper = ClipperLib as any
    return paths.filter((path) => {
        if (path.length < 3) return false
        const area = Math.abs(clipper.Clipper.Area(path)) / (CLIPPER_SCALE * CLIPPER_SCALE)
        return area >= MIN_SUPPORT_AREA
    })
}

/**
 * Generate scanline intersections for a polygon at a given Y.
 */
function scanlineIntersections(y: number, poly: Vec2[]): number[] {
    const intersections: number[] = []
    const n = poly.length

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const p1 = poly[i]
        const p2 = poly[j]

        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
            const x = p1.x + (y - p1.y) * (p2.x - p1.x) / (p2.y - p1.y)
            intersections.push(x)
        }
    }

    intersections.sort((a, b) => a - b)
    return intersections
}

/**
 * Fill a polygon region with parallel lines.
 */
function fillRegionWithLines(poly: Vec2[], spacing: number, angle: number): [Vec2, Vec2][] {
    if (poly.length < 3 || spacing <= 0) return []

    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const rotated = poly.map((p) => ({
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos,
    }))

    let yMin = Infinity, yMax = -Infinity
    for (const p of rotated) {
        if (p.y < yMin) yMin = p.y
        if (p.y > yMax) yMax = p.y
    }

    const cosR = Math.cos(angle)
    const sinR = Math.sin(angle)
    function unrotate(p: Vec2): Vec2 {
        return {
            x: p.x * cosR - p.y * sinR,
            y: p.x * sinR + p.y * cosR,
        }
    }

    const lines: [Vec2, Vec2][] = []
    const startY = Math.ceil(yMin / spacing) * spacing

    for (let y = startY; y < yMax; y += spacing) {
        const xs = scanlineIntersections(y, rotated)
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const from = unrotate({ x: xs[i], y })
            const to = unrotate({ x: xs[i + 1], y })
            lines.push([from, to])
        }
    }

    return lines
}

/**
 * Compute the overhang expansion based on support angle and layer height.
 *
 * At the support angle threshold, the overhang distance per layer is:
 *   layerHeight * tan(supportAngle)
 *
 * We expand the lower layer footprint by this amount so that only
 * overhangs steeper than the angle generate support.
 */
function overhangExpansion(config: SlicerConfig): number {
    const angleRad = (config.supportAngle * Math.PI) / 180
    return config.layerHeight * Math.tan(angleRad)
}

/**
 * Generate support structures for all layers.
 *
 * Returns an array parallel to sliceLayers, where each element is
 * the array of support ToolpathSegments for that layer.
 *
 * @param sliceLayers - Layers from mesh slicing
 * @param config - Slicer configuration (must have enableSupport = true)
 */
export function generateSupport(
    sliceLayers: SliceLayer[],
    config: SlicerConfig
): ToolpathSegment[][] {
    const result: ToolpathSegment[][] = new Array(sliceLayers.length)
    for (let i = 0; i < sliceLayers.length; i++) result[i] = []

    if (!config.enableSupport || sliceLayers.length < 2) return result

    const expansion = overhangExpansion(config)

    // --- Step 1: Compute each layer's footprint (union of contours) ---
    const footprints: ClipperPath[][] = sliceLayers.map((layer) => unionContours(layer.contours))

    // --- Step 2: Detect overhangs (top-down), accumulate support regions downward ---
    // supportRegions[i] = Clipper paths of the support area at layer i
    const supportRegions: ClipperPath[][] = new Array(sliceLayers.length)
    for (let i = 0; i < sliceLayers.length; i++) supportRegions[i] = []

    for (let i = 1; i < sliceLayers.length; i++) {
        const upperFootprint = footprints[i]
        const lowerFootprint = footprints[i - 1]

        if (upperFootprint.length === 0) continue

        // Expand lower footprint by the overhang allowance
        const expandedLowerPaths = lowerFootprint.length > 0
            ? offsetPaths(lowerFootprint, expansion)
            : []

        // Overhang = upper footprint minus expanded lower footprint
        const overhang = subtractPaths(upperFootprint, expandedLowerPaths)

        // Filter tiny slivers
        const significant = filterSmallPaths(overhang)

        if (significant.length > 0) {
            // This layer has overhangs — propagate support down to build plate
            // Accumulate: merge new overhang regions with any support already
            // flowing down from higher layers
            supportRegions[i - 1] = unionPaths(supportRegions[i - 1], significant)
        }
    }

    // --- Step 3: Propagate support regions downward ---
    // Support at layer N propagates to layer N-1, etc. down to layer 0
    for (let i = sliceLayers.length - 2; i >= 0; i--) {
        if (supportRegions[i + 1].length > 0) {
            supportRegions[i] = unionPaths(supportRegions[i], supportRegions[i + 1])
        }

        // Subtract the part's own footprint (don't put support inside the model).
        // Inset the footprint slightly so support can touch right up to the edge
        // of the part for better overhang bridging.
        if (supportRegions[i].length > 0 && footprints[i].length > 0) {
            const insetPart = offsetPaths(footprints[i], -config.lineWidth * 0.5)
            supportRegions[i] = subtractPaths(supportRegions[i], insetPart)
            supportRegions[i] = filterSmallPaths(supportRegions[i])
        }
    }

    // --- Step 4: Fill support regions with line infill ---
    const density = config.supportDensity
    if (density <= 0) return result

    const spacing = config.lineWidth / density
    const feedrate = config.printSpeed * 60 // mm/min (support prints at normal speed)
    const filamentArea = Math.PI * (config.filamentDiameter / 2) ** 2

    for (let i = 0; i < sliceLayers.length; i++) {
        const regions = supportRegions[i]
        if (regions.length === 0) continue

        const z = sliceLayers[i].z
        const layerHeight = sliceLayers[i].layerHeight
        // Alternate angle per layer for support stability
        const angle = (i % 2 === 0) ? 0 : Math.PI / 2

        for (const clipperPoly of regions) {
            if (clipperPoly.length < 3) continue
            const poly = fromClipperPath(clipperPoly)
            const area = Math.abs(computeArea(poly))
            if (area < MIN_SUPPORT_AREA) continue

            const lines = fillRegionWithLines(poly, spacing, angle)

            for (const [from, to] of lines) {
                const dx = to.x - from.x
                const dy = to.y - from.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < EPSILON) continue

                const extrusionAmount = (config.lineWidth * layerHeight * dist) / filamentArea * config.extrusionMultiplier

                result[i].push({
                    from,
                    to,
                    type: 'support',
                    z,
                    feedrate,
                    extrusionWidth: config.lineWidth,
                    extrusionHeight: layerHeight,
                    extrusionAmount,
                })
            }
        }
    }

    return result
}
