/**
 * Slicer Web Worker
 *
 * Runs the entire slicing pipeline in a background thread:
 * mesh slicing → shell generation → infill → toolpath planning → G-code export
 *
 * Communicates with the main thread via postMessage.
 */

import { SlicerConfig, WorkerRequest, WorkerResponse, LayerToolpath } from './types'
import { sliceMesh } from './algorithms/meshSlicer'
import { generateShells } from './algorithms/shells'
import { generateInfill } from './algorithms/infill'
import { planLayer, generateSkirt } from './algorithms/toolpathPlanner'
import { exportGcode, computeStats } from './algorithms/gcodeExport'

const ctx = self as unknown as Worker

const cancelledJobs = new Set<string>()

function sendProgress(id: string, progress: number, stage: string, message: string) {
    ctx.postMessage({ type: 'progress', id, progress, stage, message } as WorkerResponse)
}

function sendComplete(id: string, gcode: string, toolpaths: LayerToolpath[], result: any) {
    ctx.postMessage({ type: 'complete', id, gcode, toolpaths, result } as WorkerResponse)
}

function sendError(id: string, error: string) {
    ctx.postMessage({ type: 'error', id, error } as WorkerResponse)
}

/**
 * Main slicing pipeline
 */
function runSlicingPipeline(id: string, vertices: Float32Array, config: SlicerConfig, thumbnail?: string) {
    try {
        // Stage 1: Mesh slicing (triangle-plane intersection)
        sendProgress(id, 0, 'slicing', 'Analyzing mesh geometry...')

        const sliceLayers = sliceMesh(vertices, config, (p) => {
            if (cancelledJobs.has(id)) throw new Error('Cancelled')
            sendProgress(id, p.progress * 0.3, 'slicing', p.message)
        })

        if (cancelledJobs.has(id)) return
        if (sliceLayers.length === 0) {
            sendError(id, 'No layers generated — mesh may be too small or flat')
            return
        }

        sendProgress(id, 30, 'shells', `Generating shells for ${sliceLayers.length} layers...`)

        // Stage 2 & 3: Shell generation + infill for each layer
        const layerToolpaths: LayerToolpath[] = []
        let prevFilament = 0
        // Track nozzle end position across layers for proper travel insertion.
        // Prime line ends at (60, 5).
        let prevEndPos: { x: number; y: number } | undefined = { x: 60, y: 5 }

        for (let i = 0; i < sliceLayers.length; i++) {
            if (cancelledJobs.has(id)) return

            const layer = sliceLayers[i]
            const z = layer.z
            const layerHeight = layer.layerHeight

            // Determine if this is a top/bottom solid layer
            const isBottom = i < config.bottomLayers
            const isTop = i >= sliceLayers.length - config.topLayers

            // Generate shells (walls)
            const { segments: shellSegments, innerContours } = generateShells(
                layer.contours,
                z,
                layerHeight,
                config
            )

            // Generate infill
            const infillSegments = generateInfill(
                innerContours,
                z,
                i,
                layerHeight,
                config,
                isBottom || isTop
            )

            // Plan toolpath (ordering + travel moves)
            const layerToolpath = planLayer(
                shellSegments,
                infillSegments,
                z,
                i,
                config,
                prevFilament,
                prevEndPos
            )

            // Skip layers that have no extrusion (degenerate slice)
            const hasExtrusion = layerToolpath.segments.some((s) => s.type !== 'travel')
            if (!hasExtrusion) continue

            layerToolpaths.push(layerToolpath)
            prevFilament = layerToolpath.filamentUsed

            // Update nozzle end position for next layer
            const lastSeg = layerToolpath.segments[layerToolpath.segments.length - 1]
            if (lastSeg) {
                prevEndPos = lastSeg.to
            }

            // Progress: shells+infill = 30-70%
            if (i % 5 === 0) {
                const progress = 30 + (i / sliceLayers.length) * 40
                sendProgress(id, progress, 'toolpaths', `Processing layer ${i + 1}/${sliceLayers.length}`)
            }
        }

        if (cancelledJobs.has(id)) return

        // Z-gap interpolation: detect layers where Z jumps more than 1.5×
        // the expected layer height and duplicate the previous layer's toolpath
        // at the missing Z heights to prevent mid-air extrusion.
        if (layerToolpaths.length >= 2) {
            const expectedStep = config.layerHeight
            const maxGap = expectedStep * 1.5
            const patched: LayerToolpath[] = [layerToolpaths[0]]

            for (let i = 1; i < layerToolpaths.length; i++) {
                const prevZ = layerToolpaths[i - 1].z
                const curZ = layerToolpaths[i].z
                const gap = curZ - prevZ

                if (gap > maxGap) {
                    // Interpolate missing Z heights
                    const steps = Math.round(gap / expectedStep)
                    for (let s = 1; s < steps; s++) {
                        const interpZ = prevZ + s * expectedStep
                        // Clone previous layer's segments at the interpolated Z
                        const prevLayer = layerToolpaths[i - 1]
                        const clonedSegments = prevLayer.segments.map((seg) => ({
                            ...seg,
                            z: interpZ,
                        }))
                        patched.push({
                            z: interpZ,
                            layerIndex: patched.length,
                            segments: clonedSegments,
                            filamentUsed: prevLayer.filamentUsed,
                        })
                    }
                }

                layerToolpaths[i].layerIndex = patched.length
                patched.push(layerToolpaths[i])
            }

            // Replace with patched array if any interpolation was done
            if (patched.length > layerToolpaths.length) {
                layerToolpaths.length = 0
                layerToolpaths.push(...patched)
            }
        }

        // Add skirt to first layer
        if (layerToolpaths.length > 0 && config.skirtLoops > 0) {
            const firstLayer = layerToolpaths[0]
            const skirtSegments = generateSkirt(
                firstLayer.segments.filter((s) => s.type !== 'travel'),
                firstLayer.z,
                config
            )
            // Prepend skirt to first layer
            firstLayer.segments = [...skirtSegments, ...firstLayer.segments]
        }

        // Stage 4: G-code export
        sendProgress(id, 70, 'export', 'Generating G-code...')

        const gcode = exportGcode(layerToolpaths, config, thumbnail)

        sendProgress(id, 90, 'stats', 'Computing statistics...')

        // Compute stats
        const stats = computeStats(layerToolpaths, config)
        const result = {
            ...stats,
            gcodeSize: gcode.length,
        }

        sendProgress(id, 100, 'complete', 'Slicing complete!')
        sendComplete(id, gcode, layerToolpaths, result)

    } catch (error: any) {
        if (error.message === 'Cancelled') return
        sendError(id, error.message || 'Unknown slicing error')
    }
}

// Handle messages from main thread
ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data

    switch (msg.type) {
        case 'slice':
            cancelledJobs.delete(msg.id)
            runSlicingPipeline(msg.id, msg.vertices, msg.config, msg.thumbnail)
            break

        case 'cancel':
            cancelledJobs.add(msg.id)
            break
    }
})
