<template>
    <v-container class="software-versions-page">
        <v-row>
            <v-col cols="12">
                <v-card class="overview-card" elevation="0">
                    <v-card-text class="pa-6">
                        <div class="d-flex flex-wrap align-center justify-space-between">
                            <div>
                                <div class="d-flex align-center mb-2">
                                    <v-icon class="mr-2" color="primary">{{ mdiServerNetwork }}</v-icon>
                                    <h1 class="text-h5 mb-0">Software Versions</h1>
                                </div>
                                <div class="text-body-2 grey--text text--darken-1">
                                    Manage fleet software inventory and per-printer desired target versions.
                                </div>
                            </div>
                            <v-btn color="primary" :loading="loading" @click="loadData">
                                <v-icon left>{{ mdiRefresh }}</v-icon>
                                Refresh
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <v-row>
            <v-col cols="12" sm="6" md="3">
                <v-card class="metric-card" elevation="0">
                    <v-card-text>
                        <div class="metric-label">Printers</div>
                        <div class="metric-value">{{ totalPrinters }}</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="metric-card" elevation="0">
                    <v-card-text>
                        <div class="metric-label">Online</div>
                        <div class="metric-value text-success">{{ onlinePrinters }}</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="metric-card" elevation="0">
                    <v-card-text>
                        <div class="metric-label">Policies Set</div>
                        <div class="metric-value">{{ policyConfigured }}</div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card class="metric-card" elevation="0">
                    <v-card-text>
                        <div class="metric-label">Version Drift</div>
                        <div class="metric-value text-warning">{{ driftCount }}</div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <v-row>
            <v-col cols="12">
                <v-card class="table-card" elevation="0">
                    <v-card-title>
                        Fleet Matrix
                        <v-spacer />
                        <v-text-field
                            v-model="search"
                            dense
                            hide-details
                            outlined
                            clearable
                            prepend-inner-icon="mdi-magnify"
                            label="Filter printers"
                            class="search-input"
                        />
                    </v-card-title>
                    <v-divider />

                    <v-card-text v-if="loading" class="text-center py-8">
                        <v-progress-circular indeterminate color="primary" size="48" />
                        <div class="mt-3 grey--text">Loading software inventory...</div>
                    </v-card-text>

                    <v-card-text v-else-if="filteredRows.length === 0" class="text-center py-10">
                        <v-icon size="56" color="grey lighten-1">mdi-server-off</v-icon>
                        <div class="mt-3 text-subtitle-1 grey--text">No printers found</div>
                    </v-card-text>

                    <v-simple-table v-else dense class="versions-table">
                        <thead>
                            <tr>
                                <th>Printer</th>
                                <th>Status</th>
                                <th>Klipper</th>
                                <th>Target Klipper</th>
                                <th>Moonraker</th>
                                <th>Target Moonraker</th>
                                <th>Channel</th>
                                <th class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in filteredRows" :key="row.printerId">
                                <td>
                                    <div class="font-weight-medium">{{ row.printerName }}</div>
                                    <div class="text-caption grey--text text--darken-1">{{ row.printerId }}</div>
                                </td>
                                <td>
                                    <v-chip x-small :color="row.isOnline ? 'success' : 'grey'" dark>
                                        {{ row.isOnline ? 'Online' : 'Offline' }}
                                    </v-chip>
                                </td>
                                <td>
                                    <div class="version-cell">{{ currentKlipperVersion(row) }}</div>
                                </td>
                                <td>
                                    <div class="version-cell">{{ desiredKlipperVersion(row) }}</div>
                                    <v-chip
                                        v-if="desiredKlipperVersion(row) !== '—'"
                                        x-small
                                        class="mt-1"
                                        :color="driftColor(row, 'klipper')"
                                        dark>
                                        {{ driftText(row, 'klipper') }}
                                    </v-chip>
                                </td>
                                <td>
                                    <div class="version-cell">{{ currentMoonrakerVersion(row) }}</div>
                                </td>
                                <td>
                                    <div class="version-cell">{{ desiredMoonrakerVersion(row) }}</div>
                                    <v-chip
                                        v-if="desiredMoonrakerVersion(row) !== '—'"
                                        x-small
                                        class="mt-1"
                                        :color="driftColor(row, 'moonraker')"
                                        dark>
                                        {{ driftText(row, 'moonraker') }}
                                    </v-chip>
                                </td>
                                <td>
                                    <v-chip x-small outlined color="primary">{{ policyChannel(row) }}</v-chip>
                                </td>
                                <td class="text-right">
                                    <v-btn small color="primary" outlined @click="openPolicyDialog(row)">
                                        <v-icon left small>{{ mdiTune }}</v-icon>
                                        Set Target
                                    </v-btn>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-card>
            </v-col>
        </v-row>

        <v-dialog v-model="policyDialog" max-width="560">
            <v-card>
                <v-card-title class="headline">Update Desired Versions</v-card-title>
                <v-card-subtitle v-if="policyDraft.printerName">{{ policyDraft.printerName }}</v-card-subtitle>
                <v-card-text>
                    <v-select
                        v-model="policyDraft.channel"
                        :items="channelOptions"
                        label="Release Channel"
                        outlined
                        dense
                        clearable
                    />
                    <v-text-field
                        v-model="policyDraft.desiredKlipperVersion"
                        label="Desired Klipper Version"
                        placeholder="e.g. v0.12.0-700"
                        outlined
                        dense
                        clearable
                    />
                    <v-text-field
                        v-model="policyDraft.desiredMoonrakerVersion"
                        label="Desired Moonraker Version"
                        placeholder="e.g. v0.9.6-15"
                        outlined
                        dense
                        clearable
                    />
                    <v-textarea
                        v-model="policyDraft.notes"
                        label="Notes"
                        outlined
                        rows="3"
                        auto-grow
                        clearable
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="policyDialog = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :loading="savingPolicy"
                        :disabled="!policyDraft.printerId"
                        @click="savePolicy">
                        Save Policy
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script lang="ts">
import Vue from 'vue'
import axios from 'axios'
import {
    mdiRefresh,
    mdiServerNetwork,
    mdiTune,
} from '@mdi/js'

interface SoftwareInventoryPayload {
    klipper?: { version?: string }
    moonraker?: { version?: string }
    loadedObjects?: string[]
}

interface SoftwarePolicyPayload {
    desiredKlipperVersion?: string | null
    desiredMoonrakerVersion?: string | null
    channel?: string | null
    notes?: string | null
}

interface SoftwareInventoryRow {
    printerId: string
    printerName: string
    isOnline: boolean
    inventory: SoftwareInventoryPayload
}

interface PolicyDraft {
    printerId: string
    printerName: string
    desiredKlipperVersion: string
    desiredMoonrakerVersion: string
    channel: string
    notes: string
}

export default Vue.extend({
    data() {
        return {
            mdiRefresh,
            mdiServerNetwork,
            mdiTune,
            loading: false,
            savingPolicy: false,
            search: '',
            rows: [] as SoftwareInventoryRow[],
            policyByPrinter: {} as Record<string, SoftwarePolicyPayload>,
            policyDialog: false,
            policyDraft: {
                printerId: '',
                printerName: '',
                desiredKlipperVersion: '',
                desiredMoonrakerVersion: '',
                channel: '',
                notes: '',
            } as PolicyDraft,
            channelOptions: ['stable', 'canary', 'beta', 'hotfix'],
        }
    },

    computed: {
        filteredRows(): SoftwareInventoryRow[] {
            const query = this.search.trim().toLowerCase()
            if (!query) return this.rows

            return this.rows.filter((row) => {
                return (
                    row.printerName.toLowerCase().includes(query) ||
                    row.printerId.toLowerCase().includes(query)
                )
            })
        },

        totalPrinters(): number {
            return this.rows.length
        },

        onlinePrinters(): number {
            return this.rows.filter((row) => row.isOnline).length
        },

        policyConfigured(): number {
            return this.rows.filter((row) => {
                const policy = this.policyByPrinter[row.printerId] || {}
                return Boolean(policy.desiredKlipperVersion || policy.desiredMoonrakerVersion)
            }).length
        },

        driftCount(): number {
            return this.rows.filter((row) => this.hasAnyDrift(row)).length
        },
    },

    async mounted() {
        await this.loadData()
    },

    methods: {
        authHeaders(): Record<string, string> {
            const token = (localStorage.getItem('fleet_token') || '').replace(/^Bearer\s+/i, '').trim()
            if (!token) {
                this.$router.push('/login')
                return {}
            }

            return {
                Authorization: `Bearer ${token}`,
            }
        },

        async loadData() {
            this.loading = true
            try {
                const headers = this.authHeaders()
                if (!headers.Authorization) return

                const [inventoryResponse, policyResponse] = await Promise.all([
                    axios.get('/api/fleet/software-inventory', { headers }),
                    axios.get('/api/fleet/software-policy', { headers }),
                ])

                this.rows = inventoryResponse.data?.printers || []

                const policyRows = policyResponse.data?.printers || []
                const nextPolicyMap: Record<string, SoftwarePolicyPayload> = {}
                policyRows.forEach((entry: any) => {
                    if (!entry?.printerId) return
                    nextPolicyMap[entry.printerId] = entry.policy || {}
                })
                this.policyByPrinter = nextPolicyMap
            } catch (error: any) {
                console.error('Failed to load software versions:', error)
                this.$toast.error(error.response?.data?.error || 'Failed to load software versions')
            } finally {
                this.loading = false
            }
        },

        currentKlipperVersion(row: SoftwareInventoryRow): string {
            return row.inventory?.klipper?.version || '—'
        },

        currentMoonrakerVersion(row: SoftwareInventoryRow): string {
            return row.inventory?.moonraker?.version || '—'
        },

        desiredKlipperVersion(row: SoftwareInventoryRow): string {
            return this.policyByPrinter[row.printerId]?.desiredKlipperVersion || '—'
        },

        desiredMoonrakerVersion(row: SoftwareInventoryRow): string {
            return this.policyByPrinter[row.printerId]?.desiredMoonrakerVersion || '—'
        },

        policyChannel(row: SoftwareInventoryRow): string {
            return this.policyByPrinter[row.printerId]?.channel || 'none'
        },

        driftText(row: SoftwareInventoryRow, target: 'klipper' | 'moonraker'): string {
            const status = this.driftState(row, target)
            if (status === 'match') return 'Aligned'
            if (status === 'drift') return 'Drift'
            return 'Unknown'
        },

        driftColor(row: SoftwareInventoryRow, target: 'klipper' | 'moonraker'): string {
            const status = this.driftState(row, target)
            if (status === 'match') return 'success'
            if (status === 'drift') return 'warning'
            return 'grey'
        },

        driftState(row: SoftwareInventoryRow, target: 'klipper' | 'moonraker'): 'match' | 'drift' | 'unknown' {
            const desired =
                target === 'klipper'
                    ? this.policyByPrinter[row.printerId]?.desiredKlipperVersion
                    : this.policyByPrinter[row.printerId]?.desiredMoonrakerVersion

            if (!desired) return 'unknown'

            const current =
                target === 'klipper'
                    ? row.inventory?.klipper?.version
                    : row.inventory?.moonraker?.version

            if (!current) return 'unknown'
            return current === desired ? 'match' : 'drift'
        },

        hasAnyDrift(row: SoftwareInventoryRow): boolean {
            return this.driftState(row, 'klipper') === 'drift' || this.driftState(row, 'moonraker') === 'drift'
        },

        openPolicyDialog(row: SoftwareInventoryRow) {
            const policy = this.policyByPrinter[row.printerId] || {}
            this.policyDraft = {
                printerId: row.printerId,
                printerName: row.printerName,
                desiredKlipperVersion: policy.desiredKlipperVersion || '',
                desiredMoonrakerVersion: policy.desiredMoonrakerVersion || '',
                channel: policy.channel || '',
                notes: policy.notes || '',
            }
            this.policyDialog = true
        },

        async savePolicy() {
            if (!this.policyDraft.printerId) return

            this.savingPolicy = true
            try {
                const headers = this.authHeaders()
                if (!headers.Authorization) return

                const payload = {
                    desiredKlipperVersion: this.policyDraft.desiredKlipperVersion || null,
                    desiredMoonrakerVersion: this.policyDraft.desiredMoonrakerVersion || null,
                    channel: this.policyDraft.channel || null,
                    notes: this.policyDraft.notes || null,
                }

                const response = await axios.put(
                    `/api/fleet/software-policy/${this.policyDraft.printerId}`,
                    payload,
                    { headers }
                )

                this.policyByPrinter = {
                    ...this.policyByPrinter,
                    [this.policyDraft.printerId]: response.data?.policy || payload,
                }

                this.$toast.success('Software policy saved')
                this.policyDialog = false
            } catch (error: any) {
                console.error('Failed to save software policy:', error)
                this.$toast.error(error.response?.data?.error || 'Failed to save software policy')
            } finally {
                this.savingPolicy = false
            }
        },
    },
})
</script>

<style scoped>
.software-versions-page {
    max-width: 1700px;
}

.overview-card,
.metric-card,
.table-card {
    border: 1px solid rgba(120, 136, 160, 0.25);
    border-radius: 12px;
}

.metric-label {
    font-size: 0.78rem;
    color: rgba(90, 106, 129, 0.95);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.metric-value {
    margin-top: 6px;
    font-size: 1.95rem;
    font-weight: 600;
    line-height: 1.1;
}

.search-input {
    max-width: 280px;
}

.versions-table .version-cell {
    font-family: Menlo, Consolas, Monaco, monospace;
    font-size: 0.8rem;
}
</style>
