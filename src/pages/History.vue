<template>
    <div>
        <v-row>
            <!-- Manager-only filter and aggregated statistics: only render when running as manager host
                 (frontend served from manager) and farm printers are configured. When viewing an
                 individual printer (connected) we intentionally hide manager-only controls to show
                 the original printer-focused UI. -->
            <template v-if="$store.state.socket.hostname === window.location.hostname && $store.getters['farm/countPrinters'] > 0 && !Object.keys($store.getters['farm/getPrinters'] ?? {}).some(ns => $store.getters[ns + '/isCurrentPrinter'] === true) && (($store.state.gui?.view?.history?.selectedPrinter ?? 'all') === 'all')">
                <v-col class="col-12 col-md-3">
                    <history-filter-panel />
                </v-col>
                <v-col class="col-12 col-md-9">
                    <history-statistics-panel />
                </v-col>
            </template>

            <!-- Non-manager / printer-connected view: keep only the original statistics/list layout
                 (render list panel below normally). -->
            <template v-else>
                <v-col class="col-12 col-md-12">
                    <history-statistics-panel />
                </v-col>
            </template>
        </v-row>
        <v-row class="mt-0">
            <v-col>
                <history-list-panel />
            </v-col>
        </v-row>
    </div>
</template>
<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import HistoryFilterPanel from '@/components/panels/HistoryFilterPanel.vue'
import HistoryListPanel from '@/components/panels/HistoryListPanel.vue'
import HistoryStatisticsPanel from '@/components/panels/HistoryStatisticsPanel.vue'

@Component({
    components: { HistoryFilterPanel, HistoryListPanel, HistoryStatisticsPanel },
})
export default class PageHistory extends Mixins(BaseMixin) {
    // NOTE: showing manager-only controls should only happen when we are on manager
    // host and not currently viewing a single remote printer. The template uses an
    // inline computed expression to evaluate that state so the template type
    // checker picks it up consistently.
    mounted() {
        // If a printer query param exists, use it to initialize the history printer filter
        const printer = this.$route.query?.printer as string | undefined
        if (printer !== undefined) {
            this.$store.dispatch('gui/saveSetting', { name: 'view.history.selectedPrinter', value: printer })
        }

        // Keep route in sync if query changes (for instance when a deep link is opened)
        this.$watch(
            () => this.$route.query?.printer,
            (newVal: any) => {
                if (newVal !== undefined) this.$store.dispatch('gui/saveSetting', { name: 'view.history.selectedPrinter', value: newVal })
            }
        )
    }
}
</script>
