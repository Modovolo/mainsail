import router from '@/plugins/router'
import { ActionTree } from 'vuex'
import { ConfigJson, RootState } from './types'

export const actions: ActionTree<RootState, RootState> = {
    switchToDashboard() {
        if (router.currentRoute.fullPath !== '/') router.push('/')
    },

    changePrinter({ dispatch, getters }, payload) {
        dispatch('files/reset')
        dispatch('gui/reset')
        dispatch('printer/reset')
        dispatch('server/reset')
        dispatch('socket/reset')

        const printerSocket = getters['farm/' + payload.printer + '/getSocketData']

        dispatch('socket/setSocket', {
            hostname: printerSocket.hostname,
            port: printerSocket.port,
            path: printerSocket.path,
        })
    },

    /**
     * Disconnect from the currently connected printer and return to the
     * manager host (the website host). This resets frontend state and points
     * the socket back to the local manager (window.location), so you can use
     * manager-only features (files, farm manager UI) without being connected
     * to a remote Klipper instance.
     */
    disconnectToManager({ dispatch }) {
        // Reset state similar to changePrinter
        dispatch('files/reset')
        dispatch('gui/reset')
        dispatch('printer/reset')
        dispatch('server/reset')
        dispatch('socket/reset')

        const hostname = window.location.hostname || 'localhost'
        const defaultPort = window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80)

        dispatch('socket/setSocket', { hostname: hostname, port: defaultPort, path: '' })
    },

    setNaviDrawer({ commit }, payload) {
        commit('setNaviDrawer', payload)
    },

    /**
     * This function will parse the config.json content and config mainsail
     */
    async importConfigJson({ commit }, payload: ConfigJson) {
        type RootStateInstancesDbType = 'moonraker' | 'browser' | 'json' | 'fleet'
        let instancesDB: RootStateInstancesDbType = payload.instancesDB ?? 'moonraker'
        if (import.meta.env.VUE_APP_INSTANCES_DB)
            instancesDB = import.meta.env.VUE_APP_INSTANCES_DB as RootStateInstancesDbType

        if (instancesDB !== 'moonraker') {
            commit('setInstancesDB', instancesDB)

            if (
                instancesDB === 'json' &&
                'instances' in payload &&
                Array.isArray(payload.instances) &&
                payload.instances.length
            ) {
                commit('setConfigInstances', payload.instances)
            }

            return
        }

        if (payload.hostname) commit('socket/setData', { hostname: payload.hostname })
        if (payload.port) commit('socket/setData', { port: parseInt(payload.port.toString()) })
        if (payload.path) commit('socket/setData', { route_prefix: payload.path })
    },
}
