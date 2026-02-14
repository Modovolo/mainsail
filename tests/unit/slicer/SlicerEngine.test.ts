/**
 * Slicer Engine Unit Tests
 * 
 * Tests for the web worker-based slicing engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SlicerConfig } from '@/util/slicer/types'

// Store the last created instance for test access
let lastWorkerInstance: MockWorker | null = null
let autoRespond = true  // Auto-respond with success by default
let shouldError = false
let responseDelay = 0

// Mock Web Worker that auto-responds to slice requests
class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    receivedMessages: any[] = []
    
    constructor(_url?: URL, _options?: WorkerOptions) {
        lastWorkerInstance = this
    }
    
    addEventListener(type: string, handler: any) {
        if (type === 'message') {
            this.onmessage = handler
        } else if (type === 'error') {
            this.onerror = handler
        }
    }
    
    postMessage(data: any, _transfer?: any) {
        this.receivedMessages.push(data)
        
        if (autoRespond && data.type === 'slice') {
            const respond = () => {
                if (shouldError) {
                    this.onmessage?.({ data: { type: 'error', id: data.id, error: 'Slicing failed' } } as MessageEvent)
                } else {
                    this.onmessage?.({ data: {
                        type: 'complete',
                        id: data.id,
                        gcode: '; Generated G-code\nG28\nG1 X50 Y50 Z0.2\n',
                        result: {
                            layerCount: 100,
                            filamentUsedMm: 5000,
                            filamentUsedM: 5,
                            filamentWeightG: 15,
                            estimatedTimeS: 3600,
                            estimatedTimeFormatted: '1h 0m',
                            gcodeSize: 50000,
                        },
                    }} as MessageEvent)
                }
            }
            
            if (responseDelay > 0) {
                setTimeout(respond, responseDelay)
            } else {
                // Use queueMicrotask to ensure onmessage is set
                queueMicrotask(respond)
            }
        }
    }
    
    terminate() {}
    
    // Test helper: manually trigger a response
    simulateResponse(response: any) {
        this.onmessage?.({ data: response } as MessageEvent)
    }
    
    // Test helper: trigger error handler
    simulateError() {
        this.onerror?.({ message: 'Worker crashed' } as ErrorEvent)
    }
}

// Create default test config
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

// Create test vertices (simple triangle)
function createTestVertices(): Float32Array {
    return new Float32Array([
        // Triangle 1
        0, 0, 0,
        1, 0, 0,
        0.5, 1, 0,
        // Triangle 2
        0, 0, 0,
        0.5, 1, 0,
        0, 1, 0,
    ])
}

describe('SlicerEngine', () => {
    let originalWorker: typeof Worker
    
    beforeEach(() => {
        // Save original Worker
        originalWorker = globalThis.Worker
        
        // Reset test state
        lastWorkerInstance = null
        autoRespond = true
        shouldError = false
        responseDelay = 0
        
        // Use MockWorker for all tests
        globalThis.Worker = MockWorker as any
    })
    
    afterEach(() => {
        // Restore original Worker
        globalThis.Worker = originalWorker
    })

    describe('slice', () => {
        it('should send slice request to worker', async () => {
            // Import inside test to use mocked Worker
            const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
            const engine = new SlicerEngine()
            const vertices = createTestVertices()
            const config = createTestConfig()
            
            const result = await engine.slice(vertices, config)
            
            expect(lastWorkerInstance).toBeDefined()
            expect(lastWorkerInstance!.receivedMessages.length).toBeGreaterThan(0)
            expect(lastWorkerInstance!.receivedMessages[0].type).toBe('slice')
        })

        it('should return gcode and result on success', async () => {
            const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
            const engine = new SlicerEngine()
            const vertices = createTestVertices()
            const config = createTestConfig()
            
            const result = await engine.slice(vertices, config)
            
            expect(result.gcode).toContain('G28')
            expect(result.result.layerCount).toBe(100)
            expect(result.result.filamentUsedM).toBe(5)
        })

        it('should call progress callback', async () => {
            const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
            const engine = new SlicerEngine()
            const vertices = createTestVertices()
            const config = createTestConfig()
            
            // Disable auto-respond to manually control responses
            autoRespond = false
            const progressUpdates: any[] = []
            
            const slicePromise = engine.slice(vertices, config, (progress) => {
                progressUpdates.push({ ...progress })
            })
            
            // Wait for postMessage to be called
            await new Promise(r => setTimeout(r, 10))
            
            const jobId = lastWorkerInstance!.receivedMessages[0].id
            
            // Simulate progress updates
            lastWorkerInstance!.simulateResponse({
                type: 'progress',
                id: jobId,
                progress: 25,
                stage: 'slicing',
                message: 'Slicing layer 25/100',
            })
            
            lastWorkerInstance!.simulateResponse({
                type: 'progress',
                id: jobId,
                progress: 50,
                stage: 'slicing',
                message: 'Slicing layer 50/100',
            })
            
            // Complete
            lastWorkerInstance!.simulateResponse({
                type: 'complete',
                id: jobId,
                gcode: 'G28',
                result: {
                    layerCount: 100,
                    filamentUsedMm: 1000,
                    filamentUsedM: 1,
                    filamentWeightG: 3,
                    estimatedTimeS: 600,
                    estimatedTimeFormatted: '10m',
                    gcodeSize: 100,
                },
            })
            
            await slicePromise
            
            expect(progressUpdates.length).toBeGreaterThan(0)
            expect(progressUpdates[0].progress).toBe(25)
            expect(progressUpdates[1].progress).toBe(50)
        })

        it('should reject on worker error', async () => {
            const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
            const engine = new SlicerEngine()
            const vertices = createTestVertices()
            const config = createTestConfig()
            
            shouldError = true
            
            await expect(engine.slice(vertices, config)).rejects.toThrow('Slicing failed')
        })
    })

    describe('cancel', () => {
        it('should reject pending jobs on cancel', async () => {
            const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
            const engine = new SlicerEngine()
            const vertices = createTestVertices()
            const config = createTestConfig()
            
            // Disable auto-respond to simulate a long-running operation
            autoRespond = false
            
            // Start slice but don't await
            const slicePromise = engine.slice(vertices, config)
            
            // Wait for slice to register
            await new Promise(r => setTimeout(r, 10))
            
            // Cancel all immediately
            engine.cancel()
            
            // Should reject
            await expect(slicePromise).rejects.toThrow('cancelled')
        })
    })
})

describe('SlicerEngine - Regression Tests', () => {
    let originalWorker: typeof Worker
    
    beforeEach(() => {
        originalWorker = globalThis.Worker
        lastWorkerInstance = null
        autoRespond = true
        shouldError = false
        responseDelay = 0
        globalThis.Worker = MockWorker as any
    })
    
    afterEach(() => {
        globalThis.Worker = originalWorker
    })

    it('should handle empty vertices array', async () => {
        const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
        const engine = new SlicerEngine()
        const vertices = new Float32Array(0)
        const config = createTestConfig()
        
        const result = await engine.slice(vertices, config)
        
        // Worker should still be called
        expect(lastWorkerInstance!.receivedMessages.length).toBeGreaterThan(0)
        expect(result.gcode).toBeDefined()
    })

    it('should handle worker crash', async () => {
        const { SlicerEngine } = await import('@/util/slicer/SlicerEngine')
        const engine = new SlicerEngine()
        const vertices = createTestVertices()
        const config = createTestConfig()
        
        // Disable auto-respond and simulate crash
        autoRespond = false
        
        const slicePromise = engine.slice(vertices, config)
        
        // Wait for worker to be created
        await new Promise(r => setTimeout(r, 10))
        
        // Simulate worker crash
        lastWorkerInstance!.simulateError()
        
        await expect(slicePromise).rejects.toThrow()
    })
})
