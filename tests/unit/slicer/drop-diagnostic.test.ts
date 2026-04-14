/**
 * Diagnostic test: identify exactly which layers are dropped and why.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import { planLayer } from '@/util/slicer/algorithms/toolpathPlanner'
import type { SlicerConfig } from '@/util/slicer/types'

function loadSTL(filename: string): Float32Array {
    const stlPath = resolve(__dirname, filename)
    const stlBuffer = readFileSync(stlPath)
    const arrayBuffer = stlBuffer.buffer.slice(stlBuffer.byteOffset, stlBuffer.byteOffset + stlBuffer.byteLength)
    const loader = new STLLoader()
    return loader.parse(arrayBuffer).vertices
}

const config: SlicerConfig = {
    layerHeight: 0.4, firstLayerHeight: 0.4, wallCount: 3, wallSpeed: 40,
    topLayers: 4, bottomLayers: 4, infillDensity: 0.15, infillPattern: 'grid',
    infillSpeed: 60, printSpeed: 60, travelSpeed: 150, firstLayerSpeed: 20,
    nozzleTemp: 270, bedTemp: 95, firstLayerNozzleTemp: 270, firstLayerBedTemp: 95,
    retractDistance: 2.0, retractSpeed: 40, retractLift: 0.2,
    nozzleDiameter: 0.4, filamentDiameter: 1.75, extrusionMultiplier: 1.0,
    lineWidth: 0.45, buildVolumeX: 800, buildVolumeY: 800, buildVolumeZ: 250,
    enableSupport: false, supportDensity: 0.15, supportAngle: 50,
    skirtLoops: 1, skirtDistance: 5, brimWidth: 0,
    adhesionType: 'none', adhesionBrimWidth: 5, adhesionBrimLines: 5,
    mouseEarDiameter: 10, mouseEarLayers: 1, mouseEarPositions: [],
    raftPadPositions: [], raftPadLayers: 3, raftPadGap: 0.15,
    fanSpeed: 255, fanStartLayer: 2,
}

describe('Dropped layer diagnostics', () => {
    for (const { name, file } of [
        { name: 'Here4 Mount', file: 'here4-mount.stl' },
        { name: 'Motor Puck', file: 'motor-puck.stl' },
    ]) {
        it(`${name}: diagnose dropped layers`, () => {
            const vertices = loadSTL(file)
            const layers = sliceMesh(vertices, config)

            let droppedCount = 0
            const droppedInfo: string[] = []

            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i]
                const { segments: shellSegments, innerContours } = generateShells(
                    layer.contours, layer.z, layer.layerHeight, config
                )

                const isBottom = i < config.bottomLayers
                const isTop = i >= layers.length - config.topLayers
                const infillSegments = generateInfill(
                    innerContours, layer.z, i, layer.layerHeight, config, isBottom || isTop
                )

                const lt = planLayer(shellSegments, infillSegments, [], layer.z, i, config, 0)
                const hasExtrusion = lt.segments.some((s) => s.type !== 'travel')

                if (!hasExtrusion) {
                    const contourInfo = layer.contours.map(c => {
                        const bb = {
                            xMin: Infinity, xMax: -Infinity,
                            yMin: Infinity, yMax: -Infinity
                        }
                        for (const p of c.points) {
                            if (p.x < bb.xMin) bb.xMin = p.x
                            if (p.x > bb.xMax) bb.xMax = p.x
                            if (p.y < bb.yMin) bb.yMin = p.y
                            if (p.y > bb.yMax) bb.yMax = p.y
                        }
                        const width = bb.xMax - bb.xMin
                        const height = bb.yMax - bb.yMin
                        return `closed=${c.closed} pts=${c.points.length} area=${c.area.toFixed(2)} bbox=${width.toFixed(1)}×${height.toFixed(1)}mm`
                    })
                    droppedInfo.push(`  Layer ${i} Z=${layer.z.toFixed(2)}: shells=${shellSegments.length} infill=${infillSegments.length} contours: ${contourInfo.join(' | ')}`)
                    droppedCount++
                }
            }

            console.log(`\n=== ${name}: ${layers.length} slice layers ===`)
            console.log(`  Dropped: ${droppedCount}/${layers.length} (${(droppedCount/layers.length*100).toFixed(1)}%)`)
            if (droppedInfo.length > 0) {
                console.log(`  First 20 dropped layers:`)
                droppedInfo.slice(0, 20).forEach(d => console.log(d))
            }

            // This test just reports — doesn't fail
            expect(layers.length).toBeGreaterThan(0)
        })
    }
})
