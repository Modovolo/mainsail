<template>
    <div class="monitoring-page">
        <v-container fluid>
            <v-row class="mb-2" align="center">
                <v-col cols="12" md="7">
                    <h1 class="text-h5 mb-0 d-flex align-center">
                        <v-icon class="mr-2">mdi-monitor-dashboard</v-icon>
                        Monitoring
                    </h1>
                    <div class="caption mt-1">
                        Fleet-authenticated monitoring status and snapshots
                    </div>
                </v-col>
                <v-col cols="12" md="5" class="d-flex justify-end">
                    <v-btn color="primary" :loading="loading" @click="loadOverview">
                        <v-icon left>mdi-refresh</v-icon>
                        Refresh
                    </v-btn>
                </v-col>
            </v-row>

            <v-row>
                <v-col cols="12" md="3">
                    <v-card outlined>
                        <v-card-title class="py-3">Monitor Service</v-card-title>
                        <v-card-text>
                            <v-chip small :color="monitor.available ? 'success' : 'error'" dark>
                                {{ monitor.available ? 'Available' : 'Unavailable' }}
                            </v-chip>
                            <div class="mt-2">Running: <strong>{{ monitor.running ? 'Yes' : 'No' }}</strong></div>
                            <div class="mt-1">Total defects: <strong>{{ monitor.totalDefects }}</strong></div>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12" md="9">
                    <v-card outlined>
                        <v-card-title class="py-3">Printers</v-card-title>
                        <v-card-text class="pt-0">
                            <v-data-table
                                :headers="tableHeaders"
                                :items="printers"
                                item-key="printerId"
                                dense
                                :loading="loading"
                                disable-pagination
                                hide-default-footer
                                @click:row="selectPrinter"
                            >
                                <template #item.monitorStatus="{ item }">
                                    <v-chip x-small :color="statusColor(item.monitorStatus)" dark>
                                        {{ item.monitorStatus }}
                                    </v-chip>
                                </template>
                                <template #item.latestDefect="{ item }">
                                    {{ item.latestDefect ? item.latestDefect.type : '—' }}
                                </template>
                                <template #item.acknowledged="{ item }">
                                    <v-chip x-small :color="item.acknowledged ? 'warning' : 'grey'" dark>
                                        {{ item.acknowledged ? 'Ack' : 'Open' }}
                                    </v-chip>
                                </template>
                            </v-data-table>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <v-row v-if="selectedPrinter" class="mt-2">
                <v-col cols="12" md="7">
                    <v-card outlined>
                        <v-card-title class="py-3">
                            Snapshot · {{ selectedPrinter.name }}
                        </v-card-title>
                        <v-card-text>
                            <div class="snapshot-wrap">
                                <v-progress-circular
                                    v-if="snapshotLoading"
                                    indeterminate
                                    color="primary"
                                    size="40"
                                />
                                <img
                                    v-else-if="snapshotObjectUrl"
                                    :src="snapshotObjectUrl"
                                    class="snapshot-image"
                                    alt="Monitoring snapshot"
                                />
                                <div v-else class="caption">No snapshot available</div>
                            </div>
                            <div class="mt-3 d-flex">
                                <v-btn small color="primary" :loading="snapshotLoading" @click="loadSnapshot">
                                    <v-icon left small>mdi-camera</v-icon>
                                    Reload Snapshot
                                </v-btn>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12" md="5">
                    <v-card outlined>
                        <v-card-title class="py-3">Actions</v-card-title>
                        <v-card-text>
                            <div class="mb-3">
                                <div class="caption mb-1">Alert workflow</div>
                                <v-btn
                                    small
                                    class="mr-2"
                                    color="warning"
                                    :disabled="selectedPrinter.acknowledged"
                                    @click="acknowledgeSelected"
                                >
                                    Acknowledge
                                </v-btn>
                                <v-btn
                                    small
                                    color="success"
                                    :disabled="!selectedPrinter.acknowledged"
                                    @click="resolveSelected"
                                >
                                    Resolve
                                </v-btn>
                            </div>

                            <div class="mb-3">
                                <div class="caption mb-1">Monitor control</div>
                                <v-btn small class="mr-2" @click="controlSelected('start')">Start</v-btn>
                                <v-btn small @click="controlSelected('stop')">Stop</v-btn>
                            </div>

                            <div>
                                <div class="caption mb-1">Min confidence</div>
                                <v-slider
                                    v-model="minConfidence"
                                    :min="0"
                                    :max="1"
                                    :step="0.01"
                                    thumb-label
                                />
                                <v-btn small color="primary" @click="saveThresholds">Save Threshold</v-btn>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="4000" top right>
                {{ snackbarText }}
            </v-snackbar>
        </v-container>
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import BaseMixin from '@/components/mixins/base'

interface MonitorState {
    available: boolean
    running: boolean
    reason?: string | null
    totalDefects: number
}

interface DefectSummary {
    type: string
    timestamp?: string
    raw?: string
}

interface MonitoringPrinter {
    printerId: string
    name: string
    host?: string
    monitorHostname: string
    isConnected: boolean
    monitorStatus: string
    streamUrl?: string
    lastMonitorUpdate?: string
    latestDefect?: DefectSummary | null
    acknowledged: boolean
    acknowledgedAt?: string
    acknowledgedBy?: string
    thresholds?: {
        minConfidence: number
    }
}

export default Vue.extend({
    mixins: [BaseMixin],

    data() {
        return {
            loading: false,
            snapshotLoading: false,
            monitor: {
                available: false,
                running: false,
                reason: null,
                totalDefects: 0,
            } as MonitorState,
            printers: [] as MonitoringPrinter[],
            selectedPrinterId: null as string | null,
            snapshotObjectUrl: null as string | null,
            minConfidence: 0.6,
            snackbar: false,
            snackbarText: '',
            snackbarColor: 'success',
        }
    },

    computed: {
        normalizedToken(): string {
            const token =
                (this.$store.getters['auth/token'] as string | null) ?? localStorage.getItem('fleet_token') ?? ''

            return token.replace(/^Bearer\s+/i, '').trim()
        },

        authHeaders(): Record<string, string> {
            if (!this.normalizedToken) return {}
            return {
                Authorization: `Bearer ${this.normalizedToken}`,
            }
        },

        selectedPrinter(): MonitoringPrinter | null {
            return this.printers.find((p: MonitoringPrinter) => p.printerId === this.selectedPrinterId) || null
        },

        tableHeaders() {
            return [
                { text: 'Printer', value: 'name' },
                { text: 'Status', value: 'monitorStatus' },
                { text: 'Latest Defect', value: 'latestDefect' },
                { text: 'Alert', value: 'acknowledged' },
            ]
        },
    },

    async mounted() {
        await this.loadOverview()
    },

    beforeDestroy() {
        this.revokeSnapshotObjectUrl()
    },

    methods: {
        revokeSnapshotObjectUrl() {
            if (this.snapshotObjectUrl) {
                URL.revokeObjectURL(this.snapshotObjectUrl)
                this.snapshotObjectUrl = null
            }
        },

        async tryRefreshSession(): Promise<boolean> {
            try {
                return await this.$store.dispatch('auth/refreshToken')
            } catch (error) {
                console.error('Failed to refresh auth session:', error)
                return false
            }
        },

        async fetchWithAuthRetry(url: string, options: RequestInit = {}, allowRetry = true): Promise<Response | null> {
            const headers = {
                ...this.authHeaders,
                ...(options.headers || {}),
            }

            const response = await fetch(url, {
                ...options,
                headers,
            })

            if (response.status !== 401 || !allowRetry) {
                return response
            }

            const refreshed = await this.tryRefreshSession()
            if (!refreshed) {
                return response
            }

            const retryHeaders = {
                ...this.authHeaders,
                ...(options.headers || {}),
            }

            return fetch(url, {
                ...options,
                headers: retryHeaders,
            })
        },

        async loadOverview() {
            this.loading = true
            try {
                const response = await this.fetchWithAuthRetry('/api/monitoring/overview')

                if (!response) {
                    this.showError('Failed to load monitoring overview')
                    return
                }

                if (response.status === 401) {
                    this.showError('Monitoring authorization failed. Please refresh and try again.')
                    return
                }

                if (!response.ok) {
                    const errorPayload = await response.json().catch(() => ({}))
                    this.showError(errorPayload.error || 'Failed to load monitoring overview')
                    return
                }

                const payload = await response.json()
                this.monitor = payload.monitor || this.monitor
                this.printers = payload.printers || []

                if (!this.selectedPrinterId && this.printers.length > 0) {
                    this.selectedPrinterId = this.printers[0].printerId
                }

                if (this.selectedPrinter) {
                    this.minConfidence = this.selectedPrinter.thresholds?.minConfidence ?? 0.6
                    await this.loadSnapshot()
                }
            } catch (error) {
                console.error('Failed to load monitoring overview:', error)
                this.showError('Failed to load monitoring overview')
            } finally {
                this.loading = false
            }
        },

        selectPrinter(item: MonitoringPrinter) {
            this.selectedPrinterId = item.printerId
            this.minConfidence = item.thresholds?.minConfidence ?? 0.6
            this.loadSnapshot()
        },

        statusColor(status: string): string {
            switch (status) {
                case 'printing':
                    return 'success'
                case 'idle':
                    return 'grey'
                case 'unknown':
                    return 'warning'
                default:
                    return 'error'
            }
        },

        async loadSnapshot() {
            const printer = this.selectedPrinter
            if (!printer) return

            this.snapshotLoading = true
            this.revokeSnapshotObjectUrl()
            try {
                const response = await this.fetchWithAuthRetry(`/api/monitoring/snapshot/${printer.printerId}`)

                if (!response) {
                    this.showError('Failed to load snapshot')
                    return
                }

                if (response.status === 401) {
                    this.showError('Monitoring authorization failed. Please refresh and try again.')
                    return
                }

                if (!response.ok) {
                    const errorPayload = await response.json().catch(() => ({}))
                    this.showError(errorPayload.error || 'Failed to load snapshot')
                    return
                }

                const blob = await response.blob()
                this.snapshotObjectUrl = URL.createObjectURL(blob)
            } catch (error) {
                console.error('Failed to load snapshot:', error)
                this.showError('Failed to load snapshot')
            } finally {
                this.snapshotLoading = false
            }
        },

        async acknowledgeSelected() {
            if (!this.selectedPrinter) return
            await this.postAction(
                `/api/monitoring/printers/${this.selectedPrinter.printerId}/acknowledge`,
                'Alert acknowledged'
            )
            await this.loadOverview()
        },

        async resolveSelected() {
            if (!this.selectedPrinter) return
            await this.postAction(`/api/monitoring/printers/${this.selectedPrinter.printerId}/resolve`, 'Alert resolved')
            await this.loadOverview()
        },

        async controlSelected(action: 'start' | 'stop') {
            if (!this.selectedPrinter) return
            await this.postAction(
                `/api/monitoring/printers/${this.selectedPrinter.printerId}/control/${action}`,
                `Requested monitor ${action}`
            )
        },

        async saveThresholds() {
            if (!this.selectedPrinter) return

            try {
                const response = await this.fetchWithAuthRetry(
                    `/api/monitoring/printers/${this.selectedPrinter.printerId}/thresholds`,
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ minConfidence: this.minConfidence }),
                    }
                )

                if (!response) {
                    this.showError('Failed to save threshold')
                    return
                }

                if (response.status === 401) {
                    this.showError('Monitoring authorization failed. Please refresh and try again.')
                    return
                }

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}))
                    this.showError(payload.error || 'Failed to save threshold')
                    return
                }

                this.showSuccess('Threshold saved')
            } catch (error) {
                console.error('Failed to save threshold:', error)
                this.showError('Failed to save threshold')
            }
        },

        async postAction(url: string, successMessage: string) {
            try {
                const response = await this.fetchWithAuthRetry(url, {
                    method: 'POST',
                })

                if (!response) {
                    this.showError('Action failed')
                    return
                }

                if (response.status === 401) {
                    this.showError('Monitoring authorization failed. Please refresh and try again.')
                    return
                }

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}))
                    this.showError(payload.error || 'Action failed')
                    return
                }

                this.showSuccess(successMessage)
            } catch (error) {
                console.error('Monitoring action failed:', error)
                this.showError('Action failed')
            }
        },

        showSuccess(message: string) {
            this.snackbarText = message
            this.snackbarColor = 'success'
            this.snackbar = true
        },

        showError(message: string) {
            this.snackbarText = message
            this.snackbarColor = 'error'
            this.snackbar = true
        },
    },
})
</script>

<style scoped>
.monitoring-page {
    height: 100%;
    width: 100%;
}

.snapshot-wrap {
    min-height: 340px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
}

.snapshot-image {
    max-width: 100%;
    max-height: 500px;
    object-fit: contain;
}
</style>
