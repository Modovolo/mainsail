import { Store } from 'vuex'
import _Vue from 'vue'
import { RootState } from '@/store/types'

interface FleetWait {
    id: number
    params?: Record<string, unknown>
    action: string | null
    actionPayload?: Record<string, unknown>
    loading: string | null
    resolve?: (value: unknown) => void
    reject?: (reason: unknown) => void
}

interface FleetEmitOptions {
    action?: string
    actionPayload?: Record<string, unknown>
    loading?: string
}

/**
 * FleetSocketClient - WebSocket client for fleet-proxied printer connections
 * Connects to /ws/client/{printerId} on the fleet-manager to proxy
 * JSON-RPC commands to the printer's Moonraker instance.
 */
export class FleetSocketClient {
    private printerId: string = ''
    private instance: WebSocket | null = null
    private store: Store<RootState> | null = null
    private waits: FleetWait[] = []
    private messageId: number = 0
    private reconnects: number = 0
    private maxReconnects: number = 5
    private reconnectInterval: number = 2000
    private isConnecting: boolean = false
    private isConnected: boolean = false
    private heartbeatTimer: number | null = null

    constructor(store: Store<RootState>) {
        this.store = store
    }

    get connected(): boolean {
        return this.isConnected
    }

    get connecting(): boolean {
        return this.isConnecting
    }

    get currentPrinterId(): string {
        return this.printerId
    }

    /**
     * Connect to a specific printer via fleet-manager proxy
     */
    async connect(printerId: string): Promise<boolean> {
        if (this.printerId === printerId && this.isConnected) {
            return true
        }

        // Close existing connection if different printer
        if (this.printerId !== printerId) {
            this.close()
        }

        this.printerId = printerId
        this.isConnecting = true
        this.reconnects = 0

        // Build the WebSocket URL for fleet-manager proxy
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const host = window.location.host
        const url = `${protocol}://${host}/ws/client/${printerId}`

        console.log(`[FleetSocket] Connecting to ${url}`)

        return new Promise((resolve) => {
            try {
                this.instance = new WebSocket(url)

                this.instance.onopen = () => {
                    console.log(`[FleetSocket] Connected to printer ${printerId}`)
                    this.isConnecting = false
                    this.isConnected = true
                    this.reconnects = 0
                    this.startHeartbeat()

                    // Notify store of fleet socket connection
                    this.store?.commit('socket/setFleetSocketConnected', true)

                    resolve(true)
                }

                this.instance.onclose = (e) => {
                    console.log(`[FleetSocket] Connection closed:`, e.code, e.reason)
                    this.isConnected = false
                    this.isConnecting = false
                    this.stopHeartbeat()

                    this.store?.commit('socket/setFleetSocketConnected', false)

                    // Auto-reconnect if not a clean close
                    if (!e.wasClean && this.reconnects < this.maxReconnects && this.printerId) {
                        this.reconnects++
                        console.log(`[FleetSocket] Reconnecting (${this.reconnects}/${this.maxReconnects})...`)
                        setTimeout(() => {
                            this.connect(this.printerId)
                        }, this.reconnectInterval)
                    }

                    resolve(false)
                }

                this.instance.onerror = (err) => {
                    console.error('[FleetSocket] Error:', err)
                    this.instance?.close()
                }

                this.instance.onmessage = (msg) => {
                    this.handleMessage(msg.data)
                }
            } catch (err) {
                console.error('[FleetSocket] Failed to connect:', err)
                this.isConnecting = false
                resolve(false)
            }
        })
    }

    /**
     * Close the WebSocket connection
     */
    close(): void {
        this.stopHeartbeat()
        this.isConnected = false
        this.isConnecting = false
        this.printerId = ''
        this.waits = []
        this.messageId = 0

        if (this.instance) {
            this.instance.close()
            this.instance = null
        }

        this.store?.commit('socket/setFleetSocketConnected', false)
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(data: string): void {
        try {
            const parsed = JSON.parse(data)

            // Handle connection status messages from fleet-manager
            if (parsed.type === 'connection_status') {
                console.log('[FleetSocket] Connection status:', parsed)
                
                // Update printer connected state
                const isConnected = parsed.connected === true
                this.store?.commit('socket/setFleetPrinterConnected', isConnected)
                console.log('[FleetSocket] Printer connected:', isConnected)
                
                // Store the printer hostname for use with webcam URLs (only if connected)
                if (isConnected) {
                    // The hostname is in printer_data.printer_info.result.hostname
                    const hostname = parsed.status?.printer_data?.printer_info?.result?.hostname ?? null
                    console.log('[FleetSocket] Setting printer hostname for webcam URLs:', hostname)
                    this.store?.commit('socket/setFleetPrinterName', hostname)
                }
                return
            }

            // Handle JSON-RPC responses
            if ('id' in parsed) {
                const wait = this.waits.find((w) => w.id === parsed.id)

                if (wait) {
                    if ('error' in parsed) {
                        console.error('[FleetSocket] JSON-RPC error:', parsed.error)
                        wait.reject?.(parsed.error)
                    } else {
                        wait.resolve?.(parsed.result ?? {})

                        // Dispatch to action if specified
                        if (wait.action) {
                            let result = parsed.result
                            if (result === 'ok') result = { result: result }
                            if (typeof result === 'string') result = { result: result }

                            const payload: Record<string, unknown> = {}
                            if (wait.actionPayload) Object.assign(payload, wait.actionPayload)
                            Object.assign(payload, { requestParams: wait.params })
                            Object.assign(payload, result)

                            this.store?.dispatch(wait.action, payload)
                        }
                    }

                    // Remove loading state
                    if (wait.loading) {
                        this.store?.dispatch('socket/removeLoading', { name: wait.loading })
                    }

                    // Remove wait
                    const index = this.waits.indexOf(wait)
                    if (index > -1) this.waits.splice(index, 1)

                    return
                }
            }

            // Handle JSON-RPC notifications (method calls without id)
            if ('method' in parsed && !('id' in parsed)) {
                // Forward to store's message handler for notifications
                this.store?.dispatch('socket/onMessage', parsed)
                return
            }

            console.log('[FleetSocket] Unhandled message:', parsed)
        } catch (err) {
            console.error('[FleetSocket] Failed to parse message:', err)
        }
    }

    /**
     * Send a JSON-RPC method call (fire and forget with optional action callback)
     */
    emit(method: string, params: Record<string, unknown> = {}, options: FleetEmitOptions = {}): void {
        if (!this.instance || this.instance.readyState !== WebSocket.OPEN) {
            console.warn('[FleetSocket] Cannot emit - not connected')
            return
        }

        const id = this.messageId++
        this.waits.push({
            id,
            params,
            action: options.action ?? null,
            actionPayload: options.actionPayload ?? {},
            loading: options.loading ?? null,
        })

        if (options.loading) {
            this.store?.dispatch('socket/addLoading', { name: options.loading })
        }

        const message = JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
            id,
        })

        console.log('[FleetSocket] Sending:', method, params)
        this.instance.send(message)
    }

    /**
     * Send a JSON-RPC method call and wait for the response
     */
    async emitAndWait(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        return new Promise((resolve, reject) => {
            if (!this.instance || this.instance.readyState !== WebSocket.OPEN) {
                reject(new Error('Not connected'))
                return
            }

            const id = this.messageId++
            this.waits.push({
                id,
                params,
                action: null,
                loading: null,
                resolve,
                reject,
            })

            const message = JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id,
            })

            console.log('[FleetSocket] Sending (await):', method, params)
            this.instance.send(message)
        })
    }

    /**
     * Heartbeat to keep connection alive
     */
    private startHeartbeat(): void {
        this.stopHeartbeat()
        this.heartbeatTimer = window.setInterval(() => {
            if (this.instance?.readyState === WebSocket.OPEN) {
                // Send a lightweight ping via JSON-RPC
                this.emit('server.info', {})
            }
        }, 30000)
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            window.clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }
}

// Singleton instance
let fleetSocketInstance: FleetSocketClient | null = null

/**
 * Get or create the fleet socket client instance
 */
export function getFleetSocket(store?: Store<RootState>): FleetSocketClient {
    if (!fleetSocketInstance && store) {
        fleetSocketInstance = new FleetSocketClient(store)
    }

    if (!fleetSocketInstance) {
        throw new Error('FleetSocketClient not initialized - pass store on first call')
    }

    return fleetSocketInstance
}

/**
 * Vue plugin for fleet socket
 */
export default {
    install(Vue: typeof _Vue, options: { store: Store<RootState> }): void {
        const fleetSocket = new FleetSocketClient(options.store)
        fleetSocketInstance = fleetSocket

        Vue.prototype.$fleetSocket = fleetSocket
    },
}

// Type declaration for Vue
declare module 'vue/types/vue' {
    interface Vue {
        $fleetSocket: FleetSocketClient
    }
}
