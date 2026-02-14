/**
 * Shell / Perimeter Generation
 *
 * Takes contours from mesh slicing and generates wall toolpaths
 * by offsetting the contours inward.
 *
 * Uses a simplified polygon offset algorithm suitable for FDM printing.
 */

import { Vec2, Contour, ToolpathSegment, MoveType, SlicerConfig } from '../types'

const EPSILON = 1e-6

/**
 * Offset a polygon inward by a given distance.
 * Uses a simplified approach: move each edge inward by `distance`,
 * then compute new intersections.
 */
function offsetPolygon(points: Vec2[], distance: number): Vec2[] {
    const n = points.length
    if (n < 3) return []

    // Compute inward normals for each edge
    const normals: Vec2[] = []
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const dx = points[j].x - points[i].x
        const dy = points[j].y - points[i].y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < EPSILON) {
            normals.push({ x: 0, y: 0 })
            continue
        }
        // Inward normal (left turn for CCW polygon = inward)
        normals.push({ x: -dy / len, y: dx / len })
    }

    // Offset each edge and find new vertices at intersections
    const result: Vec2[] = []
    for (let i = 0; i < n; i++) {
        const prev = (i - 1 + n) % n

        // Offset edge prev→i and edge i→next
        const p1 = {
            x: points[prev].x + normals[prev].x * distance,
            y: points[prev].y + normals[prev].y * distance,
        }
        const p2 = {
            x: points[i].x + normals[prev].x * distance,
            y: points[i].y + normals[prev].y * distance,
        }
        const p3 = {
            x: points[i].x + normals[i].x * distance,
            y: points[i].y + normals[i].y * distance,
        }
        const p4 = {
            x: points[(i + 1) % n].x + normals[i].x * distance,
            y: points[(i + 1) % n].y + normals[i].y * distance,
        }

        // Intersect lines (p1,p2) and (p3,p4)
        const intersection = lineLineIntersect(p1, p2, p3, p4)
        if (intersection) {
            result.push(intersection)
        } else {
            // Parallel edges: use the midpoint of the offset
            result.push({
                x: (p2.x + p3.x) / 2,
                y: (p2.y + p3.y) / 2,
            })
        }
    }

    // Validate result - skip if degenerate
    if (result.length < 3) return []
    const area = computeArea(result)
    if (Math.abs(area) < 0.01) return [] // collapsed polygon

    return result
}

/**
 * Line-line intersection between (p1→p2) and (p3→p4)
 */
function lineLineIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
    const d1x = p2.x - p1.x
    const d1y = p2.y - p1.y
    const d2x = p4.x - p3.x
    const d2y = p4.y - p3.y

    const cross = d1x * d2y - d1y * d2x
    if (Math.abs(cross) < EPSILON) return null // parallel

    const dx = p3.x - p1.x
    const dy = p3.y - p1.y
    const t = (dx * d2y - dy * d2x) / cross

    return {
        x: p1.x + t * d1x,
        y: p1.y + t * d1y,
    }
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
    filamentDiameter: number
): ToolpathSegment[] {
    const segments: ToolpathSegment[] = []
    const filamentArea = Math.PI * (filamentDiameter / 2) ** 2

    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length
        const dx = points[j].x - points[i].x
        const dy = points[j].y - points[i].y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // E = (lineWidth * layerHeight * distance) / filamentArea
        const extrusionAmount = (lineWidth * layerHeight * dist) / filamentArea

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
 * For each outer contour:
 * 1. First offset = outer wall
 * 2. Subsequent offsets = inner walls
 * For holes, we offset outward (which for a CW polygon means using negative offset)
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

    // Process outer contours (positive area)
    const outerContours = contours.filter((c) => c.area > 0 && c.closed)
    const holeContours = contours.filter((c) => c.area <= 0 && c.closed)

    for (const contour of outerContours) {
        let currentPoly = contour.points

        for (let shell = 0; shell < config.wallCount; shell++) {
            const offset = config.lineWidth / 2 + shell * config.lineWidth
            const offsetPoly = offsetPolygon(currentPoly, offset)

            if (offsetPoly.length < 3) break

            const type: MoveType = shell === 0 ? 'wall-outer' : 'wall-inner'
            const segs = polygonToSegments(
                offsetPoly,
                type,
                z,
                wallSpeed,
                config.lineWidth,
                layerHeight,
                config.filamentDiameter
            )
            segments.push(...segs)

            // Track innermost shell for infill boundary
            if (shell === config.wallCount - 1) {
                const innerOffset = config.lineWidth / 2 + (shell + 1) * config.lineWidth
                const innerPoly = offsetPolygon(currentPoly, innerOffset)
                if (innerPoly.length >= 3) {
                    innerContours.push({
                        points: innerPoly,
                        closed: true,
                        area: computeArea(innerPoly),
                    })
                }
            }
        }
    }

    // Process holes (negative area) — offset outward
    for (const hole of holeContours) {
        for (let shell = 0; shell < config.wallCount; shell++) {
            const offset = -(config.lineWidth / 2 + shell * config.lineWidth)
            const offsetPoly = offsetPolygon(hole.points, offset)

            if (offsetPoly.length < 3) break

            const type: MoveType = shell === 0 ? 'wall-outer' : 'wall-inner'
            const segs = polygonToSegments(
                offsetPoly,
                type,
                z,
                wallSpeed,
                config.lineWidth,
                layerHeight,
                config.filamentDiameter
            )
            segments.push(...segs)
        }
    }

    return { segments, innerContours }
}
