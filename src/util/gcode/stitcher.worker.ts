/**
 * G-code Stitcher Web Worker
 *
 * Offloads G-code stitching to a background thread for large files.
 * Follows the same pattern as parser.worker.ts.
 */

import { stitchGcodes, type StitchPart, type StitchOptions } from './stitcher'

type StitchRequest = {
    type: 'stitch'
    id: string
    parts: StitchPart[]
    options?: Partial<StitchOptions>
}

type CancelRequest = {
    type: 'cancel'
    id: string
}

type WorkerRequest = StitchRequest | CancelRequest

type ProgressResponse = {
    type: 'progress'
    id: string
    progress: number
}

type CompleteResponse = {
    type: 'complete'
    id: string
    gcode: string
}

type ErrorResponse = {
    type: 'error'
    id: string
    error: string
}

export type StitcherWorkerResponse = ProgressResponse | CompleteResponse | ErrorResponse

const ctx = self as unknown as Worker
const cancelledJobs = new Set<string>()

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data

    if (msg.type === 'cancel') {
        cancelledJobs.add(msg.id)
        return
    }

    cancelledJobs.delete(msg.id)

    try {
        const result = stitchGcodes(msg.parts, msg.options, (progress) => {
            if (cancelledJobs.has(msg.id)) {
                throw new Error('Cancelled')
            }
            ctx.postMessage({
                type: 'progress',
                id: msg.id,
                progress,
            } as ProgressResponse)
        })

        if (cancelledJobs.has(msg.id)) return

        ctx.postMessage({
            type: 'complete',
            id: msg.id,
            gcode: result,
        } as CompleteResponse)
    } catch (error: any) {
        if (error?.message === 'Cancelled') return

        ctx.postMessage({
            type: 'error',
            id: msg.id,
            error: error?.message ?? 'Failed to stitch G-code',
        } as ErrorResponse)
    }
})
