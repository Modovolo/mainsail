<template>
    <v-container fluid>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h4 mb-2">
                    <v-icon large class="mr-2">mdi-folder-network</v-icon>
                    Central File Repository
                </h1>
                <p class="text-subtitle-1 grey--text mb-6">
                    Shared G-Code files available to all printers in your fleet
                </p>
            </v-col>
        </v-row>

        <!-- Upload Section -->
        <v-row>
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title class="primary white--text">
                        <v-icon class="mr-2" color="white">mdi-cloud-upload</v-icon>
                        Upload Files
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <v-file-input
                            v-model="selectedFiles"
                            multiple
                            chips
                            show-size
                            label="Select G-Code files to upload"
                            accept=".gcode,.g,.gc,.gco"
                            prepend-icon="mdi-file-document-multiple"
                            :loading="uploading"
                            @change="onFilesSelected"
                        ></v-file-input>
                        <v-btn
                            color="primary"
                            :disabled="!selectedFiles.length || uploading"
                            :loading="uploading"
                            @click="uploadFiles"
                        >
                            <v-icon left>mdi-upload</v-icon>
                            Upload to Repository
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Files List -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-folder-open</v-icon>
                        Repository Files
                        <v-spacer></v-spacer>
                        <v-text-field
                            v-model="search"
                            append-icon="mdi-magnify"
                            label="Search files"
                            single-line
                            hide-details
                            dense
                            outlined
                            class="search-field"
                        ></v-text-field>
                        <v-btn icon class="ml-2" @click="refreshFiles" :loading="loading">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>

                    <!-- Loading State -->
                    <v-card-text v-if="loading" class="text-center pa-6">
                        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                        <div class="mt-4 grey--text">Loading files...</div>
                    </v-card-text>

                    <!-- Empty State -->
                    <v-card-text v-else-if="files.length === 0" class="text-center pa-6">
                        <v-icon size="80" color="grey lighten-1">mdi-folder-open-outline</v-icon>
                        <div class="text-h6 grey--text mt-4">No files in repository</div>
                        <div class="text-body-2 grey--text">Upload G-Code files to share them across your fleet</div>
                    </v-card-text>

                    <!-- Files Table -->
                    <v-data-table
                        v-else
                        :headers="headers"
                        :items="filteredFiles"
                        :search="search"
                        :items-per-page="15"
                        class="files-table"
                    >
                        <template #item.name="{ item }">
                            <div class="d-flex align-center">
                                <v-icon class="mr-2" color="blue">mdi-file-document</v-icon>
                                {{ item.name }}
                            </div>
                        </template>

                        <template #item.size="{ item }">
                            {{ formatFileSize(item.size) }}
                        </template>

                        <template #item.uploadedAt="{ item }">
                            {{ formatUploadDate(item.uploadedAt) }}
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
                                        @click="sendToPrinter(item)"
                                    >
                                        <v-icon small>mdi-printer-3d</v-icon>
                                    </v-btn>
                                </template>
                                <span>Send to Printer</span>
                            </v-tooltip>
                            <v-tooltip bottom>
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        icon
                                        small
                                        color="info"
                                        v-bind="attrs"
                                        v-on="on"
                                        @click="downloadFile(item)"
                                    >
                                        <v-icon small>mdi-download</v-icon>
                                    </v-btn>
                                </template>
                                <span>Download</span>
                            </v-tooltip>
                            <v-tooltip bottom>
                                <template #activator="{ on, attrs }">
                                    <v-btn
                                        icon
                                        small
                                        color="error"
                                        v-bind="attrs"
                                        v-on="on"
                                        @click="confirmDelete(item)"
                                    >
                                        <v-icon small>mdi-delete</v-icon>
                                    </v-btn>
                                </template>
                                <span>Delete</span>
                            </v-tooltip>
                        </template>
                    </v-data-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Send to Printer Dialog -->
        <v-dialog v-model="sendDialog" max-width="500">
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-send</v-icon>
                    Send to Printer
                </v-card-title>
                <v-card-text class="pa-6">
                    <div class="mb-4">
                        <strong>File:</strong> {{ selectedFile?.name }}
                    </div>
                    <v-select
                        v-model="selectedPrinter"
                        :items="printers"
                        item-text="name"
                        item-value="printerId"
                        label="Select Printer"
                        outlined
                        prepend-icon="mdi-printer-3d"
                    ></v-select>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="sendDialog = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!selectedPrinter"
                        :loading="sending"
                        @click="confirmSendToPrinter"
                    >
                        <v-icon left>mdi-send</v-icon>
                        Send
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="deleteDialog" max-width="400">
            <v-card>
                <v-card-title class="error white--text">
                    <v-icon class="mr-2" color="white">mdi-alert</v-icon>
                    Confirm Delete
                </v-card-title>
                <v-card-text class="pa-6">
                    Are you sure you want to delete <strong>{{ selectedFile?.name }}</strong>?
                    <br><br>
                    This action cannot be undone.
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="deleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" :loading="deleting" @click="deleteFile">
                        <v-icon left>mdi-delete</v-icon>
                        Delete
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

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

interface RepositoryFile {
    id: string
    name: string
    size: number
    uploadedAt: string
    uploadedBy: string
}

interface Printer {
    printerId: string
    name: string
    isActive: boolean
}

@Component
export default class CentralFiles extends Mixins(BaseMixin) {
    // Data
    files: RepositoryFile[] = []
    printers: Printer[] = []
    selectedFiles: File[] = []
    search = ''
    loading = false
    uploading = false
    sending = false
    deleting = false

    // Dialogs
    sendDialog = false
    deleteDialog = false
    selectedFile: RepositoryFile | null = null
    selectedPrinter: string | null = null

    // Snackbar
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    headers = [
        { text: 'Name', value: 'name', sortable: true },
        { text: 'Size', value: 'size', sortable: true },
        { text: 'Uploaded', value: 'uploadedAt', sortable: true },
        { text: 'Uploaded By', value: 'uploadedBy', sortable: true },
        { text: 'Actions', value: 'actions', sortable: false, align: 'end' },
    ]

    get filteredFiles(): RepositoryFile[] {
        if (!this.search) return this.files
        const searchLower = this.search.toLowerCase()
        return this.files.filter((f) => f.name.toLowerCase().includes(searchLower))
    }

    mounted() {
        this.refreshFiles()
        this.loadPrinters()
    }

    async refreshFiles() {
        this.loading = true
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/files', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            if (response.ok) {
                const data = await response.json()
                this.files = data.files || []
            } else {
                this.showError('Failed to load files')
            }
        } catch (error) {
            console.error('Error loading files:', error)
            this.showError('Failed to load files')
        } finally {
            this.loading = false
        }
    }

    async loadPrinters() {
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/printers', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            if (response.ok) {
                const data = await response.json()
                this.printers = data.printers || []
            }
        } catch (error) {
            console.error('Error loading printers:', error)
        }
    }

    onFilesSelected() {
        // File input change handler
    }

    async uploadFiles() {
        if (!this.selectedFiles.length) return

        this.uploading = true
        try {
            const token = localStorage.getItem('fleet_token')
            const formData = new FormData()

            for (const file of this.selectedFiles) {
                formData.append('files', file)
            }

            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            })

            if (response.ok) {
                this.showSuccess('Files uploaded successfully')
                this.selectedFiles = []
                await this.refreshFiles()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to upload files')
            }
        } catch (error) {
            console.error('Error uploading files:', error)
            this.showError('Failed to upload files')
        } finally {
            this.uploading = false
        }
    }

    sendToPrinter(file: RepositoryFile) {
        this.selectedFile = file
        this.selectedPrinter = null
        this.sendDialog = true
    }

    async confirmSendToPrinter() {
        if (!this.selectedFile || !this.selectedPrinter) return

        this.sending = true
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/files/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileId: this.selectedFile.id,
                    printerId: this.selectedPrinter,
                }),
            })

            if (response.ok) {
                this.showSuccess('File sent to printer successfully')
                this.sendDialog = false
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to send file')
            }
        } catch (error) {
            console.error('Error sending file:', error)
            this.showError('Failed to send file to printer')
        } finally {
            this.sending = false
        }
    }

    async downloadFile(file: RepositoryFile) {
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch(`/api/files/download/${file.id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = file.name
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
                document.body.removeChild(a)
            } else {
                this.showError('Failed to download file')
            }
        } catch (error) {
            console.error('Error downloading file:', error)
            this.showError('Failed to download file')
        }
    }

    confirmDelete(file: RepositoryFile) {
        this.selectedFile = file
        this.deleteDialog = true
    }

    async deleteFile() {
        if (!this.selectedFile) return

        this.deleting = true
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch(`/api/files/${this.selectedFile.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.ok) {
                this.showSuccess('File deleted successfully')
                this.deleteDialog = false
                await this.refreshFiles()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to delete file')
            }
        } catch (error) {
            console.error('Error deleting file:', error)
            this.showError('Failed to delete file')
        } finally {
            this.deleting = false
        }
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    formatUploadDate(dateString: string): string {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
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

.files-table {
    width: 100%;
}

.opacity-20 {
    opacity: 0.2;
}
</style>
