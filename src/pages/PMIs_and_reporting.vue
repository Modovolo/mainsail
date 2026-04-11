<template>
    <div>
        <!-- Tab Navigation -->
        <v-tabs v-model="activeTab" background-color="transparent" class="mb-4">
            <v-tab>Downtime Log</v-tab>
            <v-tab>Record PMI</v-tab>
            <v-tab>PMI History</v-tab>
            <v-tab>Statistics</v-tab>
        </v-tabs>

        <v-tabs-items v-model="activeTab">
            <!-- ==================== TAB 1: DOWNTIME LOG ==================== -->
            <v-tab-item>
                <v-card>
                    <v-card-title>
                        Document Printer Downtime
                        <v-spacer />
                        <v-btn color="primary" @click="showDowntimeDialog = true">
                            <v-icon left>{{ mdiPlus }}</v-icon>
                            Log Downtime
                        </v-btn>
                    </v-card-title>
                    <v-card-text>
                        <v-data-table
                            :headers="downtimeHeaders"
                            :items="downtimeRecords"
                            :sort-by="['start']"
                            :sort-desc="[true]"
                            class="elevation-1">
                            <template #[`item.start`]="{ item }">
                                {{ formatDateStr(item.start) }}
                            </template>
                            <template #[`item.end`]="{ item }">
                                {{ item.end ? formatDateStr(item.end) : 'Ongoing' }}
                            </template>
                            <template #[`item.duration`]="{ item }">
                                {{ calcDuration(item) }}
                            </template>
                            <template #[`item.actions`]="{ item }">
                                <v-btn icon small @click="deleteDowntime(item)">
                                    <v-icon small>{{ mdiDelete }}</v-icon>
                                </v-btn>
                            </template>
                        </v-data-table>
                    </v-card-text>
                </v-card>
            </v-tab-item>

            <!-- ==================== TAB 2: RECORD PMI ==================== -->
            <v-tab-item>
                <v-card>
                    <v-card-title>Record Preventive Maintenance Inspection</v-card-title>
                    <v-card-text>
                        <v-form ref="pmiForm" v-model="pmiFormValid">
                            <v-row>
                                <v-col cols="12" md="6">
                                    <v-select
                                        v-model="pmiForm.printer"
                                        :items="printerNames"
                                        label="Printer Name"
                                        :rules="[rules.required]"
                                        outlined />
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-select
                                        v-model="pmiForm.inspector"
                                        :items="teamUsernames"
                                        label="Inspector Name"
                                        :rules="[rules.required]"
                                        outlined />
                                </v-col>
                            </v-row>
                            <v-row>
                                <v-col cols="12" md="6">
                                    <v-menu
                                        v-model="pmiDateMenu"
                                        :close-on-content-click="false"
                                        transition="scale-transition"
                                        offset-y
                                        min-width="auto">
                                        <template #activator="{ on, attrs }">
                                            <v-text-field
                                                v-model="pmiForm.date"
                                                label="Inspection Date"
                                                readonly
                                                outlined
                                                :rules="[rules.required]"
                                                v-bind="attrs"
                                                v-on="on" />
                                        </template>
                                        <v-date-picker v-model="pmiForm.date" @input="pmiDateMenu = false" />
                                    </v-menu>
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-select
                                        v-model="pmiForm.type"
                                        :items="pmiTypes"
                                        label="Inspection Type"
                                        :rules="[rules.required]"
                                        outlined />
                                </v-col>
                            </v-row>

                            <v-subheader class="px-0">Checklist Items</v-subheader>
                            <v-card outlined class="mb-4">
                                <v-list dense>
                                    <v-list-item v-for="(check, idx) in pmiChecklist" :key="idx">
                                        <v-list-item-action>
                                            <v-checkbox v-model="check.passed" />
                                        </v-list-item-action>
                                        <v-list-item-content>
                                            <v-list-item-title>{{ check.label }}</v-list-item-title>
                                        </v-list-item-content>
                                        <v-list-item-action style="min-width: 200px">
                                            <v-text-field
                                                v-model="check.notes"
                                                label="Notes"
                                                dense
                                                hide-details />
                                        </v-list-item-action>
                                    </v-list-item>
                                </v-list>
                            </v-card>

                            <v-textarea
                                v-model="pmiForm.additionalNotes"
                                label="Additional Notes / Observations"
                                outlined
                                rows="3" />

                            <v-row>
                                <v-col cols="12" md="6">
                                    <v-select
                                        v-model="pmiForm.overallStatus"
                                        :items="overallStatuses"
                                        label="Overall Status"
                                        :rules="[rules.required]"
                                        outlined />
                                </v-col>
                            </v-row>

                            <v-btn
                                color="primary"
                                :disabled="!pmiFormValid"
                                @click="submitPmi">
                                <v-icon left>{{ mdiCheck }}</v-icon>
                                Submit PMI Report
                            </v-btn>
                        </v-form>
                    </v-card-text>
                </v-card>
            </v-tab-item>

            <!-- ==================== TAB 3: PMI HISTORY ==================== -->
            <v-tab-item>
                <v-card>
                    <v-card-title>
                        Preventive Maintenance Inspection History
                        <v-spacer />
                        <v-text-field
                            v-model="pmiSearch"
                            append-icon="mdi-magnify"
                            label="Search"
                            single-line
                            hide-details
                            dense
                            outlined
                            class="ml-4"
                            style="max-width: 300px" />
                    </v-card-title>
                    <v-card-text>
                        <v-data-table
                            :headers="pmiHeaders"
                            :items="pmiRecords"
                            :search="pmiSearch"
                            :sort-by="['date']"
                            :sort-desc="[true]"
                            class="elevation-1"
                            @click:row="openPmiDetail">
                            <template #[`item.overallStatus`]="{ item }">
                                <v-chip
                                    :color="statusColor(item.overallStatus)"
                                    dark
                                    small>
                                    {{ item.overallStatus }}
                                </v-chip>
                            </template>
                            <template #[`item.checklistSummary`]="{ item }">
                                {{ item.passedCount }}/{{ item.totalChecks }} passed
                            </template>
                        </v-data-table>
                    </v-card-text>
                </v-card>

                <!-- PMI Detail Dialog -->
                <v-dialog v-model="showPmiDetail" max-width="700">
                    <v-card v-if="selectedPmi">
                        <v-card-title>
                            PMI Report — {{ selectedPmi.printer }}
                            <v-spacer />
                            <v-chip :color="statusColor(selectedPmi.overallStatus)" dark small>
                                {{ selectedPmi.overallStatus }}
                            </v-chip>
                        </v-card-title>
                        <v-card-subtitle>
                            {{ formatDateStr(selectedPmi.date) }} — Inspector: {{ selectedPmi.inspector }}
                            — Type: {{ selectedPmi.type }}
                        </v-card-subtitle>
                        <v-card-text>
                            <v-subheader class="px-0">Checklist</v-subheader>
                            <v-simple-table dense>
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Status</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(c, i) in selectedPmi.checklist" :key="i">
                                        <td>{{ c.label }}</td>
                                        <td>
                                            <v-icon small :color="c.passed ? 'green' : 'red'">
                                                {{ c.passed ? mdiCheck : mdiClose }}
                                            </v-icon>
                                        </td>
                                        <td>{{ c.notes || '—' }}</td>
                                    </tr>
                                </tbody>
                            </v-simple-table>
                            <div v-if="selectedPmi.additionalNotes" class="mt-4">
                                <v-subheader class="px-0">Additional Notes</v-subheader>
                                <p>{{ selectedPmi.additionalNotes }}</p>
                            </div>
                        </v-card-text>
                        <v-card-actions>
                            <v-spacer />
                            <v-btn text @click="showPmiDetail = false">Close</v-btn>
                        </v-card-actions>
                    </v-card>
                </v-dialog>
            </v-tab-item>

            <!-- ==================== TAB 4: STATISTICS ==================== -->
            <v-tab-item>
                <v-row>
                    <!-- Summary Cards -->
                    <v-col cols="12" md="3">
                        <v-card class="text-center pa-4">
                            <div class="text-h4">{{ downtimeRecords.length }}</div>
                            <div class="text-subtitle-1">Total Downtime Events</div>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="3">
                        <v-card class="text-center pa-4">
                            <div class="text-h4">{{ totalDowntimeHours }}</div>
                            <div class="text-subtitle-1">Total Downtime (hrs)</div>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="3">
                        <v-card class="text-center pa-4">
                            <div class="text-h4">{{ pmiRecords.length }}</div>
                            <div class="text-subtitle-1">Total PMIs Completed</div>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="3">
                        <v-card class="text-center pa-4">
                            <div class="text-h4">{{ pmiPassRate }}%</div>
                            <div class="text-subtitle-1">PMI Pass Rate</div>
                        </v-card>
                    </v-col>
                </v-row>

                <!-- Downtime by Reason -->
                <v-row class="mt-4">
                    <v-col cols="12" md="6">
                        <v-card>
                            <v-card-title>Downtime by Reason</v-card-title>
                            <v-card-text>
                                <v-simple-table dense>
                                    <thead>
                                        <tr>
                                            <th>Reason</th>
                                            <th>Count</th>
                                            <th>Total Hours</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(stat, idx) in downtimeByReason" :key="idx">
                                            <td>{{ stat.reason }}</td>
                                            <td>{{ stat.count }}</td>
                                            <td>{{ stat.hours }}</td>
                                        </tr>
                                    </tbody>
                                </v-simple-table>
                            </v-card-text>
                        </v-card>
                    </v-col>

                    <!-- Downtime by Printer -->
                    <v-col cols="12" md="6">
                        <v-card>
                            <v-card-title>Downtime by Printer</v-card-title>
                            <v-card-text>
                                <v-simple-table dense>
                                    <thead>
                                        <tr>
                                            <th>Printer</th>
                                            <th>Events</th>
                                            <th>Total Hours</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(stat, idx) in downtimeByPrinter" :key="idx">
                                            <td>{{ stat.printer }}</td>
                                            <td>{{ stat.count }}</td>
                                            <td>{{ stat.hours }}</td>
                                        </tr>
                                    </tbody>
                                </v-simple-table>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>

                <!-- PMI Failure Trends -->
                <v-row class="mt-4">
                    <v-col cols="12">
                        <v-card>
                            <v-card-title>Most Common PMI Failures</v-card-title>
                            <v-card-text>
                                <v-simple-table dense>
                                    <thead>
                                        <tr>
                                            <th>Checklist Item</th>
                                            <th>Failure Count</th>
                                            <th>Failure Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(item, idx) in pmiFailureTrends" :key="idx">
                                            <td>{{ item.label }}</td>
                                            <td>{{ item.failures }}</td>
                                            <td>{{ item.rate }}%</td>
                                        </tr>
                                    </tbody>
                                </v-simple-table>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-tab-item>
        </v-tabs-items>

        <!-- ==================== DOWNTIME DIALOG ==================== -->
        <v-dialog v-model="showDowntimeDialog" max-width="600">
            <v-card>
                <v-card-title>Log Printer Downtime</v-card-title>
                <v-card-text>
                    <v-form ref="downtimeForm" v-model="downtimeFormValid">
                        <v-select
                            v-model="downtimeEntry.printer"
                            :items="printerNames"
                            label="Printer Name"
                            :rules="[rules.required]"
                            outlined />
                        <v-row>
                            <v-col cols="6">
                                <v-menu
                                    v-model="dtStartMenu"
                                    :close-on-content-click="false"
                                    transition="scale-transition"
                                    offset-y
                                    min-width="auto">
                                    <template #activator="{ on, attrs }">
                                        <v-text-field
                                            v-model="downtimeEntry.start"
                                            label="Start Date/Time"
                                            :rules="[rules.required]"
                                            readonly
                                            outlined
                                            v-bind="attrs"
                                            v-on="on" />
                                    </template>
                                    <v-date-picker v-model="downtimeEntry.start" @input="dtStartMenu = false" />
                                </v-menu>
                            </v-col>
                            <v-col cols="6">
                                <v-menu
                                    v-model="dtEndMenu"
                                    :close-on-content-click="false"
                                    transition="scale-transition"
                                    offset-y
                                    min-width="auto">
                                    <template #activator="{ on, attrs }">
                                        <v-text-field
                                            v-model="downtimeEntry.end"
                                            label="End Date/Time (leave blank if ongoing)"
                                            readonly
                                            outlined
                                            clearable
                                            v-bind="attrs"
                                            v-on="on" />
                                    </template>
                                    <v-date-picker v-model="downtimeEntry.end" @input="dtEndMenu = false" />
                                </v-menu>
                            </v-col>
                        </v-row>
                        <v-select
                            v-model="downtimeEntry.reason"
                            :items="downtimeReasons"
                            label="Reason for Downtime"
                            :rules="[rules.required]"
                            outlined />
                        <v-textarea
                            v-model="downtimeEntry.description"
                            label="Description / Details"
                            outlined
                            rows="3" />
                    </v-form>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showDowntimeDialog = false">Cancel</v-btn>
                    <v-btn color="primary" :disabled="!downtimeFormValid" @click="submitDowntime">Save</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiPlus, mdiDelete, mdiCheck, mdiClose } from '@mdi/js'
import axios from 'axios'

interface DowntimeRecord {
    id: string
    userId: string
    groupId: string
    printer: string
    start: string
    end: string | null
    reason: string
    description: string
    username?: string
}

interface PmiCheckItem {
    label: string
    passed: boolean
    notes: string
}

interface PmiRecord {
    id: string
    userId: string
    groupId: string
    printer: string
    inspector: string
    date: string
    type: string
    checklist: PmiCheckItem[]
    additionalNotes: string
    overallStatus: string
    passedCount: number
    totalChecks: number
    username?: string
}

@Component
export default class PMIsAndReporting extends Mixins(BaseMixin) {
    mdiPlus = mdiPlus
    mdiDelete = mdiDelete
    mdiCheck = mdiCheck
    mdiClose = mdiClose

    activeTab = 0
    loading = false

    // ── Dropdown options (fetched from API) ──
    printerNames: string[] = []
    teamUsernames: string[] = []

    // ── Downtime state ──
    showDowntimeDialog = false
    downtimeFormValid = false
    dtStartMenu = false
    dtEndMenu = false
    downtimeRecords: DowntimeRecord[] = []
    downtimeEntry: Partial<DowntimeRecord> = {}

    downtimeReasons = [
        'Mechanical Failure',
        'Electrical Issue',
        'Clogged Nozzle',
        'Bed Adhesion Failure',
        'Filament Runout',
        'Firmware / Software Issue',
        'Scheduled Maintenance',
        'Calibration Required',
        'Part Replacement',
        'Environmental (Power Outage, Temp)',
        'Other',
    ]

    downtimeHeaders = [
        { text: 'Printer', value: 'printer' },
        { text: 'Recorded By', value: 'username' },
        { text: 'Start', value: 'start' },
        { text: 'End', value: 'end' },
        { text: 'Duration', value: 'duration', sortable: false },
        { text: 'Reason', value: 'reason' },
        { text: 'Description', value: 'description' },
        { text: '', value: 'actions', sortable: false, width: '50px' },
    ]

    // ── PMI state ──
    pmiFormValid = false
    pmiDateMenu = false
    pmiSearch = ''
    showPmiDetail = false
    selectedPmi: PmiRecord | null = null
    pmiRecords: PmiRecord[] = []

    pmiForm = {
        printer: '',
        inspector: '',
        date: '',
        type: '',
        additionalNotes: '',
        overallStatus: '',
    }

    pmiTypes = [
        'Daily Inspection',
        'Weekly Inspection',
        'Monthly Inspection',
        'Quarterly Inspection',
        'Annual Inspection',
        'Post-Repair Inspection',
    ]

    overallStatuses = ['Pass', 'Conditional Pass', 'Fail']

    pmiChecklist: PmiCheckItem[] = []

    pmiHeaders = [
        { text: 'Date', value: 'date' },
        { text: 'Printer', value: 'printer' },
        { text: 'Inspector', value: 'inspector' },
        { text: 'Recorded By', value: 'username' },
        { text: 'Type', value: 'type' },
        { text: 'Checklist', value: 'checklistSummary', sortable: false },
        { text: 'Status', value: 'overallStatus' },
    ]

    rules = {
        required: (v: string) => !!v || 'Required',
    }

    // ── Lifecycle ──
    mounted() {
        this.fetchAll()
        this.resetPmiChecklist()
    }

    // ── API calls ──
    async fetchAll() {
        this.loading = true
        try {
            await Promise.all([
                this.fetchDowntime(),
                this.fetchPmi(),
                this.fetchPrinterNames(),
                this.fetchTeamUsernames(),
            ])
        } finally {
            this.loading = false
        }
    }

    async fetchPrinterNames() {
        try {
            const { data } = await axios.get('/api/printers/accessible')
            this.printerNames = (data.printers || []).map((p: any) => p.name)
        } catch (err) {
            console.error('Failed to load printer names:', err)
        }
    }

    async fetchTeamUsernames() {
        try {
            const { data } = await axios.get('/api/pmi/team-members')
            this.teamUsernames = data.usernames || []
        } catch (err) {
            console.error('Failed to load team usernames:', err)
        }
    }

    async fetchDowntime() {
        try {
            const { data } = await axios.get('/api/pmi/downtime')
            this.downtimeRecords = data.records || []
        } catch (err) {
            console.error('Failed to load downtime records:', err)
        }
    }

    async fetchPmi() {
        try {
            const { data } = await axios.get('/api/pmi/inspections')
            this.pmiRecords = data.records || []
        } catch (err) {
            console.error('Failed to load PMI records:', err)
        }
    }

    // ── Downtime methods ──
    async submitDowntime() {
        try {
            await axios.post('/api/pmi/downtime', {
                printer: this.downtimeEntry.printer || '',
                start: this.downtimeEntry.start || '',
                end: this.downtimeEntry.end || null,
                reason: this.downtimeEntry.reason || '',
                description: this.downtimeEntry.description || '',
            })
            await this.fetchDowntime()
        } catch (err: any) {
            console.error('Failed to save downtime:', err.response?.data?.error || err)
        }
        this.downtimeEntry = {}
        this.showDowntimeDialog = false
    }

    async deleteDowntime(item: DowntimeRecord) {
        try {
            await axios.delete(`/api/pmi/downtime/${item.id}`)
            this.downtimeRecords = this.downtimeRecords.filter((r) => r.id !== item.id)
        } catch (err) {
            console.error('Failed to delete downtime:', err)
        }
    }

    // ── PMI methods ──
    resetPmiChecklist() {
        this.pmiChecklist = [
            { label: 'Frame & structural integrity', passed: false, notes: '' },
            { label: 'Belt tension & condition', passed: false, notes: '' },
            { label: 'Lead screws / linear rails lubrication', passed: false, notes: '' },
            { label: 'Nozzle condition & cleanliness', passed: false, notes: '' },
            { label: 'Hotend / heatbreak inspection', passed: false, notes: '' },
            { label: 'Bed leveling & surface condition', passed: false, notes: '' },
            { label: 'Wiring & connectors secure', passed: false, notes: '' },
            { label: 'Fans operational (hotend, part cooling, electronics)', passed: false, notes: '' },
            { label: 'Extruder gear / drive condition', passed: false, notes: '' },
            { label: 'Firmware version & settings check', passed: false, notes: '' },
            { label: 'Filament path clear & PTFE tube condition', passed: false, notes: '' },
            { label: 'Endstops / probe functionality', passed: false, notes: '' },
            { label: 'Thermistor readings accurate', passed: false, notes: '' },
            { label: 'Power supply & electrical safety', passed: false, notes: '' },
        ]
    }

    async submitPmi() {
        try {
            await axios.post('/api/pmi/inspections', {
                printer: this.pmiForm.printer,
                inspector: this.pmiForm.inspector,
                date: this.pmiForm.date,
                type: this.pmiForm.type,
                additionalNotes: this.pmiForm.additionalNotes,
                overallStatus: this.pmiForm.overallStatus,
                checklist: this.pmiChecklist,
            })
            await this.fetchPmi()
        } catch (err: any) {
            console.error('Failed to save PMI:', err.response?.data?.error || err)
        }
        this.pmiForm = { printer: '', inspector: '', date: '', type: '', additionalNotes: '', overallStatus: '' }
        this.resetPmiChecklist()
        this.activeTab = 2 // switch to PMI History
    }

    openPmiDetail(item: PmiRecord) {
        this.selectedPmi = item
        this.showPmiDetail = true
    }

    // ── Computed helpers ──
    get totalDowntimeHours(): string {
        let totalMs = 0
        for (const r of this.downtimeRecords) {
            const start = new Date(r.start).getTime()
            const end = r.end ? new Date(r.end).getTime() : Date.now()
            if (!isNaN(start) && !isNaN(end)) totalMs += end - start
        }
        return (totalMs / 3_600_000).toFixed(1)
    }

    get pmiPassRate(): string {
        if (this.pmiRecords.length === 0) return '0'
        const passed = this.pmiRecords.filter((r) => r.overallStatus === 'Pass').length
        return ((passed / this.pmiRecords.length) * 100).toFixed(0)
    }

    get downtimeByReason(): { reason: string; count: number; hours: string }[] {
        const map: Record<string, { count: number; ms: number }> = {}
        for (const r of this.downtimeRecords) {
            if (!map[r.reason]) map[r.reason] = { count: 0, ms: 0 }
            map[r.reason].count++
            const start = new Date(r.start).getTime()
            const end = r.end ? new Date(r.end).getTime() : Date.now()
            if (!isNaN(start) && !isNaN(end)) map[r.reason].ms += end - start
        }
        return Object.entries(map)
            .map(([reason, v]) => ({ reason, count: v.count, hours: (v.ms / 3_600_000).toFixed(1) }))
            .sort((a, b) => b.count - a.count)
    }

    get downtimeByPrinter(): { printer: string; count: number; hours: string }[] {
        const map: Record<string, { count: number; ms: number }> = {}
        for (const r of this.downtimeRecords) {
            if (!map[r.printer]) map[r.printer] = { count: 0, ms: 0 }
            map[r.printer].count++
            const start = new Date(r.start).getTime()
            const end = r.end ? new Date(r.end).getTime() : Date.now()
            if (!isNaN(start) && !isNaN(end)) map[r.printer].ms += end - start
        }
        return Object.entries(map)
            .map(([printer, v]) => ({ printer, count: v.count, hours: (v.ms / 3_600_000).toFixed(1) }))
            .sort((a, b) => b.count - a.count)
    }

    get pmiFailureTrends(): { label: string; failures: number; rate: string }[] {
        if (this.pmiRecords.length === 0) return []
        const failMap: Record<string, number> = {}
        let totalInspections = this.pmiRecords.length
        for (const r of this.pmiRecords) {
            for (const c of r.checklist) {
                if (!c.passed) {
                    failMap[c.label] = (failMap[c.label] || 0) + 1
                }
            }
        }
        return Object.entries(failMap)
            .map(([label, failures]) => ({
                label,
                failures,
                rate: ((failures / totalInspections) * 100).toFixed(0),
            }))
            .sort((a, b) => b.failures - a.failures)
    }

    // ── Formatting ──
    formatDateStr(dateStr: string): string {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    }

    calcDuration(item: DowntimeRecord): string {
        const start = new Date(item.start).getTime()
        const end = item.end ? new Date(item.end).getTime() : Date.now()
        if (isNaN(start) || isNaN(end)) return '—'
        const hrs = (end - start) / 3_600_000
        if (hrs < 1) return `${Math.round(hrs * 60)}m`
        return `${hrs.toFixed(1)}h`
    }

    statusColor(status: string): string {
        switch (status) {
            case 'Pass':
                return 'green'
            case 'Conditional Pass':
                return 'orange'
            case 'Fail':
                return 'red'
            default:
                return 'grey'
        }
    }
}
</script>
