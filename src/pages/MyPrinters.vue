<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <div class="d-flex align-center justify-space-between mb-4">
                    <h1 class="text-h4 d-flex align-center">
                        <v-icon class="mr-2" large>mdi-printer-3d</v-icon>
                        My Printers
                    </h1>
                    <v-btn color="primary" to="/register-printer">
                        <v-icon left>mdi-plus</v-icon>
                        Register Printer
                    </v-btn>
                </div>
            </v-col>
        </v-row>

        <v-progress-linear v-if="loading" indeterminate class="mb-4" />

        <!-- Empty state -->
        <v-card v-if="!loading && printers.length === 0" class="text-center pa-12">
            <v-icon size="80" color="grey lighten-1" class="mb-4">mdi-printer-3d-off</v-icon>
            <h2 class="text-h5 mb-2">No Printers Registered</h2>
            <p class="text-body-1 grey--text mb-6">
                Get started by registering your first 3D printer to Modovolo Fleet.
            </p>
            <v-btn color="primary" to="/register-printer">
                <v-icon left>mdi-plus</v-icon>
                Register Your First Printer
            </v-btn>
        </v-card>

        <!-- Printers grid -->
        <v-row v-else>
            <v-col v-for="printer in printers" :key="printer.id" cols="12" sm="6" md="4" lg="3">
                <v-card class="printer-card" outlined>
                    <v-card-title class="d-flex align-center">
                        <v-icon left :color="getPrinterStatusColor(printer.status)">
                            mdi-printer-3d
                        </v-icon>
                        <span class="text-truncate">{{ printer.name }}</span>
                        <v-spacer />
                        <v-chip
                            :color="getPrinterStatusColor(printer.status)"
                            small
                            dark
                        >
                            {{ printer.status || 'offline' }}
                        </v-chip>
                    </v-card-title>

                    <v-card-text>
                        <div class="printer-info">
                            <div class="info-row">
                                <span class="label">Printer ID:</span>
                                <code class="value">{{ truncateId(printer.printerId) }}</code>
                                <v-btn icon x-small @click="copyToClipboard(printer.printerId)" class="ml-1">
                                    <v-icon x-small>mdi-content-copy</v-icon>
                                </v-btn>
                            </div>
                            <div class="info-row">
                                <span class="label">Registered:</span>
                                <span class="value">{{ formatDateString(printer.createdAt) }}</span>
                            </div>
                            <div class="info-row">
                                <span class="label">Last Connected:</span>
                                <span class="value">{{ formatDateString(printer.lastConnected) }}</span>
                            </div>
                        </div>
                    </v-card-text>

                    <v-card-actions>
                        <v-btn text small color="primary" :to="`/?printer=${printer.printerId}`">
                            <v-icon small left>mdi-eye</v-icon>
                            View
                        </v-btn>
                        <v-spacer />
                        <v-btn text small color="error" @click="confirmDelete(printer)">
                            <v-icon small left>mdi-delete</v-icon>
                            Remove
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>

        <!-- Delete confirmation dialog -->
        <v-dialog v-model="deleteDialog" max-width="400">
            <v-card>
                <v-card-title class="headline">
                    <v-icon color="error" class="mr-2">mdi-alert-circle</v-icon>
                    Remove Printer
                </v-card-title>
                <v-card-text v-if="printerToDelete">
                    Are you sure you want to remove <strong>{{ printerToDelete.name }}</strong>?
                    This action cannot be undone.
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="deleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" @click="deletePrinter" :loading="deleteLoading">
                        Remove
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Snackbar for notifications -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
            {{ snackbarText }}
            <template v-slot:action="{ attrs }">
                <v-btn text v-bind="attrs" @click="snackbar = false">Close</v-btn>
            </template>
        </v-snackbar>
    </v-container>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

interface Printer {
    id: number
    printerId: string
    name: string
    status: string
    createdAt: string
    lastConnected: string | null
}

@Component
export default class MyPrinters extends Mixins(BaseMixin) {
    loading = true
    printers: Printer[] = []
    deleteDialog = false
    deleteLoading = false
    printerToDelete: Printer | null = null
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    async mounted(): Promise<void> {
        await this.loadPrinters()
    }

    async loadPrinters(): Promise<void> {
        this.loading = true
        try {
            const token = localStorage.getItem('access_token')
            if (!token) {
                this.$router.push('/login')
                return
            }

            const response = await fetch('/api/printers', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.status === 401) {
                this.$router.push('/login')
                return
            }

            if (!response.ok) {
                throw new Error('Failed to load printers')
            }

            const data = await response.json()
            this.printers = data.printers || []
        } catch (error) {
            console.error('Error loading printers:', error)
            this.showSnackbar('Failed to load printers', 'error')
        } finally {
            this.loading = false
        }
    }

    getPrinterStatusColor(status: string): string {
        switch (status?.toLowerCase()) {
            case 'online':
                return 'success'
            case 'printing':
                return 'primary'
            case 'error':
                return 'error'
            default:
                return 'grey'
        }
    }

    truncateId(id: string): string {
        if (!id) return ''
        if (id.length <= 12) return id
        return `${id.substring(0, 6)}...${id.substring(id.length - 4)}`
    }

    async copyToClipboard(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text)
            this.showSnackbar('Copied to clipboard', 'success')
        } catch (error) {
            console.error('Failed to copy:', error)
        }
    }

    formatDateString(dateString: string | null): string {
        if (!dateString) return 'Never'
        try {
            const date = new Date(dateString)
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
        } catch {
            return dateString
        }
    }

    confirmDelete(printer: Printer): void {
        this.printerToDelete = printer
        this.deleteDialog = true
    }

    async deletePrinter(): Promise<void> {
        if (!this.printerToDelete) return

        this.deleteLoading = true
        try {
            const token = localStorage.getItem('access_token')
            const response = await fetch(`/api/printers/${this.printerToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (!response.ok) {
                throw new Error('Failed to delete printer')
            }

            this.showSnackbar(`${this.printerToDelete.name} removed successfully`, 'success')
            this.printers = this.printers.filter((p) => p.id !== this.printerToDelete?.id)
        } catch (error) {
            console.error('Error deleting printer:', error)
            this.showSnackbar('Failed to remove printer', 'error')
        } finally {
            this.deleteLoading = false
            this.deleteDialog = false
            this.printerToDelete = null
        }
    }

    showSnackbar(text: string, color: string): void {
        this.snackbarText = text
        this.snackbarColor = color
        this.snackbar = true
    }
}
</script>

<style scoped>
.printer-card {
    transition: transform 0.2s, box-shadow 0.2s;
}

.printer-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
}

.printer-info {
    font-size: 0.875rem;
}

.info-row {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
}

.info-row .label {
    color: rgba(255, 255, 255, 0.6);
    min-width: 100px;
}

.info-row .value {
    color: rgba(255, 255, 255, 0.9);
}

.info-row code {
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
}
</style>
