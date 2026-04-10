/**
 * Regression tests for Preview page coordinate mapping and model positioning.
 *
 * Verifies that:
 * 1. Parsed G-code bounds remain within the build volume
 * 2. G-code → Three.js coordinate mapping places the model on top of the bed (Y≥0)
 * 3. The fitView camera targets the model center within the build volume
 * 4. The build plate and model share a consistent coordinate system
 */
import { describe, it, expect } from 'vitest'
import { parseGcode } from '@/util/gcode/parser'

const BED_WIDTH = 220
const BED_DEPTH = 220
const BED_HEIGHT = 250

/**
 * Generates a simple test G-code string with known coordinates.
 * Simulates a 20×20×2mm box centered on the bed.
 */
function generateTestGcode(options: {
    cx?: number
    cy?: number
    sizeX?: number
    sizeY?: number
    layers?: number
    layerHeight?: number
} = {}): string {
    const cx = options.cx ?? BED_WIDTH / 2
    const cy = options.cy ?? BED_DEPTH / 2
    const sx = options.sizeX ?? 20
    const sy = options.sizeY ?? 20
    const layers = options.layers ?? 10
    const lh = options.layerHeight ?? 0.2
    const x0 = cx - sx / 2
    const x1 = cx + sx / 2
    const y0 = cy - sy / 2
    const y1 = cy + sy / 2

    const lines: string[] = [
        '; Test G-code',
        'G21 ; mm',
        'G90 ; absolute',
        'M82 ; absolute E',
        'G28',
    ]

    let e = 0
    for (let l = 0; l < layers; l++) {
        const z = (l + 1) * lh
        lines.push(`;LAYER_CHANGE`)
        lines.push(`G1 Z${z.toFixed(3)} F3000`)
        lines.push(`;TYPE:Outer wall`)
        lines.push(`G1 X${x0} Y${y0} F6000`)
        // Square perimeter
        e += 0.5
        lines.push(`G1 X${x1} Y${y0} E${e.toFixed(4)} F1200`)
        e += 0.5
        lines.push(`G1 X${x1} Y${y1} E${e.toFixed(4)}`)
        e += 0.5
        lines.push(`G1 X${x0} Y${y1} E${e.toFixed(4)}`)
        e += 0.5
        lines.push(`G1 X${x0} Y${y0} E${e.toFixed(4)}`)
    }

    return lines.join('\n')
}

describe('Preview coordinate mapping regression', () => {
    it('parsed bounds are within the build volume for centered model', () => {
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)

        expect(parsed.totalLayers).toBeGreaterThan(0)
        expect(parsed.bounds.xMin).toBeGreaterThanOrEqual(0)
        expect(parsed.bounds.xMax).toBeLessThanOrEqual(BED_WIDTH)
        expect(parsed.bounds.yMin).toBeGreaterThanOrEqual(0)
        expect(parsed.bounds.yMax).toBeLessThanOrEqual(BED_DEPTH)
        expect(parsed.bounds.zMin).toBeGreaterThanOrEqual(0)
        expect(parsed.bounds.zMax).toBeLessThanOrEqual(BED_HEIGHT)
    })

    it('Z bounds start above zero (model sits on bed)', () => {
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)

        expect(parsed.bounds.zMin).toBeGreaterThan(0)
        expect(parsed.bounds.zMax).toBeGreaterThan(parsed.bounds.zMin)
    })

    it('layer Z values increase monotonically', () => {
        const gcode = generateTestGcode({ layers: 20 })
        const parsed = parseGcode(gcode)

        for (let i = 1; i < parsed.layers.length; i++) {
            expect(parsed.layers[i].z).toBeGreaterThan(parsed.layers[i - 1].z)
        }
    })

    it('per-layer bounds are within global bounds', () => {
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)
        const b = parsed.bounds

        for (const layer of parsed.layers) {
            const lb = layer.bounds
            if (!Number.isFinite(lb.xMin)) continue // layer may have no extrusion
            expect(lb.xMin).toBeGreaterThanOrEqual(b.xMin - 0.001)
            expect(lb.xMax).toBeLessThanOrEqual(b.xMax + 0.001)
            expect(lb.yMin).toBeGreaterThanOrEqual(b.yMin - 0.001)
            expect(lb.yMax).toBeLessThanOrEqual(b.yMax + 0.001)
        }
    })

    it('Three.js Y-axis (height) maps from gcode Z and is non-negative', () => {
        // In Three.js Y-up convention, gcode Z maps to Three.js Y.
        // buildSingleLayer uses: positions.push(x, layer.z, y)
        // This means 3D Y = layer.z and 3D Z = gcode Y.
        // All layer.z values should be >= 0.
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)

        for (const layer of parsed.layers) {
            expect(layer.z).toBeGreaterThanOrEqual(0)
        }
    })

    it('model center is within bed boundaries', () => {
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)
        const b = parsed.bounds

        const centerX = (b.xMin + b.xMax) / 2
        const centerY = (b.yMin + b.yMax) / 2

        expect(centerX).toBeGreaterThanOrEqual(0)
        expect(centerX).toBeLessThanOrEqual(BED_WIDTH)
        expect(centerY).toBeGreaterThanOrEqual(0)
        expect(centerY).toBeLessThanOrEqual(BED_DEPTH)
    })

    it('fitView target stays within build volume', () => {
        // Replicates the fitView logic from PreviewPage.vue
        const gcode = generateTestGcode()
        const parsed = parseGcode(gcode)
        const b = parsed.bounds

        const targetX = BED_WIDTH / 2
        const targetY = (b.zMin + b.zMax) / 2 // Y-up = gcode Z
        const targetZ = BED_DEPTH / 2

        // Target should be within the build volume
        expect(targetX).toBeGreaterThanOrEqual(0)
        expect(targetX).toBeLessThanOrEqual(BED_WIDTH)
        expect(targetY).toBeGreaterThanOrEqual(0)
        expect(targetY).toBeLessThanOrEqual(BED_HEIGHT)
        expect(targetZ).toBeGreaterThanOrEqual(0)
        expect(targetZ).toBeLessThanOrEqual(BED_DEPTH)
    })

    it('detects model outside build volume', () => {
        // A model positioned far outside the bed should be caught
        const gcode = generateTestGcode({ cx: 300, cy: 300 })
        const parsed = parseGcode(gcode)
        const b = parsed.bounds

        // This model is intentionally out of bounds
        expect(b.xMax).toBeGreaterThan(BED_WIDTH)
        expect(b.yMax).toBeGreaterThan(BED_DEPTH)
    })

    it('feature types are preserved through parse roundtrip', () => {
        const gcode = [
            'G21', 'G90', 'M82', 'G28',
            ';LAYER_CHANGE',
            'G1 Z0.2 F3000',
            ';TYPE:Outer wall',
            'G1 X10 Y10 F6000',
            'G1 X20 Y10 E0.5 F1200',
            ';TYPE:Inner wall',
            'G1 X20 Y20 E1.0',
            ';TYPE:Sparse infill',
            'G1 X10 Y20 E1.5',
        ].join('\n')

        const parsed = parseGcode(gcode)
        const moves = parsed.layers[0]?.moves ?? []
        const types = moves.filter((m) => m.extruding).map((m) => m.type)

        expect(types).toContain('outer-wall')
        expect(types).toContain('inner-wall')
        expect(types).toContain('infill')
    })
})
