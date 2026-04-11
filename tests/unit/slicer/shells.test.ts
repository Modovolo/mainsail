import { describe, it, expect } from 'vitest'
import { generateShells } from '@/util/slicer/algorithms/shells'
import type { Contour, SlicerConfig } from '@/util/slicer/types'

function createTestConfig(overrides: Partial<SlicerConfig> = {}): SlicerConfig {
    return {
        layerHeight: 0.2,
        firstLayerHeight: 0.3,
        wallCount: 2,
        wallSpeed: 40,
        topLayers: 4,
        bottomLayers: 4,
        infillDensity: 0.2,
        infillPattern: 'grid',
        infillSpeed: 60,
        printSpeed: 60,
        travelSpeed: 150,
        firstLayerSpeed: 20,
        nozzleTemp: 210,
        bedTemp: 60,
        firstLayerNozzleTemp: 215,
        firstLayerBedTemp: 65,
        retractDistance: 1.0,
        retractSpeed: 40,
        retractLift: 0.2,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        extrusionMultiplier: 1.0,
        lineWidth: 0.44,
        buildVolumeX: 220,
        buildVolumeY: 220,
        buildVolumeZ: 250,
        enableSupport: false,
        supportDensity: 0.15,
        supportAngle: 50,
        skirtLoops: 2,
        skirtDistance: 5,
        brimWidth: 0,
        adhesionType: 'none',
        adhesionBrimWidth: 5,
        adhesionBrimLines: 5,
        mouseEarDiameter: 10,
        mouseEarLayers: 1,
        mouseEarPositions: [],
        raftPadPositions: [],
        raftPadLayers: 3,
        raftPadGap: 0.15,
        fanSpeed: 255,
        fanStartLayer: 2,
        ...overrides,
    }
}

/** Simple square contour 20×20mm centered at (50, 50), CCW winding (positive area) */
function squareContour(cx: number, cy: number, size: number): Contour {
    const half = size / 2
    const points = [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
    ]
    // Shoelace area for CCW = positive
    const area = size * size
    return { points, closed: true, area }
}

describe('generateShells wall classification', () => {
    it('classifies outermost shell as wall-outer and inner shells as wall-inner', () => {
        const config = createTestConfig({ wallCount: 2 })
        const contours = [squareContour(50, 50, 20)]
        const { segments } = generateShells(contours, 0.2, 0.2, config)

        const outerSegs = segments.filter((s) => s.type === 'wall-outer')
        const innerSegs = segments.filter((s) => s.type === 'wall-inner')

        expect(outerSegs.length).toBeGreaterThan(0)
        expect(innerSegs.length).toBeGreaterThan(0)

        // Outer wall segments should be further from center than inner wall segments
        const outerMinDist = Math.min(
            ...outerSegs.map((s) => Math.max(Math.abs(s.from.x - 50), Math.abs(s.from.y - 50)))
        )
        const innerMaxDist = Math.max(
            ...innerSegs.map((s) => Math.max(Math.abs(s.from.x - 50), Math.abs(s.from.y - 50)))
        )

        expect(outerMinDist).toBeGreaterThan(innerMaxDist)
    })

    it('produces only wall-outer when wallCount is 1', () => {
        const config = createTestConfig({ wallCount: 1 })
        const contours = [squareContour(50, 50, 20)]
        const { segments } = generateShells(contours, 0.2, 0.2, config)

        const outerSegs = segments.filter((s) => s.type === 'wall-outer')
        const innerSegs = segments.filter((s) => s.type === 'wall-inner')

        expect(outerSegs.length).toBeGreaterThan(0)
        expect(innerSegs.length).toBe(0)
    })

    it('does not misclassify outer surface as inner wall with overlapping contours', () => {
        // Two overlapping rectangles — before the union fix, each was shelled independently,
        // causing inner walls to appear on the model's outer surface.
        const config = createTestConfig({ wallCount: 2, lineWidth: 0.4 })
        const contour1 = squareContour(50, 50, 20) // 40..60 x 40..60
        const contour2 = squareContour(55, 50, 10) // 50..60 x 45..55 (overlaps right half)
        const { segments } = generateShells([contour1, contour2], 0.2, 0.2, config)

        const outerSegs = segments.filter((s) => s.type === 'wall-outer')
        const innerSegs = segments.filter((s) => s.type === 'wall-inner')

        expect(outerSegs.length).toBeGreaterThan(0)

        // The key assertion: no inner wall segment should be further from the
        // contour center than the closest outer wall segment. In other words,
        // inner walls must always be inside outer walls.
        if (innerSegs.length > 0) {
            const outerXs = outerSegs.map((s) => s.from.x)
            const innerXs = innerSegs.map((s) => s.from.x)

            const outerMaxX = Math.max(...outerXs)
            const outerMinX = Math.min(...outerXs)
            const innerMaxX = Math.max(...innerXs)
            const innerMinX = Math.min(...innerXs)

            // Inner wall extremes must be inside outer wall extremes (with tolerance)
            expect(innerMaxX).toBeLessThanOrEqual(outerMaxX + 0.01)
            expect(innerMinX).toBeGreaterThanOrEqual(outerMinX - 0.01)
        }
    })

    it('wall-outer segments are further from center than wall-inner segments (position check)', () => {
        const config = createTestConfig({ wallCount: 2, lineWidth: 0.44 })
        const contours = [squareContour(60, 60, 30)] // center at 60,60, size 30 → boundary at 45..75
        const { segments } = generateShells(contours, 0.2, 0.2, config)

        const outerSegs = segments.filter((s) => s.type === 'wall-outer')
        const innerSegs = segments.filter((s) => s.type === 'wall-inner')

        expect(outerSegs.length).toBeGreaterThan(0)
        expect(innerSegs.length).toBeGreaterThan(0)

        // Compute average distance from center for each type
        const avgDist = (segs: typeof segments) => {
            let sum = 0
            for (const s of segs) {
                sum += Math.abs(s.from.x - 60) + Math.abs(s.from.y - 60)
            }
            return sum / segs.length
        }

        const outerAvgDist = avgDist(outerSegs)
        const innerAvgDist = avgDist(innerSegs)

        // CRITICAL: wall-outer MUST be further from center than wall-inner
        expect(outerAvgDist).toBeGreaterThan(innerAvgDist)
    })

    it('generates shells for hole contours', () => {
        const config = createTestConfig({ wallCount: 2 })
        // Outer contour + inner hole
        const outer = squareContour(50, 50, 30)
        const hole: Contour = {
            points: [
                { x: 45, y: 45 },
                { x: 45, y: 55 },
                { x: 55, y: 55 },
                { x: 55, y: 45 },
            ], // CW winding
            closed: true,
            area: -100, // negative = hole
        }
        const { segments } = generateShells([outer, hole], 0.2, 0.2, config)

        const types = new Set(segments.map((s) => s.type))
        expect(types.has('wall-outer')).toBe(true)
    })
})
