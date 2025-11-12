import { printer } from '@/store/farm/printer'
import { Module } from 'vuex'
import { FarmState } from '@/store/farm/types'
import { RootState } from '@/store/types'

const normalizeGroup = (value: unknown): string | null => {
    if (typeof value !== 'string') return null

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export const getDefaultState = (): FarmState => {
    return {}
}

// initial state
const state = () => {
    return getDefaultState()
}

export const farm: Module<FarmState, RootState> = {
    namespaced: true,
    state: state,
    getters: {
        countPrinters: (state) => {
            return Object.keys(state).length
        },
        getPrinters: (state) => {
            return state
        },
        getPrinterName: (state, getters) => (namespace: string) => {
            return getters[namespace + '/getPrinterName']
        },
        getPrinterSocketState: (state, getters) => (namespace: string) => {
            return (
                getters[namespace + '/getPrinterSocketState'] ?? {
                    isConnecting: false,
                    isConnected: false,
                }
            )
        },
        existsPrinter: (state) => (namespace: string) => {
            return Object.keys(state).includes(namespace)
        },
    },
    actions: {
        registerPrinter({ commit, dispatch }, payload) {
            if (!this.hasModule(['farm', payload.id])) {
                this.registerModule(['farm', payload.id], printer)
                commit('farm/' + payload.id + '/setSocketData', { ...payload, _namespace: payload.id }, { root: true })

                if ('settings' in payload) {
                    const settings = {
                        ...(payload.settings ?? {}),
                    }

                    if (Object.prototype.hasOwnProperty.call(settings, 'group')) {
                        settings.group = normalizeGroup(settings.group)
                    }

                    commit('farm/' + payload.id + '/setSettings', settings, { root: true })
                }
                dispatch('farm/' + payload.id + '/connect', {}, { root: true })
            }
        },
        updatePrinter({ dispatch, commit }, payload) {
            commit(payload.id + '/setSocketData', {
                hostname: payload.values.hostname,
                port: payload.values.port,
                path: payload.values.path,
                isConnecting: true,
            })

            const hasGroupOnRoot = Object.prototype.hasOwnProperty.call(payload.values, 'group')
            const hasGroupInSettings = Object.prototype.hasOwnProperty.call(payload.values.settings ?? {}, 'group')

            if (hasGroupOnRoot || hasGroupInSettings) {
                const rawGroup = hasGroupOnRoot ? payload.values.group : payload.values.settings?.group
                const group = normalizeGroup(rawGroup)
                commit(payload.id + '/setSettings', { group })
            }
            dispatch(payload.id + '/reconnect')
        },
        unregisterPrinter({ state }, id) {
            if (id in state) {
                state[id].socket?.instance?.close()
                this.unregisterModule(['farm', id])
            }
        },
    },
    mutations: {},
}
