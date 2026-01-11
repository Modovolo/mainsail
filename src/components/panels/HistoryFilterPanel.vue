<template>
    <panel :icon="mdiFilter" :title="$t('History.Filters')">
            <v-card-text>
                <v-progress-linear
                    v-if="isLoading"
                    :indeterminate="outstandingTotal === 0"
                    :value="progressPercent"
                    color="primary"
                    height="3"
                    class="mb-3"
                />
                <div v-if="isLoading && outstandingTotal > 0" class="mb-3 text-caption">{{ $t('History.LoadingProgress', { done: outstandingTotal - outstandingRequests, total: outstandingTotal }) }}</div>
            <v-row>
                <v-col class="col-12 col-md-6">
                    <v-select
                        :items="printerOptions"
                        item-title="text"
                        item-value="value"
                        v-model="selectedPrinterLocal"
                        dense
                        outlined
                        hide-details
                        label="Printer"
                        clearable
                    />
                </v-col>
                <v-col class="col-12 col-md-6 d-flex align-center">
                    <v-btn class="ml-auto" color="primary" @click="applyFilter" :loading="isLoading">{{ $t('History.ApplyFilter') }}</v-btn>
                </v-col>
            </v-row>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import Panel from '@/components/ui/Panel.vue'
import BaseMixin from '@/components/mixins/base'

@Component({ components: { Panel } })
export default class HistoryFilterPanel extends Mixins(BaseMixin) {
    selectedPrinterLocal: string = this.$store.state.gui.view.history.selectedPrinter ?? 'all'

    get isLoading() {
        return this.loadings.includes('historyLoadAll')
    }

    get outstandingRequests() {
        return this.$store.state.server.history.outstanding_farm_requests ?? 0
    }

    get outstandingTotal() {
        return this.$store.state.server.history.outstanding_farm_total ?? 0
    }

    get progressPercent() {
        const total = this.outstandingTotal
        if (!total || total <= 0) return 0
        const done = total - this.outstandingRequests
        return Math.round((done / total) * 100)
    }

    get printerOptions() {
        const out: { text: string; value: string }[] = []
        out.push({ text: this.$t('History.AllJobs').toString(), value: 'all' })
        out.push({ text: this.$t('History.Manager').toString(), value: 'local' })

        const printers = this.$store.getters['farm/getPrinters'] ?? {}
        Object.keys(printers).forEach((namespace) => {
            const name = this.$store.getters['farm/getPrinterName'](namespace) ?? namespace
            out.push({ text: name, value: namespace })
        })

        return out
    }

    mounted() {
        // keep local value in sync with route or store
        const r = (this.$route.query?.printer as string) ?? this.$store.state.gui.view.history.selectedPrinter ?? 'all'
        this.selectedPrinterLocal = r
        // Trigger an initial fetch for the current selection when the panel mounts
        // so that the History page is populated when opened (including manager-only)
        this.$nextTick(() => {
            try {
                this.applyFilter()
            } catch (_) {}
        })
    }

    applyFilter() {
        const newVal = this.selectedPrinterLocal ?? 'all'

        // update URL
        try {
            const query = { ...(this.$route.query || {}) }
            if (!newVal || newVal === 'all') delete query.printer
            else query.printer = newVal

            this.$router.replace({ name: this.$route.name || 'history', query })
        } catch (_) {}

        // persist setting
        this.$store.dispatch('gui/saveSetting', { name: 'view.history.selectedPrinter', value: newVal })

        // trigger fetch according to selection
        const isFleetMode = this.$store.state.instancesDB === 'fleet'
        const printersCount = this.$store.getters['farm/countPrinters'] ?? 0

        // Show loading indication for any fetch-type selection (local/remote/aggregate)
        try {
            this.$store.dispatch('socket/addLoading', { name: 'historyLoadAll' })
        } catch (_) {}

        // Local only
        if (newVal === 'local') {
            this.$store.dispatch('server/history/reset')
            this.$socket.emit('server.history.list', { start: 0, limit: 50 }, { action: 'server/history/getHistory' })
            this.$socket.emit('server.history.totals', {}, { action: 'server/history/getTotals' })
            return
        }

        // All: aggregated farm
        if (newVal === 'all' && isFleetMode && printersCount > 0) {
            this.$store.dispatch('server/history/initFarmHistory')
            return
        }

        // specific printer
        if (newVal !== 'all' && newVal !== 'local') {
            this.$store.dispatch('server/history/reset')

            // request from remote printer via farm module
            // For direct printer fetches we already added the loading flag above so
            // do not add it again to avoid duplicates in the loadings array.

            this.$store.dispatch(
                'farm/' + newVal + '/sendObj',
                {
                    method: 'server.history.list',
                    params: { start: 0, limit: 50 },
                    action: 'forwardHistoryToManager',
                    actionPreload: { printer: newVal },
                },
                { root: true }
            )

            this.$store.dispatch(
                'farm/' + newVal + '/sendObj',
                {
                    method: 'server.history.totals',
                    params: {},
                    action: 'forwardTotalsToManager',
                    actionPreload: { printer: newVal },
                },
                { root: true }
            )
        }
    }
}
</script>

<style scoped>
</style>
