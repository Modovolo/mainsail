/**
 * Infill Pattern Generator
 *
 * Generates infill toolpaths inside the innermost shell contour.
 * Supports multiple infill patterns: grid, lines, triangles.
 *
 * Algorithm:
 * 1. Compute bounding box of the inner contour
 * 2. Generate a pattern of lines across the bounding box
 * 3. Clip lines to the inner contour boundary
 * 4. Convert clipped segments to toolpath segments
 */

import { Vec2, Contour, ToolpathSegment, MoveType, SlicerConfig } from '../types'

const EPSILON = 1e-6

/**
 * Point-in-polygon test using ray casting
 */
function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
    let inside = false
    const n = poly.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i].y
        const yj = poly[j].y
        if ((yi > pt.y) !== (yj > pt.y)) {
            const xi = poly[i].x + ((pt.y - yi) / (yj - yi)) * (poly[j].x - poly[i].x)
            if (pt.x < xi) inside = !inside
        }
    }
    return inside
}

/**
 * Find intersections of a horizontal or angled line with a polygon.
 * Returns sorted intersection X values for a given Y.
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
 * Generate a set of parallel lines at a given angle and spacing.
 * Returns line segments clipped to the polygon boundary.
 */
function generateParallelLines(
    poly: Vec2[],
    spacing: number,
    angle: number
): [Vec2, Vec2][] {
    if (poly.length < 3 || spacing <= 0) return []

    // Rotate polygon by -angle so we can use simple horizontal scanlines
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const rotated = poly.map((p) => ({
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos,
    }))

    // Find bounds of rotated polygon
    let yMin = Infinity, yMax = -Infinity
    for (const p of rotated) {
        if (p.y < yMin) yMin = p.y
        if (p.y > yMax) yMax = p.y
    }

    // Un-rotate function
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
        // Process pairs of intersections (enter/exit polygon)
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const from = unrotate({ x: xs[i], y })
            const to = unrotate({ x: xs[i + 1], y })
            lines.push([from, to])
        }
    }

    return lines
}

/**
 * Generate grid infill (two sets of perpendicular lines).
 */
function generateGridInfill(poly: Vec2[], spacing: number, angle: number): [Vec2, Vec2][] {
    const lines1 = generateParallelLines(poly, spacing, angle)
    const lines2 = generateParallelLines(poly, spacing, angle + Math.PI / 2)
    return [...lines1, ...lines2]
}

/**
 * Generate triangular infill (three sets of lines at 60° intervals).
 */
function generateTriangleInfill(poly: Vec2[], spacing: number, angle: number): [Vec2, Vec2][] {
    const lines1 = generateParallelLines(poly, spacing, angle)
    const lines2 = generateParallelLines(poly, spacing, angle + Math.PI / 3)
    const lines3 = generateParallelLines(poly, spacing, angle + (2 * Math.PI) / 3)
    return [...lines1, ...lines2, ...lines3]
}

/**
 * Generate infill toolpaths for a layer.
 *
 * @param innerContours - The innermost shell contours (infill boundary)
 * @param z - Layer Z height
 * @param layerIndex - Layer number (used for alternating patterns)
 * @param layerHeight - Height of this layer
 * @param config - Slicer configuration
 * @param isFloorOrRoof - If true, generate solid infill (100% density)
 */
export function generateInfill(
    innerContours: Contour[],
    z: number,
    layerIndex: number,
    layerHeight: number,
    config: SlicerConfig,
    isFloorOrRoof: boolean = false
): ToolpathSegment[] {
    if (innerContours.length === 0) return []

    const density = isFloorOrRoof ? 1.0 : config.infillDensity
    if (density <= 0) return []

    const spacing = config.lineWidth / density
    const type: MoveType = isFloorOrRoof ? (layerIndex < config.bottomLayers ? 'floor' : 'roof') : 'infill'
    const feedrate = (isFloorOrRoof ? config.printSpeed : config.infillSpeed) * 60 // mm/s → mm/min
    const filamentArea = Math.PI * (config.filamentDiameter / 2) ** 2

    const segments: ToolpathSegment[] = []

    for (const contour of innerContours) {
        // Only fill valid printable regions (outer loops with meaningful area).
        if (!contour.closed || contour.points.length < 3) continue
        if (!Number.isFinite(contour.area) || contour.area <= 0) continue
        if (Math.abs(contour.area) < 0.05) continue

        // Alternate angle each layer for better strength
        const baseAngle = (Math.PI / 4) + (layerIndex % 2) * (Math.PI / 2)
        let lines: [Vec2, Vec2][]

        if (isFloorOrRoof) {
            // Solid fill — just parallel lines
            lines = generateParallelLines(contour.points, config.lineWidth, baseAngle)
        } else {
            switch (config.infillPattern) {
                case 'grid':
                    lines = generateGridInfill(contour.points, spacing, baseAngle)
                    break
                case 'triangles':
                    lines = generateTriangleInfill(contour.points, spacing, baseAngle)
                    break
                case 'lines':
                default:
                    lines = generateParallelLines(contour.points, spacing, baseAngle)
                    break
            }
        }

        for (const [from, to] of lines) {
            const dx = to.x - from.x
            const dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < EPSILON) continue

            // Defensive check against malformed scanline clipping output.
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
            if (!pointInPolygon(mid, contour.points)) continue

            const extrusionAmount = (config.lineWidth * layerHeight * dist) / filamentArea * config.extrusionMultiplier

            segments.push({
                from,
                to,
                type,
                z,
                feedrate,
                extrusionWidth: config.lineWidth,
                extrusionHeight: layerHeight,
                extrusionAmount,
            })
        }
    }

    return segments
}
