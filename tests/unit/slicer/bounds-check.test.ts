import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import { planLayer } from '@/util/slicer/algorithms/toolpathPlanner'
import { toolpathsToParsedGcode } from '@/util/gcode/toolpathConverter'
import type { SlicerConfig, Contour, LayerToolpath } from '@/util/slicer/types'

describe('Preview bounds check', () => {
    it('checks preview bounds match model extents', () => {
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
            skirtLoops: 2, skirtDistance: 5, brimWidth: 0, fanSpeed: 255, fanStartLayer: 2,
        }

        const layers = sliceMesh(parsed.vertices, config)
        console.log(`Sliced layers: ${layers.length}`)

        // Generate toolpaths for all layers
        const toolpaths: LayerToolpath[] = []
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i]
            const { segments, innerContours } = generateShells(
                layer.contours, layer.z, layer.layerHeight, config
            )
            const infillSegs = generateInfill(innerContours, layer.z, i, layer.layerHeight, config)
            const planned = planLayer(
                segments, infillSegs,
                layer.z, i, config, 0
            )
            toolpaths.push({
                z: layer.z,
                layerIndex: i,
                segments: planned.segments,
                filamentUsed: 0,
            })
        }

        const parsedGcode = toolpathsToParsedGcode(toolpaths)
        const b = parsedGcode.bounds
        console.log(`\nParsed bounds:`)
        console.log(`  X: ${b.xMin.toFixed(2)} to ${b.xMax.toFixed(2)} (width: ${(b.xMax-b.xMin).toFixed(2)})`)
        console.log(`  Y: ${b.yMin.toFixed(2)} to ${b.yMax.toFixed(2)} (depth: ${(b.yMax-b.yMin).toFixed(2)})`)
        console.log(`  Z: ${b.zMin.toFixed(2)} to ${b.zMax.toFixed(2)} (height: ${(b.zMax-b.zMin).toFixed(2)})`)

        // Model is 0-100 X, 0-87.83 Y, 0-32 Z
        // First shell offset is lineWidth/2 = 0.22mm inward, so expect bounds ~0.22 to ~99.78 in X
        console.log(`\nExpected model X: ~0.22 to ~99.78`)
        console.log(`Expected model Y: ~0.22 to ~87.61`)
        console.log(`Expected model Z: 0.3 to ~31.9`)

        // Check layer segment counts
        let totalSegs = 0
        let emptyLayers = 0
        for (let i = 0; i < toolpaths.length; i++) {
            const segs = toolpaths[i].segments.filter(s => s.type !== 'travel')
            totalSegs += segs.length
            if (segs.length === 0) {
                if (emptyLayers < 5) console.log(`  Empty layer ${i} (Z=${toolpaths[i].z.toFixed(2)})`)
                emptyLayers++
            }
        }
        console.log(`\nTotal extrusion segments: ${totalSegs}`)
        console.log(`Empty layers: ${emptyLayers}`)
        console.log(`Total layers with data: ${toolpaths.length - emptyLayers}`)

        // Check skirt bounds (should extend beyond model)
        const skirtSegs = toolpaths.flatMap(t => t.segments.filter(s => s.type === 'skirt'))
        if (skirtSegs.length > 0) {
            const skirtMinX = Math.min(...skirtSegs.map(s => Math.min(s.from.x, s.to.x)))
            const skirtMaxX = Math.max(...skirtSegs.map(s => Math.max(s.from.x, s.to.x)))
            const skirtMinY = Math.min(...skirtSegs.map(s => Math.min(s.from.y, s.to.y)))
            const skirtMaxY = Math.max(...skirtSegs.map(s => Math.max(s.from.y, s.to.y)))
            console.log(`\nSkirt bounds:`)
            console.log(`  X: ${skirtMinX.toFixed(2)} to ${skirtMaxX.toFixed(2)}`)
            console.log(`  Y: ${skirtMinY.toFixed(2)} to ${skirtMaxY.toFixed(2)}`)
        }

        expect(b.xMax - b.xMin).toBeGreaterThan(90) // model is 100mm wide
        expect(b.yMax - b.yMin).toBeGreaterThan(80) // model is ~88mm deep
    })
})
