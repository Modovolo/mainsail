import { ActionTree } from 'vuex'
import { RootState } from '@/store/types'
import { v4 as uuidv4 } from 'uuid'
import Vue from 'vue'
import { GuiRemoteprintersState } from '@/store/gui/remoteprinters/types'

const normalizeGroup = (value: unknown): string | null => {
    if (typeof value !== 'string') return null

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export const actions: ActionTree<GuiRemoteprintersState, RootState> = {
    reset({ commit, dispatch, state }) {
        Object.keys(state.printers).forEach((printerId) => {
            dispatch('farm/unregisterPrinter', printerId, { root: true })
        })

        commit('reset')
    },

    initFromLocalstorage({ dispatch, rootState }) {
        let value = rootState.configInstances ?? []
        if (rootState.instancesDB === 'browser') value = JSON.parse(localStorage.getItem('printers') ?? '{}')
        if (Array.isArray(value)) {
            const printers: any = {}

            value.forEach((printer) => {
                const id = uuidv4()
                printers[id] = printer
            })

            dispatch('initStore', printers)
        }
    },

    async initStore({ commit, dispatch }, payload) {
        dispatch('reset')
        Object.keys(payload).forEach((printerId: string) => {
            const printer = payload[printerId]
            const group = normalizeGroup(printer.group ?? printer.settings?.group)
            const printerValues = {
                ...printer,
                group,
                settings: {
                    ...(printer.settings ?? {}),
                    group,
                },
            }

            commit('store', { id: printerId, values: printerValues })
            dispatch(
                'farm/registerPrinter',
                {
                    id: printerId,
                    hostname: printer.hostname ?? '',
                    port: printer.port ?? 7125,
                    path: printer.path ?? '',
                    settings: {
                        ...(printer.settings ?? {}),
                        group,
                    },
                },
                { root: true }
            )
        })
    },

    upload({ state, rootState }, id) {
        if (rootState.instancesDB === 'browser') {
            const printers: any[] = []

            Object.keys(state.printers).forEach((printerId: string) => {
                const group = normalizeGroup(
                    state.printers[printerId].group ?? state.printers[printerId].settings?.group
                )

                printers.push({
                    hostname: state.printers[printerId].hostname,
                    port: state.printers[printerId].port,
                    name: state.printers[printerId].name,
                    path: state.printers[printerId].path,
                    group,
                    settings: {
                        ...(state.printers[printerId].settings ?? {}),
                        group,
                    },
                })
            })

            localStorage.setItem('printers', JSON.stringify(printers))
        } else if (rootState.instancesDB === 'moonraker' && id in state.printers) {
            const group = normalizeGroup(state.printers[id].group ?? state.printers[id].settings?.group)
            const value = {
                hostname: state.printers[id].hostname,
                port: state.printers[id].port,
                path: state.printers[id].path,
                group,
                settings: {
                    ...(state.printers[id].settings ?? {}),
                    group,
                },
            }

            Vue.$socket.emit('server.database.post_item', {
                namespace: 'mainsail',
                key: 'remoteprinters.printers.' + id,
                value,
            })
        }
    },

    store({ commit, dispatch }, payload) {
        const id = uuidv4()

        const group = normalizeGroup(payload.values.group ?? payload.values.settings?.group)
        const values = {
            ...payload.values,
            group,
            settings: {
                ...(payload.values.settings ?? {}),
                group,
            },
        }

        commit('store', { id, values })
        dispatch(
            'farm/registerPrinter',
            {
                id,
                hostname: payload.values.hostname ?? '',
                port: payload.values.port ?? 7125,
                path: payload.values.path ?? '',
                name: payload.values.name,
                settings: {
                    ...(payload.values.settings ?? {}),
                    group,
                },
            },
            { root: true }
        )

        dispatch('upload', id)
    },

    update({ commit, dispatch, state }, payload) {
        const existing = state.printers[payload.id] ?? { settings: {} }
        const requestedSettings = payload.values.settings ?? {}

        const mergedSettings: Record<string, unknown> = {
            ...(existing.settings ?? {}),
            ...requestedSettings,
        }

        const hasGroupOnRoot = Object.prototype.hasOwnProperty.call(payload.values, 'group')
        const hasGroupInSettings = Object.prototype.hasOwnProperty.call(requestedSettings, 'group')

        let groupToStore: string | null | undefined = undefined
        if (hasGroupOnRoot || hasGroupInSettings) {
            const rawGroup: unknown = hasGroupOnRoot ? payload.values.group : requestedSettings.group
            groupToStore = normalizeGroup(rawGroup)
            mergedSettings.group = groupToStore
        } else if (Object.prototype.hasOwnProperty.call(mergedSettings, 'group')) {
            mergedSettings.group = normalizeGroup(mergedSettings.group)
        }

        const updateValues: Record<string, unknown> = {
            ...payload.values,
            settings: mergedSettings,
        }

        if (groupToStore !== undefined) {
            updateValues.group = groupToStore
        }

        const updates = {
            id: payload.id,
            values: updateValues,
        }

        commit('update', updates)
        dispatch('farm/updatePrinter', updates, { root: true })

        dispatch('upload', payload.id)
    },

    updateSettings({ commit, dispatch, state }, payload) {
        const existing = state.printers[payload.id] ?? { settings: {} }
        const incomingSettings = payload.values ?? {}
        const mergedSettings = {
            ...(existing.settings ?? {}),
            ...incomingSettings,
        }
        const group = normalizeGroup(mergedSettings.group ?? existing.group)

        const updatePayload: { settings: Record<string, unknown>; group?: string | null } = {
            settings: {
                ...mergedSettings,
                group,
            },
        }

        updatePayload.group = group

        commit('update', {
            id: payload.id,
            values: updatePayload,
        })
        commit(
            'farm/' + payload.id + '/setSettings',
            {
                ...mergedSettings,
                group,
            },
            { root: true }
        )
        dispatch('upload', payload.id)
    },

    delete({ commit, dispatch, rootState }, id) {
        commit('delete', id)
        dispatch('farm/unregisterPrinter', id, { root: true })

        if (rootState.instancesDB === 'browser') dispatch('upload')
        else {
            Vue.$socket.emit('server.database.delete_item', {
                namespace: 'mainsail',
                key: 'remoteprinters.printers.' + id,
            })
        }
    },
}
