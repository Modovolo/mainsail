<template>
    <v-container fluid>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h4 mb-2">
                    <v-icon large class="mr-2">mdi-printer-3d-nozzle-heat</v-icon>
                    Print Queue
                </h1>
                <p class="text-subtitle-1 grey--text mb-6">
                    Manage print jobs across your entire fleet. Jobs are automatically dispatched to available printers.
                </p>
            </v-col>
        </v-row>

        <!-- Queue Stats -->
        <v-row>
            <v-col cols="12" sm="6" md="3">
                <v-card elevation="2" class="stat-card">
                    <v-card-text class="d-flex align-center">
                        <v-avatar color="primary" size="48" class="mr-4">
                            <v-icon color="white">mdi-format-list-numbered</v-icon>
                        </v-avatar>
                        <div>
                            <div class="text-h4 font-weight-bold">{{ queuedJobs.length }}</div>
                            <div class="grey--text">Queued Jobs</div>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card elevation="2" class="stat-card">
                    <v-card-text class="d-flex align-center">
                        <v-avatar color="success" size="48" class="mr-4">
                            <v-icon color="white">mdi-printer-3d</v-icon>
                        </v-avatar>
                        <div>
                            <div class="text-h4 font-weight-bold">{{ printingJobs.length }}</div>
                            <div class="grey--text">Printing Now</div>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card elevation="2" class="stat-card">
                    <v-card-text class="d-flex align-center">
                        <v-avatar color="info" size="48" class="mr-4">
                            <v-icon color="white">mdi-check-circle</v-icon>
                        </v-avatar>
                        <div>
                            <div class="text-h4 font-weight-bold">{{ availablePrinters.length }}</div>
                            <div class="grey--text">Available Printers</div>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
            <v-col cols="12" sm="6" md="3">
                <v-card elevation="2" class="stat-card">
                    <v-card-text class="d-flex align-center">
                        <v-avatar color="warning" size="48" class="mr-4">
                            <v-icon color="white">mdi-clock-outline</v-icon>
                        </v-avatar>
                        <div>
                            <div class="text-h4 font-weight-bold">{{ completedToday }}</div>
                            <div class="grey--text">Completed Today</div>
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Add Job Section -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title class="primary white--text">
                        <v-icon class="mr-2" color="white">mdi-plus-circle</v-icon>
                        Add Job to Queue
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <v-row>
                            <v-col cols="12" md="6">
                                <v-select
                                    v-model="selectedFile"
                                    :items="repositoryFiles"
                                    item-text="name"
                                    item-value="id"
                                    label="Select G-Code File"
                                    outlined
                                    prepend-icon="mdi-file-document"
                                    :loading="loadingFiles"
                                ></v-select>
                            </v-col>
                            <v-col cols="12" md="3">
                                <v-text-field
                                    v-model.number="copies"
                                    type="number"
                                    min="1"
                                    max="100"
                                    label="Number of Copies"
                                    outlined
                                    prepend-icon="mdi-content-copy"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="3">
                                <v-select
                                    v-model="priority"
                                    :items="priorityOptions"
                                    label="Priority"
                                    outlined
                                    prepend-icon="mdi-flag"
                                ></v-select>
                            </v-col>
                        </v-row>
                        <v-btn
                            color="primary"
                            :disabled="!selectedFile"
                            :loading="addingJob"
                            @click="addJobToQueue"
                        >
                            <v-icon left>mdi-playlist-plus</v-icon>
                            Add to Queue
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Active Prints -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2" color="success">mdi-printer-3d</v-icon>
                        Active Prints
                        <v-spacer></v-spacer>
                        <v-btn icon @click="refreshQueue" :loading="loading">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>

                    <v-card-text v-if="printingJobs.length === 0" class="text-center pa-6">
                        <v-icon size="60" color="grey lighten-1">mdi-printer-3d-off</v-icon>
                        <div class="text-h6 grey--text mt-4">No active prints</div>
                        <div class="text-body-2 grey--text">Jobs will appear here when printers are working</div>
                    </v-card-text>

                    <v-list v-else three-line>
                        <template v-for="(job, index) in printingJobs">
                            <v-list-item :key="job.id">
                                <v-list-item-avatar :color="job.status === 'paused' ? 'warning' : 'success'" size="48">
                                    <v-icon color="white">{{ job.status === 'paused' ? 'mdi-pause' : 'mdi-printer-3d' }}</v-icon>
                                </v-list-item-avatar>
                                <v-list-item-content>
                                    <v-list-item-title class="font-weight-medium">
                                        {{ job.fileName }}
                                        <v-chip v-if="job.isQueued === false" x-small class="ml-2" color="info" outlined>
                                            Direct
                                        </v-chip>
                                        <v-chip v-if="job.status === 'paused'" x-small class="ml-2" color="warning">
                                            Paused
                                        </v-chip>
                                    </v-list-item-title>
                                    <v-list-item-subtitle>
                                        Printing on: <strong>{{ job.printerName }}</strong>
                                    </v-list-item-subtitle>
                                    <v-list-item-subtitle>
                                        <v-progress-linear
                                            :value="job.progress"
                                            :color="job.status === 'paused' ? 'warning' : 'success'"
                                            height="8"
                                            rounded
                                            class="mt-2"
                                        ></v-progress-linear>
                                    </v-list-item-subtitle>
                                </v-list-item-content>
                                <v-list-item-action>
                                    <div class="text-right">
                                        <div class="text-h6" :class="job.status === 'paused' ? 'warning--text' : 'success--text'">{{ job.progress }}%</div>
                                        <div class="text-caption grey--text">{{ job.timeRemaining }} remaining</div>
                                    </div>
                                </v-list-item-action>
                                <v-list-item-action>
                                    <v-tooltip bottom>
                                        <template #activator="{ on, attrs }">
                                            <v-btn 
                                                icon 
                                                :color="job.status === 'paused' ? 'success' : 'warning'" 
                                                v-bind="attrs" 
                                                v-on="on"
                                                @click="togglePause(job)"
                                            >
                                                <v-icon>{{ job.status === 'paused' ? 'mdi-play' : 'mdi-pause' }}</v-icon>
                                            </v-btn>
                                        </template>
                                        <span>{{ job.status === 'paused' ? 'Resume' : 'Pause' }}</span>
                                    </v-tooltip>
                                </v-list-item-action>
                                <v-list-item-action>
                                    <v-tooltip bottom>
                                        <template #activator="{ on, attrs }">
                                            <v-btn icon color="error" v-bind="attrs" v-on="on" @click="cancelJob(job)">
                                                <v-icon>mdi-stop-circle</v-icon>
                                            </v-btn>
                                        </template>
                                        <span>Cancel Print</span>
                                    </v-tooltip>
                                </v-list-item-action>
                            </v-list-item>
                            <v-divider v-if="index < printingJobs.length - 1" :key="'div-' + job.id"></v-divider>
                        </template>
                    </v-list>
                </v-card>
            </v-col>
        </v-row>

        <!-- Queued Jobs -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2" color="warning">mdi-clock-outline</v-icon>
                        Queued Jobs
                        <v-chip class="ml-2" small color="warning" text-color="white">
                            {{ queuedJobs.length }} waiting
                        </v-chip>
                        <v-spacer></v-spacer>
                        <v-text-field
                            v-model="searchQueue"
                            append-icon="mdi-magnify"
                            label="Search queue"
                            single-line
                            hide-details
                            dense
                            outlined
                            class="search-field"
                        ></v-text-field>
                    </v-card-title>
                    <v-divider></v-divider>

                    <v-card-text v-if="queuedJobs.length === 0" class="text-center pa-6">
                        <v-icon size="60" color="grey lighten-1">mdi-playlist-remove</v-icon>
                        <div class="text-h6 grey--text mt-4">Queue is empty</div>
                        <div class="text-body-2 grey--text">Add jobs above to start printing</div>
                    </v-card-text>

                    <v-data-table
                        v-else
                        :headers="queueHeaders"
                        :items="filteredQueuedJobs"
                        :items-per-page="10"
                        class="queue-table"
                    >
                        <template #item.position="{ item }">
                            <v-chip small :color="getPositionColor(item.position)">
                                #{{ item.position }}
                            </v-chip>
                        </template>

                        <template #item.fileName="{ item }">
                            <div class="d-flex align-center">
                                <v-icon class="mr-2" color="blue">mdi-file-document</v-icon>
                                {{ item.fileName }}
                            </div>
                        </template>

                        <template #item.priority="{ item }">
                            <v-chip small :color="getPriorityColor(item.priority)">
                                <v-icon left small>mdi-flag</v-icon>
                                {{ item.priority }}
                            </v-chip>
                        </template>

                        <template #item.addedAt="{ item }">
                            {{ formatDate(item.addedAt) }}
                        </template>

                        <template #item.estimatedStart="{ item }">
                            <span class="grey--text">{{ item.estimatedStart || 'Calculating...' }}</span>
                        </template>

                        <template #item.actions="{ item }">
                            <v-tooltip bottom>
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        icon
                                        small
                                        color="primary"
                                        v-bind="attrs"
                                        v-on="on"
                                        :disabled="item.position === 1"
                                        @click="moveUp(item)"
                                    >
                                        <v-icon small>mdi-arrow-up</v-icon>
                                    </v-btn>
                                </template>
                                <span>Move Up</span>
                            </v-tooltip>
                            <v-tooltip bottom>
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        icon
                                        small
                                        color="primary"
                                        v-bind="attrs"
                                        v-on="on"
                                        :disabled="item.position === queuedJobs.length"
                                        @click="moveDown(item)"
                                    >
                                        <v-icon small>mdi-arrow-down</v-icon>
                                    </v-btn>
                                </template>
                                <span>Move Down</span>
                            </v-tooltip>
                            <v-tooltip bottom>
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        icon
                                        small
                                        color="error"
                                        v-bind="attrs"
                                        v-on="on"
                                        @click="removeFromQueue(item)"
                                    >
                                        <v-icon small>mdi-delete</v-icon>
                                    </v-btn>
                                </template>
                                <span>Remove</span>
                            </v-tooltip>
                        </template>
                    </v-data-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Printer Status -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-printer-3d</v-icon>
                        Printer Status
                        <v-chip class="ml-2" small :color="onlinePrintersCount > 0 ? 'success' : 'grey'" text-color="white">
                            {{ onlinePrintersCount }} online
                        </v-chip>
                        <v-spacer></v-spacer>
                        <v-btn icon small @click="refreshQueue" :loading="loading">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>
                    <v-card-text v-if="printers.length === 0" class="text-center pa-6">
                        <v-icon size="60" color="grey lighten-1">mdi-printer-3d-off</v-icon>
                        <div class="text-h6 grey--text mt-4">No printers registered</div>
                    </v-card-text>
                    <v-row v-else class="pa-4">
                        <v-col v-for="printer in printers" :key="printer.id" cols="12" sm="6" md="4" lg="3">
                            <v-card
                                outlined
                                :class="['printer-status-card', getPrinterStatusClass(printer.status)]"
                            >
                                <v-card-text class="pa-3">
                                    <div class="d-flex align-center mb-2">
                                        <v-badge
                                            :color="printer.online ? 'success' : 'grey'"
                                            dot
                                            overlap
                                            bordered
                                        >
                                            <v-icon :color="getPrinterStatusColor(printer.status)" class="mr-2">
                                                mdi-printer-3d
                                            </v-icon>
                                        </v-badge>
                                        <span class="font-weight-medium ml-1">{{ printer.name }}</span>
                                        <v-spacer></v-spacer>
                                        <v-chip x-small :color="getPrinterStatusColor(printer.status)">
                                            {{ getDisplayStatus(printer) }}
                                        </v-chip>
                                    </div>
                                    
                                    <!-- Printing Progress -->
                                    <div v-if="printer.status === 'printing'" class="mt-2">
                                        <div class="d-flex justify-space-between text-caption mb-1">
                                            <span class="grey--text text--darken-1">{{ printer.currentJob }}</span>
                                            <span class="primary--text font-weight-medium">{{ printer.progress }}%</span>
                                        </div>
                                        <v-progress-linear
                                            :value="printer.progress"
                                            color="primary"
                                            height="6"
                                            rounded
                                        ></v-progress-linear>
                                        <div v-if="printer.timeRemaining" class="text-caption grey--text mt-1">
                                            <v-icon x-small class="mr-1">mdi-clock-outline</v-icon>
                                            {{ printer.timeRemaining }} remaining
                                        </div>
                                    </div>
                                    
                                    <!-- Idle/Ready -->
                                    <div v-else-if="printer.online" class="text-caption success--text">
                                        <v-icon x-small color="success" class="mr-1">mdi-check-circle</v-icon>
                                        Ready for jobs
                                    </div>
                                    
                                    <!-- Offline -->
                                    <div v-else class="text-caption grey--text">
                                        <v-icon x-small color="grey" class="mr-1">mdi-wifi-off</v-icon>
                                        Offline
                                    </div>
                                </v-card-text>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-card>
            </v-col>
        </v-row>

        <!-- Snackbar for notifications -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
            {{ snackbarText }}
            <template #action="{ attrs }">
                <v-btn text v-bind="attrs" @click="snackbar = false">Close</v-btn>
            </template>
        </v-snackbar>
    </v-container>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import axios from 'axios'

interface QueueJob {
    id: string
    fileId: string
    fileName: string
    position: number
    priority: string
    addedAt: string
    addedBy: string
    estimatedStart: string | null
    status: 'queued' | 'printing' | 'completed' | 'cancelled' | 'paused'
    printerName?: string
    printerId?: string
    progress?: number
    timeRemaining?: string
    isQueued?: boolean  // true if from queue, false if started directly on printer
}

interface PrinterStatus {
    id: string
    name: string
    status: 'idle' | 'printing' | 'offline' | 'error'
    online: boolean
    state: string  // Raw Klipper state: standby, printing, paused, complete, error, etc.
    currentJob: string | null
    progress: number
    timeRemaining: string | null
}

interface RepositoryFile {
    id: string
    name: string
}

@Component
export default class PrintQueue extends Mixins(BaseMixin) {
    // Data
    queuedJobs: QueueJob[] = []
    printingJobs: QueueJob[] = []
    printers: PrinterStatus[] = []
    repositoryFiles: RepositoryFile[] = []
    searchQueue = ''
    loading = false
    loadingFiles = false
    addingJob = false

    // Add job form
    selectedFile: string | null = null
    copies = 1
    priority = 'Normal'
    priorityOptions = ['Low', 'Normal', 'High', 'Urgent']

    // Stats
    completedToday = 0

    // Snackbar
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    // Polling interval
    pollInterval: number | null = null

    queueHeaders = [
        { text: '#', value: 'position', sortable: false, width: '60px' },
        { text: 'File Name', value: 'fileName', sortable: true },
        { text: 'Priority', value: 'priority', sortable: true },
        { text: 'Added', value: 'addedAt', sortable: true },
        { text: 'Est. Start', value: 'estimatedStart', sortable: false },
        { text: 'Actions', value: 'actions', sortable: false, align: 'end' },
    ]

    get filteredQueuedJobs(): QueueJob[] {
        if (!this.searchQueue) return this.queuedJobs
        const searchLower = this.searchQueue.toLowerCase()
        return this.queuedJobs.filter((j) => j.fileName.toLowerCase().includes(searchLower))
    }

    get availablePrinters(): PrinterStatus[] {
        return this.printers.filter((p) => p.status === 'idle' && p.online)
    }

    get onlinePrintersCount(): number {
        return this.printers.filter((p) => p.online).length
    }

    mounted() {
        this.refreshQueue()
        this.loadRepositoryFiles()
        this.startPolling()
    }

    beforeDestroy() {
        this.stopPolling()
    }

    startPolling() {
        // Poll every 5 seconds for queue updates
        this.pollInterval = window.setInterval(() => {
            this.refreshQueue()
        }, 5000)
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval)
            this.pollInterval = null
        }
    }

    async refreshQueue() {
        try {
            const { data } = await axios.get('/api/print-queue')
            this.queuedJobs = data.queued || []
            this.printingJobs = data.printing || []
            this.printers = data.printers || []
            this.completedToday = data.completedToday || 0
        } catch (error) {
            console.error('Error loading queue:', error)
        }
    }

    async loadRepositoryFiles() {
        this.loadingFiles = true
        try {
            const { data } = await axios.get('/api/files')
            this.repositoryFiles = data.files || []
        } catch (error) {
            console.error('Error loading files:', error)
        } finally {
            this.loadingFiles = false
        }
    }

    async addJobToQueue() {
        if (!this.selectedFile) return

        this.addingJob = true
        try {
            await axios.post('/api/print-queue/add', {
                fileId: this.selectedFile,
                copies: this.copies,
                priority: this.priority,
            })

            this.showSuccess(`Added ${this.copies} job(s) to queue`)
            this.selectedFile = null
            this.copies = 1
            this.priority = 'Normal'
            await this.refreshQueue()
        } catch (error: any) {
            console.error('Error adding job:', error)
            this.showError(error.response?.data?.error || 'Failed to add job')
        } finally {
            this.addingJob = false
        }
    }

    async moveUp(job: QueueJob) {
        await this.updatePosition(job.id, job.position - 1)
    }

    async moveDown(job: QueueJob) {
        await this.updatePosition(job.id, job.position + 1)
    }

    async updatePosition(jobId: string, newPosition: number) {
        try {
            await axios.put(`/api/print-queue/${jobId}/position`, { position: newPosition })
            await this.refreshQueue()
        } catch (error) {
            console.error('Error updating position:', error)
            this.showError('Failed to update position')
        }
    }

    async removeFromQueue(job: QueueJob) {
        try {
            await axios.delete(`/api/print-queue/${job.id}`)
            this.showSuccess('Job removed from queue')
            await this.refreshQueue()
        } catch (error) {
            console.error('Error removing job:', error)
            this.showError('Failed to remove job')
        }
    }

    async cancelJob(job: QueueJob) {
        try {
            // For non-queued jobs (started directly on printer), use printer_id
            // For queued jobs, use the queue job id
            const cancelId = job.isQueued === false ? job.printerId : job.id
            
            await axios.post(`/api/print-queue/${cancelId}/cancel`)
            this.showSuccess('Print cancelled')
            await this.refreshQueue()
        } catch (error: any) {
            console.error('Error cancelling job:', error)
            this.showError(error.response?.data?.error || 'Failed to cancel print')
        }
    }

    async togglePause(job: QueueJob) {
        try {
            const printerId = job.printerId
            const action = job.status === 'paused' ? 'resume' : 'pause'
            
            await axios.post(`/api/print-queue/${printerId}/${action}`)
            this.showSuccess(action === 'pause' ? 'Print paused' : 'Print resumed')
            await this.refreshQueue()
        } catch (error: any) {
            console.error(`Error ${job.status === 'paused' ? 'resuming' : 'pausing'} job:`, error)
            this.showError(error.response?.data?.error || `Failed to ${job.status === 'paused' ? 'resume' : 'pause'} print`)
        }
    }

    getPositionColor(position: number): string {
        if (position === 1) return 'success'
        if (position <= 3) return 'info'
        return 'grey'
    }

    getPriorityColor(priority: string): string {
        switch (priority) {
            case 'Urgent':
                return 'error'
            case 'High':
                return 'warning'
            case 'Normal':
                return 'info'
            case 'Low':
                return 'grey'
            default:
                return 'grey'
        }
    }

    getPrinterStatusColor(status: string): string {
        switch (status) {
            case 'idle':
                return 'success'
            case 'printing':
                return 'primary'
            case 'paused':
                return 'warning'
            case 'offline':
                return 'grey'
            case 'error':
                return 'error'
            default:
                return 'grey'
        }
    }

    getPrinterStatusClass(status: string): string {
        return `status-${status}`
    }

    getDisplayStatus(printer: PrinterStatus): string {
        // Show more detailed status based on Klipper state
        if (!printer.online) return 'offline'
        
        const state = printer.state?.toLowerCase() || ''
        switch (state) {
            case 'printing':
                return 'printing'
            case 'paused':
                return 'paused'
            case 'complete':
                return 'complete'
            case 'error':
                return 'error'
            case 'standby':
            case 'ready':
                return 'idle'
            case 'cancelled':
                return 'cancelled'
            default:
                return printer.status || 'unknown'
        }
    }

    formatDate(dateString: string): string {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    showSuccess(message: string) {
        this.snackbarText = message
        this.snackbarColor = 'success'
        this.snackbar = true
    }

    showError(message: string) {
        this.snackbarText = message
        this.snackbarColor = 'error'
        this.snackbar = true
    }
}
</script>

<style scoped>
.search-field {
    max-width: 300px;
}

.stat-card {
    transition: transform 0.2s ease;
}

.stat-card:hover {
    transform: translateY(-2px);
}

.queue-table {
    width: 100%;
}

.printer-status-card {
    transition: all 0.2s ease;
}

.printer-status-card.status-idle {
    border-color: #4caf50;
    border-left-width: 4px;
}

.printer-status-card.status-printing {
    border-color: #2196f3;
    border-left-width: 4px;
}

.printer-status-card.status-paused {
    border-color: #ff9800;
    border-left-width: 4px;
}

.printer-status-card.status-offline {
    border-color: #9e9e9e;
    border-left-width: 4px;
}

.printer-status-card.status-error {
    border-color: #f44336;
    border-left-width: 4px;
}
</style>
