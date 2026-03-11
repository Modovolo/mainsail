import type { ParsedGcode } from './types'

interface ParseProgress {
    progress: number
}

type ProgressCallback = (progress: ParseProgress) => void

interface PendingJob {
    resolve: (parsed: ParsedGcode) => void
    reject: (error: Error) => void
    onProgress?: ProgressCallback
}

type WorkerProgressMessage = {
    type: 'progress'
    id: string
    progress: number
}

type WorkerCompleteMessage = {
    type: 'complete'
    id: string
    parsed: ParsedGcode
}

type WorkerErrorMessage = {
    type: 'error'
    id: string
    error: string
}

type WorkerResponse = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage

export class GcodeParserEngine {
    private worker: Worker | null = null
    private pendingJobs: Map<string, PendingJob> = new Map()
    private jobCounter = 0

    private getWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })

            this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
                this.handleWorkerMessage(event.data)
            })

            this.worker.addEventListener('error', () => {
                for (const [, job] of this.pendingJobs) {
                    job.reject(new Error('G-code parser worker crashed'))
                }
                this.pendingJobs.clear()
                this.worker = null
            })
        }

        return this.worker
    }

    private handleWorkerMessage(msg: WorkerResponse) {
        const job = this.pendingJobs.get(msg.id)
        if (!job) return

        switch (msg.type) {
            case 'progress':
                job.onProgress?.({ progress: msg.progress })
                break
            case 'complete':
                job.resolve(msg.parsed)
                this.pendingJobs.delete(msg.id)
                break
            case 'error':
                job.reject(new Error(msg.error))
                this.pendingJobs.delete(msg.id)
                break
        }
    }

    private nextJobId(): string {
        return `parse-${++this.jobCounter}-${Date.now().toString(36)}`
    }

    async parse(gcode: string, onProgress?: ProgressCallback): Promise<ParsedGcode> {
        const id = this.nextJobId()
        const worker = this.getWorker()

        return new Promise<ParsedGcode>((resolve, reject) => {
            this.pendingJobs.set(id, { resolve, reject, onProgress })
            worker.postMessage({ type: 'parse', id, gcode })
        })
    }

    cancel(jobId: string) {
        this.worker?.postMessage({ type: 'cancel', id: jobId })
        const job = this.pendingJobs.get(jobId)
        if (job) {
            job.reject(new Error('G-code parsing cancelled'))
            this.pendingJobs.delete(jobId)
        }
    }

    destroy() {
        for (const [, job] of this.pendingJobs) {
            job.reject(new Error('G-code parser engine destroyed'))
        }
        this.pendingJobs.clear()
        this.worker?.terminate()
        this.worker = null
    }
}

let _engine: GcodeParserEngine | null = null

export function getGcodeParserEngine(): GcodeParserEngine {
    if (!_engine) {
        _engine = new GcodeParserEngine()
    }
    return _engine
}
