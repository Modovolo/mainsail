export interface SocketState {
    hostname: string
    port: number
    path: string
    protocol: string
    reconnectInterval: number
    isConnected: boolean
    isConnecting: boolean
    connectingFailed: boolean
    connectionFailedMessage: string | null
    loadings: string[]
    initializationList: string[]
    connection_id: number | null
    // Fleet mode socket state
    fleetSocketConnected: boolean
    fleetPrinterId: string | null
    fleetPrinterName: string | null
    fleetPrinterConnected: boolean | null  // null = unknown, true = printer online, false = printer offline
}
