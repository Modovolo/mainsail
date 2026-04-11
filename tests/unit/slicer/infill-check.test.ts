import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import type { SlicerConfig } from '@/util/slicer/types'

describe('Infill coverage check', () => {
    it('every layer with shells also has infill', () => {
        const stlPath = resolve(__dirname, 'wedge.stl')
        const stlBuffer = readFileSync(stlPath)
        const ab = stlBuffer.buffer.slice(stlBuffer.byteOffset, stlBuffer.byteOffset + stlBuffer.byteLength)
        const loader = new STLLoader()
        const parsed = loader.parse(ab)

        const config: SlicerConfig = {
            layerHeight: 0.2, firstLayerHeight: 0.3, wallCount: 2, wallSpeed: 40,
            topLayers: 4, bottomLayers: 4, infillDensity: 0.2, infillPattern: 'grid',
            infillSpeed: 60, printSpeed: 60, travelSpeed: 150, firstLayerSpeed: 20,
            nozzleTemp: 210, bedTemp: 60, firstLayerNozzleTemp: 215, firstLayerBedTemp: 65,
            retractDistance: 1.0, retractSpeed: 40, retractLift: 0.2,
            nozzleDiameter: 0.4, filamentDiameter: 1.75, extrusionMultiplier: 1.0,
            lineWidth: 0.44, buildVolumeX: 220, buildVolumeY: 220, buildVolumeZ: 250,
            enableSupport: false, supportDensity: 0.15, supportAngle: 50,
            skirtLoops: 2, skirtDistance: 5, brimWidth: 0,
            adhesionType: 'none', adhesionBrimWidth: 5, adhesionBrimLines: 5,
            mouseEarDiameter: 10, mouseEarLayers: 1, mouseEarPositions: [],
            raftPadPositions: [], raftPadLayers: 3, raftPadGap: 0.15,
            fanSpeed: 255, fanStartLayer: 2,
        }

        const layers = sliceMesh(parsed.vertices, config)

        let totalInfill = 0
        let totalShell = 0
        let emptyInfillLayers = 0

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i]
            const { segments, innerContours } = generateShells(
                layer.contours, layer.z, layer.layerHeight, config
            )
            const isBottom = i < config.bottomLayers
            const isTop = i >= layers.length - config.topLayers
            const infillSegs = generateInfill(innerContours, layer.z, i, layer.layerHeight, config, isBottom || isTop)

            totalShell += segments.length
            totalInfill += infillSegs.length

            if (infillSegs.length === 0 && segments.length > 0) {
                emptyInfillLayers++
            }
        }

        expect(layers.length).toBeGreaterThan(100)
        expect(totalShell).toBeGreaterThan(10000)
        expect(totalInfill).toBeGreaterThan(10000)
        expect(emptyInfillLayers).toBe(0)
    })
})
