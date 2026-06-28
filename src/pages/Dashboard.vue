<template>
    <div>
        <!-- Fleet Mode: Show back button when viewing a specific printer -->
        <v-container v-if="isFleetMode && printerId" fluid class="pa-0">
            <v-btn text class="mb-2 ml-2" @click="disconnectAndGoBack">
                <v-icon left>mdi-arrow-left</v-icon>
                Back to Printers
            </v-btn>
        </v-container>

        <!-- Fleet Mode: Show offline message when printer is not connected -->
        <v-alert
            v-if="isFleetMode && printerId && fleetPrinterConnected === false"
            type="warning"
            prominent
            class="mx-4 mb-4">
            <v-row align="center">
                <v-col class="grow">
                    <strong>Printer Offline</strong><br />
                    This printer is currently not connected to the fleet. It may be powered off or have network issues.
                </v-col>
                <v-col class="shrink">
                    <v-btn outlined @click="refreshConnection">
                        <v-icon left>mdi-refresh</v-icon>
                        Retry
                    </v-btn>
                </v-col>
            </v-row>
        </v-alert>

        <farm v-if="showFleetList" />

        <!-- Standard Dashboard Layout -->
        <v-row v-if="!showFleetList && isMobile">
            <v-col>
                <status-panel />
                <template v-for="component in mobileLayout">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-mobileLayout-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
        </v-row>
        <v-row v-else-if="!showFleetList && isTablet">
            <v-col class="col-6">
                <status-panel />
                <template v-for="component in tabletLayout1">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-tabletLayout1-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
            <v-col class="col-6">
                <template v-for="component in tabletLayout2">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-tabletLayout2-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
        </v-row>
        <v-row v-else-if="!showFleetList && isDesktop">
            <v-col class="col-5">
                <status-panel />
                <template v-for="component in desktopLayout1">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-desktopLayout1-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
            <v-col class="col-7">
                <template v-for="component in desktopLayout2">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-desktopLayout2-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
        </v-row>
        <v-row v-else-if="!showFleetList && isWidescreen">
            <v-col class="col-3">
                <status-panel />
                <template v-for="component in widescreenLayout1">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-desktopLayout1-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
            <v-col class="col-5">
                <template v-for="component in widescreenLayout2">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-desktopLayout2-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
            <v-col class="col-4">
                <template v-for="component in widescreenLayout3">
                    <component
                        :is="extractPanelName(component.name)"
                        :key="'dashboard-desktopLayout3-' + component.name"
                        :panel-id="extractPanelId(component.name)"></component>
                </template>
            </v-col>
        </v-row>
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import AfcPanel from '@/components/panels/AfcPanel.vue'
import ExtruderControlPanel from '@/components/panels/ExtruderControlPanel.vue'
import DashboardMixin from '@/components/mixins/dashboard'
import KlippyStatePanel from '@/components/panels/KlippyStatePanel.vue'
import MachineSettingsPanel from '@/components/panels/MachineSettingsPanel.vue'
import MacrogroupPanel from '@/components/panels/MacrogroupPanel.vue'
import MacrosPanel from '@/components/panels/MacrosPanel.vue'
import MiniconsolePanel from '@/components/panels/MiniconsolePanel.vue'
import MinSettingsPanel from '@/components/panels/MinSettingsPanel.vue'
import MiscellaneousPanel from '@/components/panels/MiscellaneousPanel.vue'
import SpoolmanPanel from '@/components/panels/SpoolmanPanel.vue'
import MmuPanel from '@/components/panels/MmuPanel.vue'
import StatusPanel from '@/components/panels/StatusPanel.vue'
import ToolheadControlPanel from '@/components/panels/ToolheadControlPanel.vue'
import TemperaturePanel from '@/components/panels/TemperaturePanel.vue'
import WebcamPanel from '@/components/panels/WebcamPanel.vue'
import Farm from '@/pages/Farm.vue'

@Component({
    components: {
        AfcPanel,
        ExtruderControlPanel,
        KlippyStatePanel,
        MachineSettingsPanel,
        MacrogroupPanel,
        MacrosPanel,
        MiniconsolePanel,
        MinSettingsPanel,
        MiscellaneousPanel,
        SpoolmanPanel,
        MmuPanel,
        StatusPanel,
        ToolheadControlPanel,
        TemperaturePanel,
        WebcamPanel,
        Farm,
    },
})
export default class PageDashboard extends Mixins(DashboardMixin) {
    private fleetConnected = false

    get isFleetMode(): boolean {
        return this.$store.state.instancesDB === 'fleet'
    }

    get printerId(): string {
        return this.$route.params.id || ''
    }

    get showFleetList(): boolean {
        return this.isFleetMode && !this.printerId
    }

    get fleetPrinterConnected(): boolean | null {
        return this.$store.state.socket.fleetPrinterConnected
    }

    async refreshConnection() {
        // Reset state and try again
        this.$store.commit('socket/setFleetPrinterConnected', null)
        if (this.fleetConnected) {
            Vue.$socket.close()
        }
        await this.connectToFleetPrinter()
    }

    disconnectAndGoBack() {
        // Disconnect from the current printer before navigating back to the fleet printer list.
        console.log('[Dashboard] Disconnecting fleet socket before navigating to printer list')
        
        // Close the WebSocket connection
        Vue.$socket.close()
        this.fleetConnected = false
        
        // Reset all store states (files, gui, printer, server, socket)
        // This clears the printer name from topbar/sidebar
        this.$store.dispatch('files/reset')
        this.$store.dispatch('gui/reset')
        this.$store.dispatch('printer/reset')
        this.$store.dispatch('server/reset')
        this.$store.dispatch('socket/reset')
        
        // Reset fleet-specific state
        this.$store.commit('socket/setDisconnected')
        this.$store.commit('socket/setFleetPrinterConnected', null)
        this.$store.commit('socket/setFleetPrinterId', null)
        this.$store.commit('socket/setFleetPrinterName', null)
        
        this.$router.push('/printer')
    }

    async mounted() {
        if (this.isFleetMode && this.printerId) {
            // Reset printer connected state before attempting connection
            this.$store.commit('socket/setFleetPrinterConnected', null)
            await this.connectToFleetPrinter()
        }
    }

    beforeDestroy() {
        // Disconnect when leaving the page in fleet mode
        if (this.isFleetMode && this.fleetConnected) {
            console.log('[Dashboard] Disconnecting fleet socket')
            Vue.$socket.close()
            this.fleetConnected = false
            
            // Reset all store states to clear printer data from topbar/sidebar
            this.$store.dispatch('files/reset')
            this.$store.dispatch('gui/reset')
            this.$store.dispatch('printer/reset')
            this.$store.dispatch('server/reset')
            this.$store.dispatch('socket/reset')
            
            // Reset fleet-specific state
            this.$store.commit('socket/setDisconnected')
            this.$store.commit('socket/setFleetPrinterConnected', null)
            this.$store.commit('socket/setFleetPrinterId', null)
            this.$store.commit('socket/setFleetPrinterName', null)
        }
    }

    @Watch('$route.params.id')
    async onPrinterIdChange(newId: string, oldId: string) {
        if (this.isFleetMode && newId !== oldId) {
            // Reconnect to new printer
            if (this.fleetConnected) {
                Vue.$socket.close()
            }
            await this.connectToFleetPrinter()
        }
    }

    async connectToFleetPrinter() {
        if (!this.printerId) return

        // Build fleet proxy WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const host = window.location.host
        const fleetProxyUrl = `${protocol}://${host}/ws/client/${this.printerId}`

        console.log(`[Fleet Dashboard] Connecting to fleet proxy: ${fleetProxyUrl}`)
        console.log(`[Fleet Dashboard] Current socket URL: ${(Vue.$socket as any).url}`)
        console.log(`[Fleet Dashboard] isFleetMode: ${this.isFleetMode}, printerId: ${this.printerId}`)

        // Update socket URL and connect
        Vue.$socket.setUrl(fleetProxyUrl)
        console.log(`[Fleet Dashboard] URL set to: ${(Vue.$socket as any).url}`)
        
        await Vue.$socket.connect()
        console.log(`[Fleet Dashboard] Connect called, readyState: ${(Vue.$socket as any).instance?.readyState}`)

        this.fleetConnected = true
        this.$store.commit('socket/setFleetPrinterId', this.printerId)
        console.log(`[Fleet Dashboard] Connection complete, fleetConnected: ${this.fleetConnected}`)
    }

    get mobileLayout() {
        return this.$store.getters['gui/getPanels']('mobile', 0, true)
    }

    get tabletLayout1() {
        return this.$store.getters['gui/getPanels']('tablet', 1, true)
    }

    get tabletLayout2() {
        return this.$store.getters['gui/getPanels']('tablet', 2, true)
    }

    get desktopLayout1() {
        return this.$store.getters['gui/getPanels']('desktop', 1, true)
    }

    get desktopLayout2() {
        return this.$store.getters['gui/getPanels']('desktop', 2, true)
    }

    get widescreenLayout1() {
        return this.$store.getters['gui/getPanels']('widescreen', 1, true)
    }

    get widescreenLayout2() {
        return this.$store.getters['gui/getPanels']('widescreen', 2, true)
    }

    get widescreenLayout3() {
        return this.$store.getters['gui/getPanels']('widescreen', 3, true)
    }

    extractPanelName(name: string) {
        return name.split('_')[0] + '-panel'
    }

    extractPanelId(name: string) {
        return name.split('_')[1] ?? null
    }
}
</script>
