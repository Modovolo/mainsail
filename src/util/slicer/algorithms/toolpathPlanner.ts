/**
 * Toolpath Planner
 *
 * Takes shell and infill segments and produces an ordered toolpath
 * with proper travel moves, retraction, and z-hop between disconnected regions.
 */

import { Vec2, ToolpathSegment, LayerToolpath, SlicerConfig } from '../types'

const EPSILON = 1e-4

const MIN_SEGMENT_LENGTH = 0.01
const COLINEAR_EPSILON = 1e-5

function dist(a: Vec2, b: Vec2): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function pointsNear(a: Vec2, b: Vec2, eps = EPSILON): boolean {
    return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

function canMerge(prev: ToolpathSegment, next: ToolpathSegment): boolean {
    if (prev.type !== next.type) return false
    if (Math.abs(prev.feedrate - next.feedrate) > 0.5) return false
    if (!pointsNear(prev.to, next.from)) return false

    // Keep retraction travel moves discrete.
    if (prev.type === 'travel' && (prev.extrusionAmount < 0 || next.extrusionAmount < 0)) return false

    const v1x = prev.to.x - prev.from.x
    const v1y = prev.to.y - prev.from.y
    const v2x = next.to.x - next.from.x
    const v2y = next.to.y - next.from.y
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y)
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y)

    if (len1 < MIN_SEGMENT_LENGTH || len2 < MIN_SEGMENT_LENGTH) {
        return true
    }

    const cross = Math.abs(v1x * v2y - v1y * v2x)
    const norm = len1 * len2
    return norm > 0 && cross / norm <= COLINEAR_EPSILON
}

function sanitizeSegments(segments: ToolpathSegment[]): ToolpathSegment[] {
    const sanitized: ToolpathSegment[] = []

    for (const seg of segments) {
        const length = dist(seg.from, seg.to)

        // Drop degenerate no-op segments.
        if (length < MIN_SEGMENT_LENGTH && Math.abs(seg.extrusionAmount) < 1e-5) {
            continue
        }

        const prev = sanitized[sanitized.length - 1]
        if (prev && canMerge(prev, seg)) {
            prev.to = seg.to
            prev.extrusionAmount += seg.extrusionAmount
            continue
        }

        sanitized.push({ ...seg })
    }

    return sanitized
}

/**
 * Find the nearest-neighbor ordering of segments to minimize travel.
 * Simple greedy approach: always pick the closest unvisited segment endpoint.
 */
function orderSegments(segments: ToolpathSegment[]): ToolpathSegment[] {
    if (segments.length <= 1) return segments

    const used = new Array(segments.length).fill(false)
    const ordered: ToolpathSegment[] = []
    let currentPos: Vec2 = { x: 0, y: 0 }

    for (let iter = 0; iter < segments.length; iter++) {
        let bestIdx = -1
        let bestDist = Infinity
        let bestReverse = false

        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue

            const dFwd = dist(currentPos, segments[i].from)
            const dRev = dist(currentPos, segments[i].to)

            if (dFwd < bestDist) {
                bestDist = dFwd
                bestIdx = i
                bestReverse = false
            }
            if (dRev < bestDist) {
                bestDist = dRev
                bestIdx = i
                bestReverse = true
            }
        }

        if (bestIdx < 0) break

        used[bestIdx] = true
        const seg = segments[bestIdx]

        if (bestReverse) {
            // Reverse the segment direction
            ordered.push({
                ...seg,
                from: seg.to,
                to: seg.from,
            })
            currentPos = seg.from
        } else {
            ordered.push(seg)
            currentPos = seg.to
        }
    }

    return ordered
}

/**
 * Insert travel moves between disconnected segments.
 * Also handles retraction when travel distance exceeds threshold.
 */
function insertTravels(
    segments: ToolpathSegment[],
    z: number,
    config: SlicerConfig,
    startPos?: Vec2
): ToolpathSegment[] {
    if (segments.length === 0) return []

    const result: ToolpathSegment[] = []
    const travelFeedrate = config.travelSpeed * 60 // mm/s → mm/min
    const minTravelForRetract = 1.5 // mm — don't retract for tiny moves

    let currentPos: Vec2 = startPos ?? segments[0].from

    for (const seg of segments) {
        const travelDist = dist(currentPos, seg.from)

        // Add travel move if needed
        if (travelDist > EPSILON) {
            result.push({
                from: currentPos,
                to: seg.from,
                type: 'travel',
                z,
                feedrate: travelFeedrate,
                extrusionWidth: 0,
                extrusionHeight: 0,
                extrusionAmount: travelDist > minTravelForRetract ? -config.retractDistance : 0,
            })
        }

        result.push(seg)
        currentPos = seg.to
    }

    return result
}

/**
 * Generate a skirt around the first layer.
 * Skirt = a loop around the bounding box of all contours at a distance.
 */
export function generateSkirt(
    allFirstLayerSegments: ToolpathSegment[],
    z: number,
    config: SlicerConfig
): ToolpathSegment[] {
    if (config.skirtLoops <= 0 || allFirstLayerSegments.length === 0) return []

    // Find bounding box of all extrusion segments
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const seg of allFirstLayerSegments) {
        if (seg.type === 'travel') continue
        for (const pt of [seg.from, seg.to]) {
            if (pt.x < xMin) xMin = pt.x
            if (pt.x > xMax) xMax = pt.x
            if (pt.y < yMin) yMin = pt.y
            if (pt.y > yMax) yMax = pt.y
        }
    }

    const segments: ToolpathSegment[] = []
    const filamentArea = Math.PI * (config.filamentDiameter / 2) ** 2
    const feedrate = config.firstLayerSpeed * 60

    for (let loop = 0; loop < config.skirtLoops; loop++) {
        const d = config.skirtDistance + loop * config.lineWidth
        const corners = [
            { x: xMin - d, y: yMin - d },
            { x: xMax + d, y: yMin - d },
            { x: xMax + d, y: yMax + d },
            { x: xMin - d, y: yMax + d },
        ]

        for (let i = 0; i < 4; i++) {
            const from = corners[i]
            const to = corners[(i + 1) % 4]
            const segDist = dist(from, to)
            const extrusionAmount = (config.lineWidth * config.firstLayerHeight * segDist) / filamentArea

            segments.push({
                from,
                to,
                type: 'skirt',
                z,
                feedrate,
                extrusionWidth: config.lineWidth,
                extrusionHeight: config.firstLayerHeight,
                extrusionAmount,
            })
        }
    }

    return segments
}

/**
 * Plan the toolpath for a single layer.
 *
 * Takes unordered shell and infill segments, orders them for minimal travel,
 * inserts travel moves and retraction, returns a complete LayerToolpath.
 */
export function planLayer(
    shellSegments: ToolpathSegment[],
    infillSegments: ToolpathSegment[],
    z: number,
    layerIndex: number,
    config: SlicerConfig,
    prevFilament: number,
    prevEndPos?: Vec2
): LayerToolpath {
    // Group segments by type. Keep shell order stable as generated from contours,
    // and only optimize ordering for fill-like segments.
    const outerWalls = shellSegments.filter((s) => s.type === 'wall-outer')
    const innerWalls = shellSegments.filter((s) => s.type === 'wall-inner')
    const floors = infillSegments.filter((s) => s.type === 'floor')
    const roofs = infillSegments.filter((s) => s.type === 'roof')
    const infill = infillSegments.filter((s) => s.type === 'infill')

    // Print inner walls first, outer walls last for better surface quality.
    // This also ensures outer-wall segments appear later in the move list,
    // giving them rendering priority in the preview (last-drawn wins for
    // coplanar geometry at the same layer height).
    const ordered = [
        ...innerWalls,
        ...orderSegments(floors),
        ...orderSegments(roofs),
        ...orderSegments(infill),
        ...outerWalls,
    ]

    // Insert travel moves
    const withTravels = insertTravels(ordered, z, config, prevEndPos)
    const sanitized = sanitizeSegments(withTravels)

    // Calculate filament used in this layer
    let layerFilament = 0
    for (const seg of sanitized) {
        if (seg.extrusionAmount > 0) {
            layerFilament += seg.extrusionAmount
        }
    }

    return {
        z,
        layerIndex,
        segments: sanitized,
        filamentUsed: prevFilament + layerFilament,
    }
}
