/**
 * Wedge STL Diagnostic — slices the actual wedge model and dumps
 * per-layer statistics to identify problematic layers.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import type { SlicerConfig, Contour } from '@/util/slicer/types'

function defaultConfig(): SlicerConfig {
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
        fanSpeed: 255,
        fanStartLayer: 2,
    }
}

describe('Wedge STL diagnostic', () => {
    const stlPath = resolve(__dirname, 'wedge.stl')
    let vertices: Float32Array

    // Load the STL file once
    const stlBuffer = readFileSync(stlPath)
    const arrayBuffer = stlBuffer.buffer.slice(stlBuffer.byteOffset, stlBuffer.byteOffset + stlBuffer.byteLength)
    const loader = new STLLoader()
    const parsed = loader.parse(arrayBuffer)
    vertices = parsed.vertices

    it('loads the wedge STL with triangles', () => {
        expect(vertices.length).toBeGreaterThan(0)
        const triCount = vertices.length / 9
        console.log(`Wedge: ${triCount} triangles, ${vertices.length} vertex components`)
    })

    it('slices all layers and dumps diagnostics', () => {
        const config = defaultConfig()
        const layers = sliceMesh(vertices, config)

        console.log(`\nTotal layers: ${layers.length}`)
        console.log(`Z range: ${layers[0]?.z.toFixed(2)} - ${layers[layers.length - 1]?.z.toFixed(2)} mm`)
        console.log('')

        // Collect per-layer stats
        interface LayerStats {
            idx: number
            z: number
            contours: number
            outerContours: number
            holeContours: number
            openContours: number
            closedContours: number
            maxArea: number
            minArea: number
            totalArea: number
            shellOuterSegs: number
            shellInnerSegs: number
            issues: string[]
        }

        const stats: LayerStats[] = []
        const problemLayers: number[] = []

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i]
            const outerContours = layer.contours.filter((c: Contour) => c.area > 0)
            const holeContours = layer.contours.filter((c: Contour) => c.area <= 0)
            const openContours = layer.contours.filter((c: Contour) => !c.closed)
            const closedContours = layer.contours.filter((c: Contour) => c.closed)
            const areas = layer.contours.map((c: Contour) => Math.abs(c.area))

            // Generate shells to check type assignment
            const { segments } = generateShells(layer.contours, layer.z, layer.layerHeight, config)
            const outerSegs = segments.filter((s) => s.type === 'wall-outer')
            const innerSegs = segments.filter((s) => s.type === 'wall-inner')

            const issues: string[] = []

            // Flag: multiple outer contours (triggers union)
            if (outerContours.length > 1) issues.push(`${outerContours.length} outer contours (union)`)
            // Flag: open contours
            if (openContours.length > 0) issues.push(`${openContours.length} open contour(s)`)
            // Flag: no outer wall segments
            if (outerSegs.length === 0 && segments.length > 0) issues.push('NO outer wall segs')
            // Flag: no inner wall segments when wallCount > 1
            if (innerSegs.length === 0 && outerSegs.length > 0 && config.wallCount > 1) issues.push('NO inner wall segs')
            // Flag: outer walls not outermost
            if (outerSegs.length > 0 && innerSegs.length > 0) {
                const outerMaxX = Math.max(...outerSegs.map(s => s.to.x))
                const outerMinX = Math.min(...outerSegs.map(s => s.to.x))
                const innerMaxX = Math.max(...innerSegs.map(s => s.to.x))
                const innerMinX = Math.min(...innerSegs.map(s => s.to.x))

                if (innerMaxX > outerMaxX + 0.1 || innerMinX < outerMinX - 0.1) {
                    issues.push(`FLIPPED: inner X[${innerMinX.toFixed(1)}-${innerMaxX.toFixed(1)}] outside outer X[${outerMinX.toFixed(1)}-${outerMaxX.toFixed(1)}]`)
                }
            }
            // Flag: very small contour area (potential degenerate)
            if (areas.length > 0 && Math.min(...areas) < 2.0) {
                issues.push(`tiny contour area=${Math.min(...areas).toFixed(2)}`)
            }

            const stat: LayerStats = {
                idx: i,
                z: layer.z,
                contours: layer.contours.length,
                outerContours: outerContours.length,
                holeContours: holeContours.length,
                openContours: openContours.length,
                closedContours: closedContours.length,
                maxArea: areas.length > 0 ? Math.max(...areas) : 0,
                minArea: areas.length > 0 ? Math.min(...areas) : 0,
                totalArea: areas.reduce((s, a) => s + a, 0),
                shellOuterSegs: outerSegs.length,
                shellInnerSegs: innerSegs.length,
                issues,
            }
            stats.push(stat)

            if (issues.length > 0) problemLayers.push(i)
        }

        // Print summary of all layers
        console.log('=== LAYER-BY-LAYER SUMMARY ===')
        console.log('Layer | Z(mm)  | Contours(O/H) | Open | Outer/Inner segs | Area range       | Issues')
        console.log('------|--------|---------------|------|-----------------|-----------------|-------')

        for (const s of stats) {
            const issueStr = s.issues.length > 0 ? s.issues.join('; ') : ''
            const flag = s.issues.length > 0 ? '***' : '   '
            console.log(
                `${flag} ${String(s.idx).padStart(3)} | ${s.z.toFixed(2).padStart(6)} | ` +
                `${s.outerContours}O/${s.holeContours}H${String(s.contours).padStart(4)} | ` +
                `${String(s.openContours).padStart(4)} | ` +
                `${String(s.shellOuterSegs).padStart(5)}/${String(s.shellInnerSegs).padStart(5)} | ` +
                `${s.minArea.toFixed(1).padStart(7)}-${s.maxArea.toFixed(1).padStart(7)} | ` +
                `${issueStr}`
            )
        }

        // Print problem layer summary
        console.log(`\n=== PROBLEM LAYERS: ${problemLayers.length}/${stats.length} ===`)
        for (const idx of problemLayers) {
            const s = stats[idx]
            console.log(`  Layer ${s.idx} (Z=${s.z.toFixed(2)}): ${s.issues.join('; ')}`)
        }

        // Print ranges of "good" layers
        console.log('\n=== GOOD LAYER RANGES ===')
        let rangeStart = -1
        for (let i = 0; i <= stats.length; i++) {
            const isGood = i < stats.length && stats[i].issues.length === 0
            if (isGood && rangeStart === -1) rangeStart = i
            if (!isGood && rangeStart !== -1) {
                console.log(`  Layers ${rangeStart}-${i - 1} (${i - rangeStart} layers)`)
                rangeStart = -1
            }
        }

        expect(layers.length).toBeGreaterThan(0)
    })
})
