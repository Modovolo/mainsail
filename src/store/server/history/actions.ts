import Vue from 'vue'
import { ActionTree } from 'vuex'
import { ServerHistoryState, ServerHistoryStateJob } from '@/store/server/history/types'
import { RootState } from '@/store/types'

export const actions: ActionTree<ServerHistoryState, RootState> = {
    reset({ commit }) {
        commit('reset')
    },

    init() {
        Vue.$socket.emit(
            'server.history.list',
            { start: 0, limit: 50, max: 100 },
            { action: 'server/history/getHistory' }
        )
        Vue.$socket.emit('server.history.totals', {}, { action: 'server/history/getTotals' })
    },

    /**
     * Initialize fetching history for a manager that should aggregate
     * history across connected farm printers. This will request history
     * from the local server and ask each registered farm printer for its
     * history as well. Responses from remote printers are routed through
     * farm/<printer>/forwardHistoryToManager -> server/history/getHistoryFromFarm
     */
    initFarmHistory({ commit, dispatch, rootGetters }, payload = { start: 0, limit: 50, max: 100 }) {
        // reset current store
        commit('reset')

        const start = payload.start ?? 0
        const limit = payload.limit ?? 50
        const max = payload.max ?? 100

        // fetch local server history
        Vue.$socket.emit('server.history.list', { start: start, limit: limit, max: max }, { action: 'server/history/getHistory' })
        Vue.$socket.emit('server.history.totals', {}, { action: 'server/history/getTotals' })

        // request history from each farm printer
        const printers = Object.keys(rootGetters['farm/getPrinters'] ?? {})
        // outstanding sources: local server + each farm printer
        const totalSources = printers.length + 1
        commit('setOutstandingFarmRequests', totalSources)
        commit('setOutstandingFarmTotal', totalSources)
        printers.forEach((printerId: string) => {
            // ask the farm printer to send its history back to the manager
            dispatch(
                'farm/' + printerId + '/sendObj',
                {
                    method: 'server.history.list',
                    params: { start: start, limit: limit, max: max },
                    // call into the printer module which will forward back to the manager
                    action: 'forwardHistoryToManager',
                    actionPreload: { printer: printerId },
                },
                { root: true }
            )
            // also request totals from remote printer so we can aggregate statistics
            dispatch(
                'farm/' + printerId + '/sendObj',
                {
                    method: 'server.history.totals',
                    params: {},
                    action: 'forwardTotalsToManager',
                    actionPreload: { printer: printerId },
                },
                { root: true }
            )
        })
    },

    getTotals({ commit }, payload) {
        commit('setTotals', payload.job_totals)

        const auxiliary_totals = payload.auxiliary_totals ?? []
        if (auxiliary_totals.length) {
            commit('setAuxiliaryTotals', auxiliary_totals)
        }
    },

    async getHistory({ commit, dispatch, state }, payload) {
        if ('requestParams' in payload && (payload.requestParams?.start ?? 0) === 0) commit('resetJobs')

        payload.jobs?.forEach((job: ServerHistoryStateJob) => {
            if (state.jobs.findIndex((stateJob) => stateJob.job_id === job.job_id) === -1) commit('addJob', job)
        })

        const start = payload.requestParams?.start ?? 0
        const limit = payload.requestParams?.limit ?? 50
        const max = payload.requestParams?.max ?? null

        if (limit > 0 && (max === null || max > start + limit) && (payload.jobs?.length ?? 0) === limit) {
            Vue.$socket.emit(
                'server.history.list',
                {
                    start: start + limit,
                    limit: limit,
                    max: max,
                },
                { action: 'server/history/getHistory' }
            )

            // stop here until all pulls are done
            return
        }

        if ((payload.jobs?.length ?? 0) < limit || payload.farm_done === true) {
            // when doing a farm-aggregated pull we expect multiple sources to finish
            if (state.outstanding_farm_requests && state.outstanding_farm_requests > 0) {
                commit('decrementOutstandingFarmRequests')
                // if this was the last outstanding source, clear the loading
                if ((state.outstanding_farm_requests ?? 0) === 0) {
                    dispatch('socket/removeLoading', { name: 'historyLoadAll' }, { root: true })
                    commit('setAllLoaded')
                }
            } else {
                // not an aggregated farm request, simple local-only completion
                dispatch('socket/removeLoading', { name: 'historyLoadAll' }, { root: true })
                commit('setAllLoaded')
            }
        }

        dispatch('loadHistoryNotes')
    },

    /**
     * History results coming from farm printers. These payloads are
     * forwarded by each farm/<printer> module. We mark each job with the
     * originating printer namespace and prefix job_id so entries stay
     * unique across the aggregated list.
     */
    async getHistoryFromFarm({ commit, dispatch, state }, payload) {
        const printer = payload.printer ?? 'unknown'

        // do not reset jobs here - the manager already reset state when starting the farm pull

        payload.jobs?.forEach((job: ServerHistoryStateJob) => {
            // mark originating printer and make job_id unique by prefixing the namespace
            const prefixedJob = { ...job, printer: printer, job_id: `${printer}::${job.job_id}` }

            if (state.jobs.findIndex((stateJob) => stateJob.job_id === prefixedJob.job_id) === -1) commit('addJob', prefixedJob)
        })

        const start = payload.requestParams?.start ?? 0
        const limit = payload.requestParams?.limit ?? 50
        const max = payload.requestParams?.max ?? null

        // if more pages are available for this printer, request the next chunk from that printer
        if (limit > 0 && (max === null || max > start + limit) && (payload.jobs?.length ?? 0) === limit) {
            const nextStart = start + limit
            const printerId = printer

            // ask the printer module to request next page and forward back
            dispatch(
                'farm/' + printerId + '/sendObj',
                {
                    method: 'server.history.list',
                    params: { start: nextStart, limit: limit, max: max },
                    action: 'forwardHistoryToManager',
                    actionPreload: { printer: printerId },
                },
                { root: true }
            )

            // stop here until pulls are done for this chunk
            return
        }

        // if this chunk is smaller than the limit, it means this printer is done sending history
        // decrement outstanding farm requests and clear loading if we've received everything
        if ((payload.jobs?.length ?? 0) < limit) {
            if (state.outstanding_farm_requests && state.outstanding_farm_requests > 0) {
                commit('decrementOutstandingFarmRequests')
                if ((state.outstanding_farm_requests ?? 0) === 0) {
                    dispatch('socket/removeLoading', { name: 'historyLoadAll' }, { root: true })
                    commit('setAllLoaded')
                }
            }
        }

        dispatch('loadHistoryNotes')
    },

    getTotalsFromFarm({ commit, state }, payload) {
        // payload.job_totals from remote printers - merge into the current totals
        // simple merge: add numeric totals; consumers expect aggregated numbers
        const totals = state.job_totals ?? {}
        const remote = payload.job_totals ?? {}

        // ensure numbers are present
        const merged = {
            total_jobs: (totals.total_jobs ?? 0) + (remote.total_jobs ?? 0),
            total_time: (totals.total_time ?? 0) + (remote.total_time ?? 0),
            total_print_time: (totals.total_print_time ?? 0) + (remote.total_print_time ?? 0),
            total_filament_used: (totals.total_filament_used ?? 0) + (remote.total_filament_used ?? 0),
            longest_job: Math.max(totals.longest_job ?? 0, remote.longest_job ?? 0),
            longest_print: Math.max(totals.longest_print ?? 0, remote.longest_print ?? 0),
        }

        commit('setTotals', merged)

        const auxiliary_totals = payload.auxiliary_totals ?? []
        if (auxiliary_totals.length) {
            // append or merge - for now we just replace/append
            commit('setAuxiliaryTotals', auxiliary_totals.concat((state.auxiliary_totals ?? []) as any))
        }
    },

    loadHistoryNotes({ dispatch, rootState }) {
        if (rootState.server?.dbNamespaces.includes('history_notes'))
            Vue.$socket.emit(
                'server.database.get_item',
                { namespace: 'history_notes' },
                { action: 'server/history/initHistoryNotes' }
            )
        else dispatch('socket/removeInitModule', 'server/history/init', { root: true })
    },

    async initHistoryNotes({ commit, dispatch }, payload) {
        const job_ids = Object.keys(payload.value)

        for (const job_id of job_ids) {
            const noteObject: { text: string } = payload.value[job_id]
            await commit('setHistoryNotes', {
                job_id,
                text: noteObject.text,
            })
        }

        await dispatch('socket/removeInitModule', 'server/history/init', { root: true })
    },

    getChanged({ commit }, payload) {
        if (payload.action === 'added') commit('addJob', payload.job)
        else if (payload.action === 'finished') commit('updateJob', payload.job)

        Vue.$socket.emit('server.history.totals', {}, { action: 'server/history/getTotals' })
    },

    getDeletedJobs({ commit }, payload) {
        if ('deleted_jobs' in payload && Array.isArray(payload.deleted_jobs)) {
            payload.deleted_jobs.forEach((jobId: ServerHistoryStateJob) => {
                commit('destroyJob', jobId)
            })
        }
    },

    saveHistoryNote({ commit }, payload: { job_id: string; note: string }) {
        Vue.$socket.emit('server.database.post_item', {
            namespace: 'history_notes',
            key: payload.job_id,
            value: { text: payload.note },
        })

        commit('setHistoryNotes', {
            job_id: payload.job_id,
            text: payload.note,
        })
    },
}
