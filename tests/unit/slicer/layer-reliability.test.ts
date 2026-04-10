/**
 * Slicer reliability regression tests
 *
 * Validates that the slicing pipeline produces continuous Z layers
 * with non-zero extrusion, preventing the "spaghetti after N layers"
 * failure mode.
 */

import { describe, it, expect } from 'vitest'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { exportGcode } from '@/util/slicer/algorithms/gcodeExport'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import { planLayer } from '@/util/slicer/algorithms/toolpathPlanner'
import type { SlicerConfig, LayerToolpath } from '@/util/slicer/types'

function createConfig(overrides: Partial<SlicerConfig> = {}): SlicerConfig {
    return {
        layerHeight: 0.2,
        firstLayerHeight: 0.3,
        wallCount: 3,
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
        fanSpeed: 255,
        fanStartLayer: 2,
        ...overrides,
    }
}

/** Build a simple box mesh (axis-aligned rectangular prism): 12 triangles */
function makeBoxVertices(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number
): Float32Array {
    const x0 = cx - sx / 2,
        x1 = cx + sx / 2
    const y0 = cy - sy / 2,
        y1 = cy + sy / 2
    const z0 = cz,
        z1 = cz + sz

    // Two triangles per face, 6 faces = 36 vertices × 3 coords
    // prettier-ignore
    const verts = [
        // Bottom (-Z)
        x0,y0,z0, x1,y0,z0, x1,y1,z0,
        x0,y0,z0, x1,y1,z0, x0,y1,z0,
        // Top (+Z)
        x0,y0,z1, x1,y1,z1, x1,y0,z1,
        x0,y0,z1, x0,y1,z1, x1,y1,z1,
        // Front (-Y)
        x0,y0,z0, x1,y0,z1, x1,y0,z0,
        x0,y0,z0, x0,y0,z1, x1,y0,z1,
        // Back (+Y)
        x0,y1,z0, x1,y1,z0, x1,y1,z1,
        x0,y1,z0, x1,y1,z1, x0,y1,z1,
        // Left (-X)
        x0,y0,z0, x0,y1,z0, x0,y1,z1,
        x0,y0,z0, x0,y1,z1, x0,y0,z1,
        // Right (+X)
        x1,y0,z0, x1,y1,z1, x1,y1,z0,
        x1,y0,z0, x1,y0,z1, x1,y1,z1,
    ]
    return new Float32Array(verts)
}

describe('layer Z-continuity', () => {
    it('produces consecutive layers without Z gaps for a simple box', () => {
        const config = createConfig()
        const vertices = makeBoxVertices(100, 100, 0, 20, 20, 10) // 20×20×10mm box
        const layers = sliceMesh(vertices, config)

        expect(layers.length).toBeGreaterThan(0)

        for (let i = 1; i < layers.length; i++) {
            const zGap = layers[i].z - layers[i - 1].z
            const maxAllowed = config.layerHeight * 1.5
            expect(zGap).toBeLessThanOrEqual(maxAllowed)
        }
    })

    it('does not skip layers for a thin-walled box', () => {
        const config = createConfig()
        // Thin box: 10×10×5mm — wall thickness ~1mm on each side
        const vertices = makeBoxVertices(100, 100, 0, 10, 10, 5)
        const layers = sliceMesh(vertices, config)

        // At 0.2mm layer height for 5mm tall box → expect ~24 layers
        expect(layers.length).toBeGreaterThanOrEqual(20)

        // Verify sequential Z ordering
        for (let i = 1; i < layers.length; i++) {
            expect(layers[i].z).toBeGreaterThan(layers[i - 1].z)
        }
    })
})

describe('every layer has extrusion', () => {
    it('generates non-zero extrusion for each layer of a box', () => {
        const config = createConfig()
        const vertices = makeBoxVertices(100, 100, 0, 20, 20, 10)
        const layers = sliceMesh(vertices, config)

        for (const layer of layers) {
            const { segments: shellSegments, innerContours } = generateShells(
                layer.contours, layer.z, layer.layerHeight, config
            )
            const infillSegments = generateInfill(
                innerContours, layer.z, layer.layerIndex, layer.layerHeight, config,
                layer.layerIndex < config.bottomLayers || layer.layerIndex >= layers.length - config.topLayers
            )

            const allSegments = [...shellSegments, ...infillSegments]
            const totalExtrusion = allSegments.reduce((sum, s) => sum + s.extrusionAmount, 0)
            expect(totalExtrusion).toBeGreaterThan(0)
        }
    })
})

describe('extrusionMultiplier is applied', () => {
    it('doubles extrusion when multiplier is 2.0 vs 1.0', () => {
        const config1 = createConfig({ extrusionMultiplier: 1.0 })
        const config2 = createConfig({ extrusionMultiplier: 2.0 })
        const vertices = makeBoxVertices(100, 100, 0, 20, 20, 10)

        const layers1 = sliceMesh(vertices, config1)
        const layers2 = sliceMesh(vertices, config2)

        // Use first common layer
        const layer1 = layers1[0]
        const layer2 = layers2[0]

        const { segments: shells1 } = generateShells(layer1.contours, layer1.z, layer1.layerHeight, config1)
        const { segments: shells2 } = generateShells(layer2.contours, layer2.z, layer2.layerHeight, config2)

        const e1 = shells1.reduce((sum, s) => sum + s.extrusionAmount, 0)
        const e2 = shells2.reduce((sum, s) => sum + s.extrusionAmount, 0)

        // e2 should be ~2× e1
        expect(e2).toBeCloseTo(e1 * 2, 1)
    })
})

describe('G-code E reset', () => {
    it('emits G92 E0 reset within the first 60 layers', () => {
        const config = createConfig()
        // Build enough layers to trigger the reset
        const toolpaths: LayerToolpath[] = []
        for (let i = 0; i < 55; i++) {
            toolpaths.push({
                z: config.firstLayerHeight + i * config.layerHeight,
                layerIndex: i,
                segments: [
                    {
                        from: { x: 90, y: 90 },
                        to: { x: 110, y: 90 },
                        type: 'wall-outer',
                        z: config.firstLayerHeight + i * config.layerHeight,
                        feedrate: 2400,
                        extrusionWidth: 0.44,
                        extrusionHeight: 0.2,
                        extrusionAmount: 0.5,
                    },
                ],
                filamentUsed: 0.5 * (i + 1),
            })
        }

        const gcode = exportGcode(toolpaths, config)
        expect(gcode).toContain('G92 E0 ; reset E counter')
    })
})

describe('Z-gap warning', () => {
    it('emits warning comment when Z gap exceeds 2× layer height', () => {
        const config = createConfig()
        const toolpaths: LayerToolpath[] = [
            {
                z: 0.3,
                layerIndex: 0,
                segments: [
                    {
                        from: { x: 90, y: 90 },
                        to: { x: 110, y: 90 },
                        type: 'wall-outer',
                        z: 0.3,
                        feedrate: 2400,
                        extrusionWidth: 0.44,
                        extrusionHeight: 0.2,
                        extrusionAmount: 0.5,
                    },
                ],
                filamentUsed: 0.5,
            },
            {
                z: 1.5, // Big gap — should trigger warning
                layerIndex: 1,
                segments: [
                    {
                        from: { x: 90, y: 90 },
                        to: { x: 110, y: 90 },
                        type: 'wall-outer',
                        z: 1.5,
                        feedrate: 2400,
                        extrusionWidth: 0.44,
                        extrusionHeight: 0.2,
                        extrusionAmount: 0.5,
                    },
                ],
                filamentUsed: 1.0,
            },
        ]

        const gcode = exportGcode(toolpaths, config)
        expect(gcode).toContain('; WARNING: Z gap of')
    })
})
