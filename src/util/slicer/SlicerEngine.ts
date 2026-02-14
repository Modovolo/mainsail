/**
 * Slicer Engine
 *
 * Main-thread wrapper that manages the slicer Web Worker.
 * Handles job submission, progress tracking, cancellation, and result retrieval.
 *
 * Usage:
 *   const engine = new SlicerEngine()
 *   const result = await engine.slice(vertices, config, onProgress)
 *   // result.gcode contains the generated G-code string
 */

import { SlicerConfig, WorkerResponse, SliceResultData } from './types'

export interface SliceProgress {
    progress: number
    stage: string
    message: string
}

export interface SliceOutput {
    gcode: string
    result: SliceResultData
}

type ProgressCallback = (progress: SliceProgress) => void

interface PendingJob {
    resolve: (output: SliceOutput) => void
    reject: (error: Error) => void
    onProgress?: ProgressCallback
}

export class SlicerEngine {
    private worker: Worker | null = null
    private pendingJobs: Map<string, PendingJob> = new Map()
    private jobCounter = 0

    /**
     * Create or return the slicer Web Worker.
     * Uses Vite's `?worker` import pattern for proper bundling.
     */
    private getWorker(): Worker {
        if (!this.worker) {
            // Vite worker import — the worker file is bundled separately
            this.worker = new Worker(
                new URL('./slicer.worker.ts', import.meta.url),
                { type: 'module' }
            )

            this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
                this.handleWorkerMessage(event.data)
            })

            this.worker.addEventListener('error', (event) => {
                console.error('Slicer worker error:', event)
                // Reject all pending jobs
                for (const [id, job] of this.pendingJobs) {
                    job.reject(new Error('Slicer worker crashed'))
                }
                this.pendingJobs.clear()
                this.worker = null
            })
        }
        return this.worker
    }

    /**
     * Handle messages from the worker
     */
    private handleWorkerMessage(msg: WorkerResponse) {
        const job = this.pendingJobs.get(msg.id)
        if (!job) return

        switch (msg.type) {
            case 'progress':
                job.onProgress?.({
                    progress: msg.progress,
                    stage: msg.stage,
                    message: msg.message,
                })
                break

            case 'complete':
                job.resolve({ gcode: msg.gcode, result: msg.result })
                this.pendingJobs.delete(msg.id)
                break

            case 'error':
                job.reject(new Error(msg.error))
                this.pendingJobs.delete(msg.id)
                break
        }
    }

    /**
     * Generate a unique job ID
     */
    private nextJobId(): string {
        return `slice-${++this.jobCounter}-${Date.now().toString(36)}`
    }

    /**
     * Slice a mesh with the given configuration.
     *
     * @param vertices - Raw vertex data (flat Float32Array, 9 floats per triangle)
     * @param config - Slicer configuration
     * @param onProgress - Optional progress callback
     * @returns Promise that resolves with G-code and statistics
     */
    async slice(
        vertices: Float32Array,
        config: SlicerConfig,
        onProgress?: ProgressCallback
    ): Promise<SliceOutput> {
        const id = this.nextJobId()
        const worker = this.getWorker()

        return new Promise<SliceOutput>((resolve, reject) => {
            this.pendingJobs.set(id, { resolve, reject, onProgress })

            // Transfer the vertices buffer to the worker for zero-copy
            worker.postMessage(
                { type: 'slice', id, vertices, config },
                [vertices.buffer]
            )
        })
    }

    /**
     * Cancel a running slicing job
     */
    cancel(jobId?: string) {
        if (jobId) {
            this.worker?.postMessage({ type: 'cancel', id: jobId })
            const job = this.pendingJobs.get(jobId)
            if (job) {
                job.reject(new Error('Slicing cancelled'))
                this.pendingJobs.delete(jobId)
            }
        } else {
            // Cancel all
            for (const [id, job] of this.pendingJobs) {
                this.worker?.postMessage({ type: 'cancel', id })
                job.reject(new Error('Slicing cancelled'))
            }
            this.pendingJobs.clear()
        }
    }

    /**
     * Destroy the worker (call on page unmount)
     */
    destroy() {
        this.cancel()
        this.worker?.terminate()
        this.worker = null
    }
}

// Singleton for app-wide use
let _engine: SlicerEngine | null = null

export function getSlicerEngine(): SlicerEngine {
    if (!_engine) {
        _engine = new SlicerEngine()
    }
    return _engine
}
