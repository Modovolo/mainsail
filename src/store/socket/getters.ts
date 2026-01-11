import { GetterTree } from 'vuex'
import { SocketState } from '@/store/socket/types'
import { RootState } from '@/store/types'

export const getters: GetterTree<SocketState, RootState> = {
    getUrl: (state) => {
        const port = state.port !== 80 ? ':' + state.port : ''
        let path = '/' + state.path.replace(/^\/|\/$/g, '')

        // remove last / in path
        if (path.endsWith('/')) path = path.slice(0, -1)

        return `//${state.hostname}${port}${path}`
    },

    getHostUrl: (state) => {
        const protocol = state.protocol === 'wss' ? 'https' : 'http'

        return `${protocol}://${state.hostname}/`
    },

    getWebsocketUrl: (state, getters) => {
        return state.protocol + ':' + getters['getUrl'] + '/websocket'
    },

    /**
     * Get the URL for the actual printer.
     * In fleet mode, this uses the printer's hostname (e.g., bfp8)
     * In normal mode, this returns the same as getHostUrl
     */
    getPrinterHostUrl: (state) => {
        // In fleet mode, use the printer name as hostname
        // Always use HTTP for direct printer access (local network)
        if (state.fleetPrinterName) {
            return `http://${state.fleetPrinterName}/`
        }

        const protocol = state.protocol === 'wss' ? 'https' : 'http'
        return `${protocol}://${state.hostname}/`
    },
}
