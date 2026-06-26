/**
 * Slicer Service Client
 *
 * Provides an interface for communicating with the backend slicer service.
 * Handles mesh uploads, slicing jobs, progress tracking, and result downloads.
 */

import { PrinterProfile, SliceParams, SliceResult } from '@/store/prepare/types'

export interface SliceJobRequest {
    meshes: ArrayBuffer[] // STL binary data
    params: SliceParams
    printerProfile?: string
    printerProfileConfig?: PrinterProfile
}

export interface SliceJobResponse {
    job_id: string
    status: 'queued' | 'processing' | 'complete' | 'error'
    message?: string
}

export interface SliceProgressEvent {
    job_id: string
    progress: number // 0-100
    message: string
    stage: 'preparing' | 'slicing' | 'generating' | 'complete'
}

export interface SliceCompleteEvent {
    job_id: string
    result: SliceResult
    gcode_url: string
}

export interface SliceErrorEvent {
    job_id: string
    error: string
    details?: string
}

type ProgressCallback = (event: SliceProgressEvent) => void
type CompleteCallback = (event: SliceCompleteEvent) => void
type ErrorCallback = (event: SliceErrorEvent) => void

export class SlicerClient {
    private baseUrl: string
    private ws: WebSocket | null = null
    private jobCallbacks: Map<
        string,
        {
            onProgress?: ProgressCallback
            onComplete?: CompleteCallback
            onError?: ErrorCallback
        }
    > = new Map()

    constructor(baseUrl?: string) {
        // Default to relative URL for same-origin deployment
        this.baseUrl = baseUrl || '/api/slicer'
    }

    /**
     * Check if the slicer service is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })
            return response.ok
        } catch {
            return false
        }
    }

    /**
     * Get supported slicer engines
     */
    async getEngines(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/engines`)
            if (!response.ok) throw new Error('Failed to fetch engines')
            const data = await response.json()
            return data.engines || []
        } catch (error) {
            console.error('SlicerClient: Failed to get engines', error)
            return []
        }
    }

    /**
     * Upload mesh and start slicing
     */
    async slice(
        request: SliceJobRequest,
        callbacks: {
            onProgress?: ProgressCallback
            onComplete?: CompleteCallback
            onError?: ErrorCallback
        } = {}
    ): Promise<string> {
        // Build FormData with meshes and params
        const formData = new FormData()

        request.meshes.forEach((mesh, index) => {
            const blob = new Blob([mesh], { type: 'application/octet-stream' })
            formData.append('meshes', blob, `model_${index}.stl`)
        })

        formData.append('params', JSON.stringify(request.params))

        if (request.printerProfile) {
            formData.append('printer_profile', request.printerProfile)
        }

        if (request.printerProfileConfig) {
            formData.append('printer_profile_config', JSON.stringify(request.printerProfileConfig))
        }

        // Submit the slice job
        const response = await fetch(`${this.baseUrl}/slice`, {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Slice request failed: ${error}`)
        }

        const result: SliceJobResponse = await response.json()
        const jobId = result.job_id

        // Store callbacks for this job
        this.jobCallbacks.set(jobId, callbacks)

        // Connect WebSocket for progress updates
        this.connectProgressSocket(jobId)

        return jobId
    }

    /**
     * Connect to WebSocket for real-time progress updates
     */
    private connectProgressSocket(jobId: string): void {
        const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws/job/${jobId}`

        try {
            this.ws = new WebSocket(wsUrl)

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    const callbacks = this.jobCallbacks.get(jobId)

                    if (!callbacks) return

                    switch (data.type) {
                        case 'progress':
                            callbacks.onProgress?.({
                                job_id: jobId,
                                progress: data.progress,
                                message: data.message,
                                stage: data.stage,
                            })
                            break

                        case 'complete':
                            callbacks.onComplete?.({
                                job_id: jobId,
                                result: data.result,
                                gcode_url: data.gcode_url,
                            })
                            this.cleanup(jobId)
                            break

                        case 'error':
                            callbacks.onError?.({
                                job_id: jobId,
                                error: data.error,
                                details: data.details,
                            })
                            this.cleanup(jobId)
                            break
                    }
                } catch (e) {
                    console.error('SlicerClient: Failed to parse WebSocket message', e)
                }
            }

            this.ws.onerror = (error) => {
                console.error('SlicerClient: WebSocket error', error)
                const callbacks = this.jobCallbacks.get(jobId)
                callbacks?.onError?.({
                    job_id: jobId,
                    error: 'WebSocket connection error',
                })
            }

            this.ws.onclose = () => {
                // Attempt reconnect if job is still active
                if (this.jobCallbacks.has(jobId)) {
                    setTimeout(() => this.connectProgressSocket(jobId), 2000)
                }
            }
        } catch (error) {
            console.error('SlicerClient: Failed to connect WebSocket', error)
            // Fall back to polling
            this.pollProgress(jobId)
        }
    }

    /**
     * Fallback: Poll for progress if WebSocket is unavailable
     */
    private async pollProgress(jobId: string): Promise<void> {
        const callbacks = this.jobCallbacks.get(jobId)
        if (!callbacks) return

        try {
            const response = await fetch(`${this.baseUrl}/job/${jobId}`)
            if (!response.ok) throw new Error('Failed to fetch job status')

            const data = await response.json()

            if (data.status === 'processing') {
                callbacks.onProgress?.({
                    job_id: jobId,
                    progress: data.progress || 0,
                    message: data.message || 'Processing...',
                    stage: data.stage || 'slicing',
                })
                // Continue polling
                setTimeout(() => this.pollProgress(jobId), 1000)
            } else if (data.status === 'complete') {
                callbacks.onComplete?.({
                    job_id: jobId,
                    result: data.result,
                    gcode_url: data.gcode_url,
                })
                this.cleanup(jobId)
            } else if (data.status === 'error') {
                callbacks.onError?.({
                    job_id: jobId,
                    error: data.error || 'Unknown error',
                    details: data.details,
                })
                this.cleanup(jobId)
            } else {
                // Job is queued, keep polling
                setTimeout(() => this.pollProgress(jobId), 2000)
            }
        } catch (error) {
            console.error('SlicerClient: Poll error', error)
            callbacks.onError?.({
                job_id: jobId,
                error: 'Failed to fetch job status',
            })
            this.cleanup(jobId)
        }
    }

    /**
     * Cancel an active slicing job
     */
    async cancel(jobId: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/job/${jobId}/cancel`, {
                method: 'POST',
            })
            this.cleanup(jobId)
            return response.ok
        } catch {
            this.cleanup(jobId)
            return false
        }
    }

    /**
     * Download the generated G-code
     */
    async downloadGcode(gcodeUrl: string): Promise<Blob> {
        const response = await fetch(gcodeUrl)
        if (!response.ok) throw new Error('Failed to download G-code')
        return response.blob()
    }

    /**
     * Get G-code as text (for preview)
     */
    async getGcodeText(gcodeUrl: string): Promise<string> {
        const response = await fetch(gcodeUrl)
        if (!response.ok) throw new Error('Failed to fetch G-code')
        return response.text()
    }

    /**
     * Clean up resources for a completed/cancelled job
     */
    private cleanup(jobId: string): void {
        this.jobCallbacks.delete(jobId)
        if (this.ws && this.jobCallbacks.size === 0) {
            this.ws.close()
            this.ws = null
        }
    }

    /**
     * Disconnect all WebSocket connections
     */
    disconnect(): void {
        this.jobCallbacks.clear()
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }
}

// Singleton instance
let slicerClientInstance: SlicerClient | null = null

export function getSlicerClient(baseUrl?: string): SlicerClient {
    if (!slicerClientInstance) {
        slicerClientInstance = new SlicerClient(baseUrl)
    }
    return slicerClientInstance
}

/**
 * Mock slicer for local/demo use when no backend is available
 */
export class MockSlicerClient extends SlicerClient {
    async isAvailable(): Promise<boolean> {
        return true
    }

    async slice(
        request: SliceJobRequest,
        callbacks: {
            onProgress?: ProgressCallback
            onComplete?: CompleteCallback
            onError?: ErrorCallback
        } = {}
    ): Promise<string> {
        const jobId = 'mock-' + Date.now().toString(36)

        // Simulate slicing progress
        let progress = 0
        const stages = ['preparing', 'slicing', 'generating', 'complete'] as const
        let stageIndex = 0

        const interval = setInterval(() => {
            progress += Math.random() * 15 + 5
            if (progress > 100) progress = 100

            if (progress < 30) stageIndex = 0
            else if (progress < 70) stageIndex = 1
            else if (progress < 95) stageIndex = 2
            else stageIndex = 3

            const messages = [
                'Analyzing mesh geometry...',
                'Generating layer paths...',
                'Optimizing travel moves...',
                'Finalizing G-code...',
            ]

            callbacks.onProgress?.({
                job_id: jobId,
                progress,
                message: messages[stageIndex],
                stage: stages[stageIndex],
            })

            if (progress >= 100) {
                clearInterval(interval)

                // Calculate mock results based on mesh size
                const totalBytes = request.meshes.reduce((sum, m) => sum + m.byteLength, 0)
                const estimatedLayers = Math.round(50 + Math.random() * 200)
                const estimatedMinutes = Math.round(30 + Math.random() * 180)

                const result: SliceResult = {
                    layer_count: estimatedLayers,
                    filament_used_m: Math.round((totalBytes / 10000 + Math.random() * 5) * 10) / 10,
                    filament_weight_g: Math.round((totalBytes / 5000 + Math.random() * 20) * 10) / 10,
                    estimated_time_formatted: `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`,
                }

                callbacks.onComplete?.({
                    job_id: jobId,
                    result,
                    gcode_url: '', // No actual G-code for mock
                })
            }
        }, 200)

        return jobId
    }

    async cancel(): Promise<boolean> {
        return true
    }
}

/**
 * Get either real or mock slicer client based on availability
 */
export async function getAvailableSlicerClient(baseUrl?: string): Promise<SlicerClient> {
    const realClient = getSlicerClient(baseUrl)
    const available = await realClient.isAvailable()

    if (available) {
        return realClient
    }

    console.info('SlicerClient: Backend not available, using mock slicer')
    return new MockSlicerClient()
}
