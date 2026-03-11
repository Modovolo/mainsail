import { parseGcode } from './parser'
import type { ParsedGcode } from './types'

type ParseRequest = {
    type: 'parse'
    id: string
    gcode: string
}

type ParseCancelRequest = {
    type: 'cancel'
    id: string
}

type WorkerRequest = ParseRequest | ParseCancelRequest

type ProgressResponse = {
    type: 'progress'
    id: string
    progress: number
}

type CompleteResponse = {
    type: 'complete'
    id: string
    parsed: ParsedGcode
}

type ErrorResponse = {
    type: 'error'
    id: string
    error: string
}

type WorkerResponse = ProgressResponse | CompleteResponse | ErrorResponse

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
        const parsed = parseGcode(msg.gcode, (progress) => {
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
            parsed,
        } as CompleteResponse)
    } catch (error: any) {
        if (error?.message === 'Cancelled') return

        ctx.postMessage({
            type: 'error',
            id: msg.id,
            error: error?.message ?? 'Failed to parse G-code',
        } as ErrorResponse)
    }
})
