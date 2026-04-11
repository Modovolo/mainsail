/**
 * Extrusion breakdown diagnostic — compares our per-type extrusion
 * against PrusaSlicer reference values.
 */
import { describe, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import { planLayer, generateSkirt } from '@/util/slicer/algorithms/toolpathPlanner'
import { exportGcode } from '@/util/slicer/algorithms/gcodeExport'
import type { SlicerConfig, LayerToolpath } from '@/util/slicer/types'

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

function sliceAndAnalyze(vertices: Float32Array) {
    const sliceLayers = sliceMesh(vertices, config)
    const typeExtrusion: Record<string, number> = {}
    const layerToolpaths: LayerToolpath[] = []
    let prevFilament = 0
    let prevEndPos: { x: number; y: number } | undefined = { x: 60, y: 5 }

    for (let i = 0; i < sliceLayers.length; i++) {
        const layer = sliceLayers[i]
        const isBottom = i < config.bottomLayers
        const isTop = i >= sliceLayers.length - config.topLayers

        const { segments: shellSegments, innerContours } = generateShells(
            layer.contours, layer.z, layer.layerHeight, config
        )
        const infillSegments = generateInfill(
            innerContours, layer.z, i, layer.layerHeight, config, isBottom || isTop
        )

        // Tally extrusion by type (pre-planning)
        for (const seg of [...shellSegments, ...infillSegments]) {
            typeExtrusion[seg.type] = (typeExtrusion[seg.type] || 0) + seg.extrusionAmount
        }

        const lt = planLayer(shellSegments, infillSegments, layer.z, i, config, prevFilament, prevEndPos)
        const hasExtrusion = lt.segments.some((s) => s.type !== 'travel')
        if (!hasExtrusion) continue

        layerToolpaths.push(lt)
        prevFilament = lt.filamentUsed
        const lastSeg = lt.segments[lt.segments.length - 1]
        if (lastSeg) prevEndPos = lastSeg.to
    }

    return { sliceLayers, layerToolpaths, typeExtrusion }
}

describe('Extrusion breakdown', () => {
    it('Control Box Lid extrusion by type', { timeout: 60000 }, () => {
        const { typeExtrusion } = sliceAndAnalyze(loadSTL('control-box-lid.stl'))
        const total = Object.values(typeExtrusion).reduce((a, b) => a + b, 0)
        console.log(`\nControl Box Lid — Total extrusion: ${total.toFixed(0)}mm`)
        for (const [type, e] of Object.entries(typeExtrusion).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${type}: ${e.toFixed(0)}mm (${(e/total*100).toFixed(1)}%)`)
        }
        console.log(`\nReference (both parts combined): 32,647mm`)
        console.log(`  Perimeter (inner): 16,305mm (49.9%)`)
        console.log(`  External perimeter: 7,115mm (21.8%)`)
        console.log(`  Solid infill: 7,053mm (21.6%)`)
        console.log(`  Internal infill: 373mm (1.1%)`)
    })

    it('Lidar Mount extrusion by type', () => {
        const { typeExtrusion } = sliceAndAnalyze(loadSTL('lidar-mount.stl'))
        const total = Object.values(typeExtrusion).reduce((a, b) => a + b, 0)
        console.log(`\nLidar Mount — Total extrusion: ${total.toFixed(0)}mm`)
        for (const [type, e] of Object.entries(typeExtrusion).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${type}: ${e.toFixed(0)}mm (${(e/total*100).toFixed(1)}%)`)
        }
    })
})
