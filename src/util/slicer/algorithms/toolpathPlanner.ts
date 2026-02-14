/**
 * Toolpath Planner
 *
 * Takes shell and infill segments and produces an ordered toolpath
 * with proper travel moves, retraction, and z-hop between disconnected regions.
 */

import { Vec2, ToolpathSegment, LayerToolpath, SlicerConfig } from '../types'

const EPSILON = 1e-4

function dist(a: Vec2, b: Vec2): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
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
    config: SlicerConfig
): ToolpathSegment[] {
    if (segments.length === 0) return []

    const result: ToolpathSegment[] = []
    const travelFeedrate = config.travelSpeed * 60 // mm/s → mm/min
    const minTravelForRetract = 1.5 // mm — don't retract for tiny moves

    let currentPos: Vec2 = segments[0].from

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
    prevFilament: number
): LayerToolpath {
    // Ordering: walls first (outer then inner), then infill
    // Group segments by type for ordering
    const outerWalls = shellSegments.filter((s) => s.type === 'wall-outer')
    const innerWalls = shellSegments.filter((s) => s.type === 'wall-inner')
    const floors = infillSegments.filter((s) => s.type === 'floor')
    const roofs = infillSegments.filter((s) => s.type === 'roof')
    const infill = infillSegments.filter((s) => s.type === 'infill')

    // Order each group
    const ordered = [
        ...orderSegments(outerWalls),
        ...orderSegments(innerWalls),
        ...orderSegments(floors),
        ...orderSegments(roofs),
        ...orderSegments(infill),
    ]

    // Insert travel moves
    const withTravels = insertTravels(ordered, z, config)

    // Calculate filament used in this layer
    let layerFilament = 0
    for (const seg of withTravels) {
        if (seg.extrusionAmount > 0) {
            layerFilament += seg.extrusionAmount
        }
    }

    return {
        z,
        layerIndex,
        segments: withTravels,
        filamentUsed: prevFilament + layerFilament,
    }
}
