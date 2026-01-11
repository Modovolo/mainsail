<template>
    <div>
        <v-row>
            <!-- Manager-only filter and aggregated statistics: only render when running in fleet mode -->
            <template v-if="isFleetMode">
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
    get isFleetMode(): boolean {
        return this.$store.state.instancesDB === 'fleet'
    }
    
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
