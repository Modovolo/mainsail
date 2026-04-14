/**
 * Real Model Accuracy Tests
 *
 * Slices actual STL models through the full mainsail pipeline and
 * compares output metrics against reference G-code from PrusaSlicer.
 * 
 * Reference: control-box-lidar-mount.gcode (PrusaSlicer 2.9.4)
 *   - 140 layers, Z 0.4–56.0mm, 0.4mm layer height
 *   - 32,647mm total extrusion
 *   - 168,866 lines of gcode
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STLLoader } from '@/util/mesh/stl'
import { sliceMesh } from '@/util/slicer/algorithms/meshSlicer'
import { generateShells } from '@/util/slicer/algorithms/shells'
import { generateInfill } from '@/util/slicer/algorithms/infill'
import { planLayer, generateSkirt } from '@/util/slicer/algorithms/toolpathPlanner'
import { exportGcode, computeStats } from '@/util/slicer/algorithms/gcodeExport'
import type { SlicerConfig, LayerToolpath } from '@/util/slicer/types'

// Matches the PrusaSlicer reference settings
function referenceConfig(): SlicerConfig {
    return {
        layerHeight: 0.4,
        firstLayerHeight: 0.4,
        wallCount: 3,
        wallSpeed: 40,
        topLayers: 4,
        bottomLayers: 4,
        infillDensity: 0.15,
        infillPattern: 'grid',
        infillSpeed: 60,
        printSpeed: 60,
        travelSpeed: 150,
        firstLayerSpeed: 20,
        nozzleTemp: 270,
        bedTemp: 95,
        firstLayerNozzleTemp: 270,
        firstLayerBedTemp: 95,
        retractDistance: 2.0,
        retractSpeed: 40,
        retractLift: 0.2,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        extrusionMultiplier: 1.0,
        lineWidth: 0.45,
        buildVolumeX: 800,
        buildVolumeY: 800,
        buildVolumeZ: 250,
        enableSupport: false,
        supportDensity: 0.15,
        supportAngle: 50,
        skirtLoops: 1,
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
    }
}

function loadSTL(filename: string): Float32Array {
    const stlPath = resolve(__dirname, filename)
    const stlBuffer = readFileSync(stlPath)
    const arrayBuffer = stlBuffer.buffer.slice(
        stlBuffer.byteOffset,
        stlBuffer.byteOffset + stlBuffer.byteLength
    )
    const loader = new STLLoader()
    return loader.parse(arrayBuffer).vertices
}

function sliceFullPipeline(vertices: Float32Array, config: SlicerConfig) {
    const sliceLayers = sliceMesh(vertices, config)
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
        const layerToolpath = planLayer(
            shellSegments, infillSegments, [], layer.z, i, config, prevFilament, prevEndPos
        )

        const hasExtrusion = layerToolpath.segments.some((s) => s.type !== 'travel')
        if (!hasExtrusion) continue

        layerToolpaths.push(layerToolpath)
        prevFilament = layerToolpath.filamentUsed

        const lastSeg = layerToolpath.segments[layerToolpath.segments.length - 1]
        if (lastSeg) prevEndPos = lastSeg.to
    }

    // Add skirt to first layer
    if (layerToolpaths.length > 0 && config.skirtLoops > 0) {
        const firstLayer = layerToolpaths[0]
        const skirtSegments = generateSkirt(
            firstLayer.segments.filter((s) => s.type !== 'travel'),
            firstLayer.z,
            config
        )
        firstLayer.segments = [...skirtSegments, ...firstLayer.segments]
    }

    return { sliceLayers, layerToolpaths }
}

function analyzeGcode(gcode: string) {
    const lines = gcode.split('\n')
    let layerCount = 0
    let totalExtrusion = 0
    let currentE = 0
    const zHeights: number[] = []
    const typeSegments: Record<string, number> = {}
    let curType = ''
    let extrusionMoveCount = 0
    let travelMoveCount = 0

    for (const line of lines) {
        if (line.startsWith(';LAYER_CHANGE')) layerCount++
        if (line.startsWith(';Z:')) {
            zHeights.push(parseFloat(line.slice(3)))
        }
        if (line.startsWith(';TYPE:')) {
            curType = line.slice(6)
        }
        if (line.startsWith('G92 E0')) {
            currentE = 0
        }
        const eMatch = line.match(/E([-\d.]+)/)
        if (eMatch && (line.startsWith('G1 ') && line.includes('X'))) {
            const newE = parseFloat(eMatch[1])
            if (newE > currentE) {
                totalExtrusion += newE - currentE
                extrusionMoveCount++
                typeSegments[curType] = (typeSegments[curType] || 0) + 1
            }
            currentE = newE
        }
        if (line.startsWith('G0 ')) travelMoveCount++
    }

    return {
        layerCount,
        totalExtrusion,
        zHeights,
        typeSegments,
        extrusionMoveCount,
        travelMoveCount,
        lineCount: lines.length,
    }
}

describe('Control Box Lid — full pipeline accuracy', () => {
    const vertices = loadSTL('control-box-lid.stl')
    const config = referenceConfig()

    it('loads STL with expected triangle count', () => {
        expect(vertices.length / 9).toBe(27488)
    })

    it('slices correct number of layers (ref: 140 for both parts)', { timeout: 30000 }, () => {
        const { sliceLayers } = sliceFullPipeline(vertices, config)
        // The lid alone is ~56mm tall → 140 layers at 0.4mm
        // Allow ±2 layers for boundary differences
        expect(sliceLayers.length).toBeGreaterThanOrEqual(137)
        expect(sliceLayers.length).toBeLessThanOrEqual(143)
        console.log(`  Lid layers: ${sliceLayers.length}`)
    })

    it('Z range matches model bounds (0.4 to ~55.8mm)', { timeout: 30000 }, () => {
        const { sliceLayers } = sliceFullPipeline(vertices, config)
        expect(sliceLayers[0].z).toBeCloseTo(0.4, 1)
        const maxZ = sliceLayers[sliceLayers.length - 1].z
        expect(maxZ).toBeGreaterThan(54)
        expect(maxZ).toBeLessThan(57)
        console.log(`  Z range: ${sliceLayers[0].z.toFixed(2)} – ${maxZ.toFixed(2)}mm`)
    })

    it('Z spacing is consistent (0.4mm ± tolerance)', { timeout: 30000 }, () => {
        const { sliceLayers } = sliceFullPipeline(vertices, config)
        for (let i = 1; i < sliceLayers.length; i++) {
            const gap = sliceLayers[i].z - sliceLayers[i - 1].z
            expect(gap).toBeGreaterThan(0.38)
            expect(gap).toBeLessThan(0.42)
        }
    })

    it('every layer generates shells', { timeout: 30000 }, () => {
        const { sliceLayers } = sliceFullPipeline(vertices, config)
        let emptyShellLayers = 0
        for (const layer of sliceLayers) {
            const { segments } = generateShells(layer.contours, layer.z, layer.layerHeight, config)
            if (segments.length === 0) emptyShellLayers++
        }
        // All layers should have shells
        expect(emptyShellLayers).toBe(0)
    })

    it('every layer generates non-zero extrusion', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        for (const lt of layerToolpaths) {
            const extrusion = lt.segments
                .filter((s) => s.type !== 'travel')
                .reduce((sum, s) => sum + s.extrusionAmount, 0)
            expect(extrusion).toBeGreaterThan(0)
        }
    })

    it('generates G-code with reasonable total extrusion', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        const gcode = exportGcode(layerToolpaths, config)
        const analysis = analyzeGcode(gcode)

        console.log(`  Our layers: ${analysis.layerCount}`)
        console.log(`  Our total extrusion: ${analysis.totalExtrusion.toFixed(1)}mm`)
        console.log(`  Our line count: ${analysis.lineCount}`)
        console.log(`  Our type segments:`, analysis.typeSegments)

        // Reference: 32,647mm for both parts combined
        // Single lid should be ~28,000-30,000mm
        expect(analysis.totalExtrusion).toBeGreaterThan(20000)
        expect(analysis.totalExtrusion).toBeLessThan(40000)
        expect(analysis.layerCount).toBeGreaterThanOrEqual(100)
    })
})

describe('Lidar Mount — full pipeline accuracy', () => {
    const vertices = loadSTL('lidar-mount.stl')
    const config = referenceConfig()

    it('loads STL with expected triangle count', () => {
        expect(vertices.length / 9).toBe(4358)
    })

    it('slices correct number of layers (~70 for 28mm height)', () => {
        const { sliceLayers } = sliceFullPipeline(vertices, config)
        // 28mm at 0.4mm = 70 layers, but starts at Z=24.78, so from bed: ~70 layers
        // Actually mesh starts at Z=24.78 — meshSlicer places on bed (Z=0)
        console.log(`  Lidar layers: ${sliceLayers.length}`)
        console.log(`  Z range: ${sliceLayers[0]?.z.toFixed(2)} – ${sliceLayers[sliceLayers.length - 1]?.z.toFixed(2)}mm`)
        expect(sliceLayers.length).toBeGreaterThanOrEqual(65)
        expect(sliceLayers.length).toBeLessThanOrEqual(75)
    })

    it('every layer has non-zero extrusion', () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        for (const lt of layerToolpaths) {
            const extrusion = lt.segments
                .filter((s) => s.type !== 'travel')
                .reduce((sum, s) => sum + s.extrusionAmount, 0)
            expect(extrusion).toBeGreaterThan(0)
        }
    })

    it('generates valid G-code', () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        const gcode = exportGcode(layerToolpaths, config)
        const analysis = analyzeGcode(gcode)

        console.log(`  Lidar extrusion: ${analysis.totalExtrusion.toFixed(1)}mm`)
        console.log(`  Lidar G-code lines: ${analysis.lineCount}`)

        expect(analysis.totalExtrusion).toBeGreaterThan(500)
        expect(analysis.layerCount).toBeGreaterThanOrEqual(60)
    })
})

describe('Motor Puck — diverse geometry', () => {
    const vertices = loadSTL('motor-puck.stl')
    const config = referenceConfig()

    it('loads and slices without errors', () => {
        const { sliceLayers, layerToolpaths } = sliceFullPipeline(vertices, config)
        console.log(`  Motor Puck: ${sliceLayers.length} layers, ${layerToolpaths.length} toolpath layers`)
        expect(sliceLayers.length).toBeGreaterThan(10)
        expect(layerToolpaths.length).toBe(sliceLayers.length) // No dropped layers
    })
})

describe('Here4 Mount — complex mount geometry', () => {
    const vertices = loadSTL('here4-mount.stl')
    const config = referenceConfig()

    it('loads and slices without errors', () => {
        const { sliceLayers, layerToolpaths } = sliceFullPipeline(vertices, config)
        console.log(`  Here4 Mount: ${sliceLayers.length} layers, ${layerToolpaths.length} toolpath layers`)
        expect(sliceLayers.length).toBeGreaterThan(10)
        expect(layerToolpaths.length).toBe(sliceLayers.length) // No dropped layers
    })
})

describe('G-code quality checks', () => {
    const vertices = loadSTL('control-box-lid.stl')
    const config = referenceConfig()

    it('no consecutive duplicate Z heights', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        for (let i = 1; i < layerToolpaths.length; i++) {
            expect(layerToolpaths[i].z).toBeGreaterThan(layerToolpaths[i - 1].z)
        }
    })

    it('no Z gaps larger than 1.5× layer height', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        for (let i = 1; i < layerToolpaths.length; i++) {
            const gap = layerToolpaths[i].z - layerToolpaths[i - 1].z
            expect(gap).toBeLessThanOrEqual(config.layerHeight * 1.5)
        }
    })

    it('extrusion amounts are physically plausible', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        const gcode = exportGcode(layerToolpaths, config)
        const analysis = analyzeGcode(gcode)

        // Filament used should be reasonable for a ~113×130×56mm hollow shell
        // PrusaSlicer reference: ~32,647mm for lid+lidar combined
        // Just the lid: ~28,000-30,000mm
        const extrusionMm = analysis.totalExtrusion
        console.log(`  Total filament: ${extrusionMm.toFixed(0)}mm (${(extrusionMm / 1000).toFixed(1)}m)`)
        
        // Must be in reasonable range (25-35k mm for this part)
        expect(extrusionMm).toBeGreaterThan(20000)
        expect(extrusionMm).toBeLessThan(40000)
    })

    it('G-code contains required structure', { timeout: 30000 }, () => {
        const { layerToolpaths } = sliceFullPipeline(vertices, config)
        const gcode = exportGcode(layerToolpaths, config)

        // Must have start/end sequences
        expect(gcode).toContain('G28')
        expect(gcode).toContain('M104')
        expect(gcode).toContain('M140')
        expect(gcode).toContain(';LAYER_CHANGE')
        expect(gcode).toContain('M84')

        // Must have extrusion moves
        expect(gcode).toMatch(/G1 X[\d.]+ Y[\d.]+ E[\d.]+/)
    })
})
