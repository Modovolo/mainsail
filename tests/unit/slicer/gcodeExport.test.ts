import { describe, it, expect } from 'vitest'
import { exportGcode } from '@/util/slicer/algorithms/gcodeExport'
import type { SlicerConfig, LayerToolpath } from '@/util/slicer/types'

function createTestConfig(overrides: Partial<SlicerConfig> = {}): SlicerConfig {
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

describe('gcodeExport start prime safety', () => {
    it('keeps prime-line cross-section under Klipper max_extrude_cross_section default guard', () => {
        const config = createTestConfig()
        const gcode = exportGcode([] as LayerToolpath[], config)

        const primeMatch = gcode.match(/G1 X60\.000 Y5\.000 E([0-9]+\.[0-9]+)/)
        expect(primeMatch).not.toBeNull()

        const ePrime = Number(primeMatch![1])
        const primeDistanceMm = 55
        const filamentArea = Math.PI * (config.filamentDiameter / 2) ** 2
        const crossSection = (ePrime * filamentArea) / primeDistanceMm

        expect(crossSection).toBeLessThan(0.64)
    })
})
