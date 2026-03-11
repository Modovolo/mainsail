<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h4 mb-6">
                    <v-icon large class="mr-2">mdi-view-dashboard</v-icon>
                    Fleet Dashboard
                </h1>
            </v-col>
        </v-row>

        <v-row>
            <!-- Printers Count Card -->
            <v-col cols="12" md="4">
                <v-card class="dashboard-card" elevation="2">
                    <v-card-title class="primary white--text">
                        <v-icon large class="mr-3" color="white">mdi-printer-3d</v-icon>
                        <span>My Printers</span>
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <div class="d-flex align-center justify-space-between">
                            <div>
                                <div class="text-h2 font-weight-bold primary--text">
                                    {{ printerCount }}
                                </div>
                                <div class="text-subtitle-1 grey--text">
                                    {{ printerCount === 1 ? 'Printer' : 'Printers' }} Registered
                                </div>
                            </div>
                            <v-icon size="80" color="primary" class="opacity-20">
                                mdi-printer-3d-nozzle
                            </v-icon>
                        </div>
                        <v-divider class="my-4"></v-divider>
                        <v-btn block color="primary" outlined to="/allPrinters">
                            <v-icon left>mdi-view-list</v-icon>
                            View All Printers
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>

            <v-col cols="12" md="4">
                <v-card class="dashboard-card" elevation="2">
                    <v-card-title class="success white--text">
                        <v-icon large class="mr-3" color="white">mdi-lan-connect</v-icon>
                        <span>Connected</span>
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <div class="d-flex align-center justify-space-between">
                            <div>
                                <div class="text-h2 font-weight-bold success--text">
                                    {{ connectedCount }}
                                </div>
                                <div class="text-subtitle-1 grey--text">Printers Online</div>
                            </div>
                            <v-icon size="80" color="success" class="opacity-20">mdi-access-point</v-icon>
                        </div>
                        <v-divider class="my-4"></v-divider>
                        <div class="text-body-2 grey--text">
                            Printing now: <strong>{{ printingCount }}</strong>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <v-col cols="12" md="4">
                <v-card class="dashboard-card" elevation="2">
                    <v-card-title class="warning white--text">
                        <v-icon large class="mr-3" color="white">mdi-alert</v-icon>
                        <span>Monitoring</span>
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <div class="d-flex align-center justify-space-between">
                            <div>
                                <div class="text-h2 font-weight-bold warning--text">
                                    {{ defectCount }}
                                </div>
                                <div class="text-subtitle-1 grey--text">Active Defects</div>
                            </div>
                            <v-icon size="80" color="warning" class="opacity-20">mdi-shield-alert</v-icon>
                        </div>
                        <v-divider class="my-4"></v-divider>
                        <div class="text-body-2 grey--text">
                            Service: <strong>{{ monitorRunning ? 'Running' : 'Unavailable' }}</strong>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <v-row class="mt-2" v-if="telemetryPrinters.length">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-pulse</v-icon>
                        Fleet Telemetry
                        <v-spacer></v-spacer>
                        <v-btn icon @click="loadTelemetry" :loading="loading">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>
                    <v-simple-table dense>
                        <thead>
                            <tr>
                                <th>Printer</th>
                                <th>Status</th>
                                <th>Position</th>
                                <th>Temps</th>
                                <th>Monitor</th>
                                <th>Log Tail</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="printer in telemetryPrinters" :key="printer.printerId">
                                <td>
                                    <div class="font-weight-medium">{{ printer.name }}</div>
                                    <div class="text-caption grey--text">{{ printer.printerId }}</div>
                                </td>
                                <td>
                                    <v-chip x-small :color="printer.isConnected ? 'success' : 'grey'" dark>
                                        {{ printer.status.state || 'unknown' }}
                                    </v-chip>
                                    <div class="text-caption grey--text mt-1" v-if="printer.status.filename">
                                        {{ printer.status.filename }}
                                    </div>
                                </td>
                                <td>
                                    <span class="text-caption" v-if="printer.kinematics.position && printer.kinematics.position.length >= 3">
                                        X{{ formatCoord(printer.kinematics.position[0]) }}
                                        Y{{ formatCoord(printer.kinematics.position[1]) }}
                                        Z{{ formatCoord(printer.kinematics.position[2]) }}
                                    </span>
                                    <span class="text-caption grey--text" v-else>—</span>
                                </td>
                                <td>
                                    <span class="text-caption">
                                        E: {{ formatTemp(printer.temperature.extruder, printer.temperature.targetExtruder) }}
                                    </span>
                                    <br />
                                    <span class="text-caption">
                                        B: {{ formatTemp(printer.temperature.bed, printer.temperature.targetBed) }}
                                    </span>
                                </td>
                                <td>
                                    <v-chip x-small :color="monitorStatusColor(printer.monitoring.status)" dark>
                                        {{ printer.monitoring.status }}
                                    </v-chip>
                                    <div class="text-caption error--text mt-1" v-if="printer.monitoring.latestDefect">
                                        {{ printer.monitoring.latestDefect.type }}
                                    </div>
                                </td>
                                <td>
                                    <div class="text-caption text-truncate" style="max-width: 300px;">
                                        {{ latestLogLine(printer) }}
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Loading State -->
        <v-row v-if="loading" class="mt-6">
            <v-col cols="12" class="text-center">
                <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
                <div class="mt-4 text-subtitle-1 grey--text">Loading your printers...</div>
            </v-col>
        </v-row>
    </v-container>
</template>

<script lang="ts">
import Vue from 'vue'
import BaseMixin from '@/components/mixins/base'
import axios from 'axios'

interface Printer {
    id: string
    printerId: string
    name: string
    host?: string
    port?: number
    createdAt: string
    lastConnected?: string
    isActive: boolean
}

interface TelemetryPrinter {
    printerId: string
    name: string
    isConnected: boolean
    status: {
        state?: string
        filename?: string
        progress?: number
    }
    kinematics: {
        position: number[]
    }
    temperature: {
        extruder?: number
        targetExtruder?: number
        bed?: number
        targetBed?: number
    }
    monitoring: {
        status: string
        latestDefect?: {
            type: string
        }
    }
    logs: {
        source: string
        lines: string[]
    }
}

export default Vue.extend({
    mixins: [BaseMixin],

    data() {
        return {
            printers: [] as Printer[],
            telemetryPrinters: [] as TelemetryPrinter[],
            connectedCount: 0,
            printingCount: 0,
            defectCount: 0,
            monitorRunning: false,
            loading: true,
        }
    },

    computed: {
        printerCount(): number {
            return this.printers.length
        },
    },

    async mounted() {
        await this.loadTelemetry()
    },

    methods: {
        async loadTelemetry() {
            this.loading = true
            try {
                const token = (localStorage.getItem('fleet_token') || '').replace(/^Bearer\s+/i, '').trim()
                if (!token) {
                    this.$router.push('/login')
                    return
                }

                const response = await axios.get('/api/fleet/telemetry/overview', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })

                const payload = response.data || {}
                this.telemetryPrinters = payload.printers || []
                this.printers = (payload.printers || []).map((item: TelemetryPrinter) => ({
                    id: item.printerId,
                    printerId: item.printerId,
                    name: item.name,
                    createdAt: '',
                    isActive: true,
                }))
                this.connectedCount = payload.summary?.connectedCount || 0
                this.printingCount = payload.summary?.printingCount || 0
                this.defectCount = payload.summary?.defectCount || 0
                this.monitorRunning = !!payload.monitor?.running
            } catch (error: any) {
                console.error('Failed to load telemetry:', error)
                this.$toast.error('Failed to load fleet telemetry')
            } finally {
                this.loading = false
            }
        },

        monitorStatusColor(status: string): string {
            if (status === 'printing') return 'success'
            if (status === 'idle') return 'grey'
            if (status === 'unavailable') return 'error'
            return 'warning'
        },

        latestLogLine(printer: TelemetryPrinter): string {
            const lines = printer.logs?.lines || []
            if (!lines.length) return 'No logs'
            return lines[lines.length - 1]
        },

        formatCoord(value: number): string {
            if (typeof value !== 'number' || Number.isNaN(value)) return '0.00'
            return value.toFixed(2)
        },

        formatTemp(current?: number, target?: number): string {
            if (typeof current !== 'number') return '—'
            if (typeof target !== 'number') return `${current.toFixed(1)}°C`
            return `${current.toFixed(1)} / ${target.toFixed(1)}°C`
        },
    },
})
</script>

<style scoped>
.dashboard-card {
    height: 100%;
}

.opacity-20 {
    opacity: 0.2;
}
</style>
