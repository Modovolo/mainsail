<template>
    <div>
        <!-- GCode Upload Zone -->
        <v-card class="mb-6">
            <v-card-title>Upload GCode to Printers</v-card-title>
            <v-card-text>
                <v-row>
                    <v-col cols="12" md="6">
                        <div
                            :class="['drop-zone', { 'drop-zone-active': isDragging }]"
                            style="border: 2px dashed #0000FF; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s;"
                            @drop.prevent="onFileDrop"
                            @dragover.prevent="isDragging = true"
                            @dragleave.prevent="isDragging = false"
                            @click="triggerFileDialog">
                            <v-icon x-large color="primary">mdi-cloud-upload</v-icon>
                            <p v-if="!selectedFile" class="mt-3 mb-0">Drop GCode file here or click to browse</p>
                            <p v-else class="mt-3 mb-0"><strong>{{ selectedFile.name }}</strong> ({{ formatFileSize(selectedFile.size) }})</p>
                            <div v-if="thumbnailUrl" class="drop-zone-preview">
                                <img :src="thumbnailUrl" alt="GCode Thumbnail preview" />
                            </div>
                        </div>
                        <input
                            ref="fileInput"
                            type="file"
                            accept=".gcode,.g,.gc"
                            style="display: none"
                            @change="onFileSelected" />
                    </v-col>
                    <v-col cols="12" md="6">
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #0000FF; border-radius: 4px; padding: 12px;">
                            <p class="mb-2"><strong>Select Printers:</strong></p>
                            <div v-for="group in printerSelectionGroups" :key="group.key" class="mb-2">
                                <p
                                    v-if="group.label || hasNamedGroups"
                                    class="mb-1 font-weight-bold text-uppercase group-heading">
                                    {{ group.label || 'Ungrouped' }}
                                </p>
                                <v-checkbox
                                    v-for="item in group.items"
                                    :key="item.id"
                                    v-model="selectedPrinters"
                                    :value="item.id"
                                    :label="`${item.name} (${item.state})`"
                                    dense
                                    hide-details
                                    class="mt-1"></v-checkbox>
                            </div>
                            <v-checkbox
                                v-if="tableItems.length > 0"
                                v-model="selectAll"
                                label="Select All"
                                dense
                                hide-details
                                class="mt-3 font-weight-bold"
                                @change="toggleSelectAll"></v-checkbox>
                        </div>
                    </v-col>
                </v-row>
                <v-row class="mt-2">
                    <v-col>
                        <v-btn
                            color="primary"
                            large
                            :disabled="!selectedFile || selectedPrinters.length === 0"
                            :loading="isUploading"
                            @click="enqueueToSelectedPrinters()">
                            <v-icon left>mdi-send</v-icon>
                            Enqueue to {{ selectedPrinters.length }} Printer(s)
                        </v-btn>
                        <v-btn
                            text
                            class="ml-2"
                            @click="clearSelection">
                            Clear
                        </v-btn>
                        <v-btn
                            text
                            class="ml-2"
                            @click="toggleSelectionMode">
                            <v-icon left>{{ isSelectionMode ? mdiSelectOff : mdiCheckboxMultipleOutline }}</v-icon>
                            {{ isSelectionMode ? 'Exit Selection Mode' : 'Select Printers on Panels' }}
                        </v-btn>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>
        <v-slide-y-transition>
            <v-card v-if="isSelectionMode" class="mb-4 selection-summary">
                <v-card-text class="selection-summary__content">
                    <div class="selection-summary__info">
                        Selected Printers: <strong>{{ selectedPrinters.length }}</strong>
                    </div>
                    <div class="selection-summary__actions">
                        <v-btn
                            color="primary"
                            :disabled="selectedPrinters.length === 0"
                            @click="openMoveDialog">
                            <v-icon left>{{ mdiSwapHorizontal }}</v-icon>
                            Move to Group
                        </v-btn>
                        <v-btn text class="ml-2" @click="exitSelectionMode">
                            <v-icon left>{{ mdiSelectOff }}</v-icon>
                            Exit Selection Mode
                        </v-btn>
                    </div>
                </v-card-text>
            </v-card>
        </v-slide-y-transition>
        <v-dialog v-model="isMoveDialogOpen" max-width="460">
            <v-card>
                <v-card-title class="headline">
                    Move Selected Printers
                </v-card-title>
                <v-card-text>
                    <p class="mb-4">
                        Choose a target group for the {{ selectedPrinters.length }} selected printer(s).
                    </p>
                    <v-combobox
                        v-model="moveTargetGroup"
                        :items="groupOptions"
                        label="Target Group"
                        clearable
                        hide-details="auto"
                        placeholder="Ungrouped">
                    </v-combobox>
                    <p class="caption mt-2">
                        Enter a new name to create a group, or leave blank to move to Ungrouped.
                    </p>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeMoveDialog">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="selectedPrinters.length === 0"
                        :loading="isMoveProcessing"
                        @click="moveSelectedPrinters">
                        <v-icon left>{{ mdiSwapHorizontal }}</v-icon>
                        Move
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <!-- Printer Panels -->
        <v-expansion-panels multiple class="group-panels">
            <v-expansion-panel v-for="group in groupedPrinters" :key="group.key">
                <v-expansion-panel-header>
                    <div class="group-header-content">
                        <template v-if="isEditingGroup(group.key)">
                            <v-text-field
                                ref="groupNameInput"
                                v-model="editingLabel"
                                dense
                                single-line
                                hide-details
                                placeholder="Enter group name"
                                class="group-name-input"
                                @click.stop
                                @mousedown.stop
                                @keydown.stop
                                @keyup.enter.stop="saveGroupLabel(group)"
                                @keyup.esc.stop="cancelGroupEdit"
                                @blur="saveGroupLabel(group)"></v-text-field>
                            <div class="group-edit-actions">
                                <v-btn icon small @click.stop="saveGroupLabel(group)">
                                    <v-icon small>{{ mdiCheck }}</v-icon>
                                </v-btn>
                                <v-btn icon small @click.stop="cancelGroupEdit">
                                    <v-icon small>{{ mdiClose }}</v-icon>
                                </v-btn>
                            </div>
                        </template>
                        <template v-else>
                            <span class="group-title">{{ group.label || 'Ungrouped' }}</span>
                            <v-spacer></v-spacer>
                            <v-btn icon small @click.stop="startEditingGroup(group)">
                                <v-icon small>{{ mdiPencil }}</v-icon>
                            </v-btn>
                        </template>
                    </div>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <div
                        class="group-body"
                        :class="{ 'group-body--dragover': dragOverGroupKey === group.key }"
                        @dragover.prevent="handleDragOver(group, $event)"
                        @dragenter.prevent="handleDragEnter(group)"
                        @dragleave="handleDragLeave(group, $event)"
                        @drop.prevent="handleDrop(group, $event)">
                        <div class="group-body-heading">{{ group.label || 'Ungrouped' }}</div>
                        <div v-if="group.items.length > 0" class="group-panel-list">
                            <div
                                v-for="printerEntry in group.items"
                                :key="printerEntry.id"
                                class="group-panel-item"
                                :class="{
                                    'group-panel-item--dragging': draggedPrinterId === printerEntry.id,
                                    'group-panel-item--selection': isSelectionMode,
                                }"
                                :draggable="!isSelectionMode"
                                @dragstart="startDrag(printerEntry.id, group, $event)"
                                @dragend="endDrag"
                                @click="onPanelClick(printerEntry.id, $event)">
                                <div v-if="isSelectionMode" class="panel-selection" @click.stop>
                                    <v-checkbox
                                        v-model="selectedPrinters"
                                        :value="printerEntry.id"
                                        dense
                                        hide-details
                                        color="primary"
                                        @change.stop
                                        @click.stop></v-checkbox>
                                </div>
                                <farm-printer-panel :printer="printerEntry.printer"></farm-printer-panel>
                            </div>
                        </div>
                        <div v-else class="empty-group-placeholder">
                            No printers assigned to this group yet.
                        </div>
                    </div>
                </v-expansion-panel-content>
            </v-expansion-panel>
        </v-expansion-panels>
        <div class="add-group-btn-wrapper">
            <v-btn fab color="primary" class="add-group-btn" @click="addManualGroup">
                <v-icon>{{ mdiPlus }}</v-icon>
            </v-btn>
        </div>
    </div>
</template>


<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import FarmPrinterPanel from '@/components/panels/FarmPrinterPanel.vue'
import { EventBus, FARM_UPLOAD_DROP } from '@/plugins/eventBus'
import { FarmPrinterState } from '@/store/farm/printer/types'
import {
    mdiPlus,
    mdiPencil,
    mdiCheck,
    mdiClose,
    mdiCheckboxMultipleOutline,
    mdiSelectOff,
    mdiSwapHorizontal,
} from '@mdi/js'

interface PrinterTableItem {
    id: string
    name: string
    state: string
    job_name: string
    group: string | null
}

interface ManualGroup {
    id: string
    label: string
}

interface PrinterGroupDisplay {
    key: string
    label: string | null
    items: PrinterTableItem[]
    manualId?: string
    isManual: boolean
}

interface PrinterPanelGroupItem extends PrinterTableItem {
    printer: FarmPrinterState
}

interface PrinterPanelGroup extends Omit<PrinterGroupDisplay, 'items'> {
    items: PrinterPanelGroupItem[]
}

@Component({
    components: { FarmPrinterPanel },
})
class PageFarm extends Mixins(BaseMixin) {
    // File upload state
    public selectedFile: File | null = null
    public selectedPrinters: string[] = []
    public selectAll = false
    public isDragging = false
    public isUploading = false
    public thumbnailUrl: string | null = null
    public manualGroups: ManualGroup[] = []
    public editingGroupKey: string | null = null
    public editingLabel = ''
    private readonly manualGroupsStorageKey = 'farm.manualGroups'
    private isSavingGroup = false
    public isSelectionMode = false
    public isMoveDialogOpen = false
    public moveTargetGroup: string | null = 'Ungrouped'
    public isMoveProcessing = false
    public mdiPlus = mdiPlus
    public mdiPencil = mdiPencil
    public mdiCheck = mdiCheck
    public mdiClose = mdiClose
    public mdiCheckboxMultipleOutline = mdiCheckboxMultipleOutline
    public mdiSelectOff = mdiSelectOff
    public mdiSwapHorizontal = mdiSwapHorizontal
    public draggedPrinterId: string | null = null
    private dragSourceGroupKey: string | null = null
    public dragOverGroupKey: string | null = null
    @Watch('selectedPrinters', { deep: true })
    onSelectedPrintersChange(): void {
        this.syncSelectAll()
    }

    @Watch('tableItems', { deep: true })
    onTableItemsChange(): void {
        this.syncSelectAll()
    }
    // Handle files from the fullscreen drop overlay so we can route uploads to multiple printers.
    private farmDropListener = async (files: File[]) => {
        if (!Array.isArray(files) || files.length === 0) return

        const queue = files.filter((file): file is File => file instanceof File)
        if (queue.length === 0) return

        if (this.isUploading) {
            this.$toast.info('An upload is already in progress. Please wait to drop another file.')
            return
        }

        const hasSelection = Array.isArray(this.selectedPrinters) && this.selectedPrinters.length > 0

        if (!hasSelection) {
            await this.setSelectedFile(queue[0])
            this.$toast.info('Select the printers to target, then press Enqueue to upload.')
            return
        }

        for (const file of queue) {
            await this.setSelectedFile(file)
            await this.enqueueToSelectedPrinters(file)
        }
    }

    get printers(): Record<string, FarmPrinterState> {
        return this.$store.getters['farm/getPrinters']
    }

    get tableItems(): PrinterTableItem[] {
        const printersObj = this.printers
        const items: PrinterTableItem[] = Object.keys(printersObj).map((key) => {
            const printerState = printersObj[key] ?? {}
            const rawGroup = typeof printerState.settings?.group === 'string' ? printerState.settings.group : null
            const trimmedGroup = rawGroup?.trim() ?? ''
            const group = trimmedGroup.length > 0 ? trimmedGroup : null

            return {
                id: key,
                name: this.$store.getters['farm/getPrinterName'](key),
                state: this.$store.getters['farm/' + key + '/getStatus'],
                job_name: this.$store.getters['farm/' + key + '/getCurrentFilename'],
                group,
            }
        })

        return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    }

    get hasNamedGroups() {
        return this.tableItems.some((item) => item.group)
    }

    get printerSelectionGroups(): PrinterGroupDisplay[] {
        const groupsMap = new Map<string, PrinterTableItem[]>()
        const ungrouped: PrinterTableItem[] = []

        this.tableItems.forEach((item) => {
            if (item.group) {
                const list = groupsMap.get(item.group) ?? []
                list.push(item)
                groupsMap.set(item.group, list)
            } else {
                ungrouped.push(item)
            }
        })

        const results: PrinterGroupDisplay[] = []
        const consumedLabels = new Set<string>()

        this.manualGroups.forEach((manual) => {
            const label = manual.label
            const items = label ? groupsMap.get(label) ?? [] : []
            if (label) consumedLabels.add(label)
            results.push({
                key: this.getManualGroupKey(manual.id),
                label,
                items,
                manualId: manual.id,
                isManual: true,
            })
        })

        consumedLabels.forEach((label) => {
            groupsMap.delete(label)
        })

        const leftoverEntries = Array.from(groupsMap.entries()).sort((a, b) =>
            a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true })
        )

        leftoverEntries.forEach(([label, items]) => {
            results.push({
                key: `group-${label}`,
                label,
                items,
                isManual: false,
            })
        })

        if (ungrouped.length > 0) {
            const manualUngrouped = results.find((group) => group.label === null && group.isManual)
            if (manualUngrouped) {
                manualUngrouped.items = ungrouped
            } else {
                const existingUngrouped = results.find((group) => group.label === null)
                if (!existingUngrouped) {
                    results.push({
                        key: 'group-ungrouped',
                        label: null,
                        items: ungrouped,
                        isManual: false,
                    })
                }
            }
        }

        return results
    }

    get groupedPrinters(): PrinterPanelGroup[] {
        return this.printerSelectionGroups.map((group): PrinterPanelGroup => {
            const printerItems: PrinterPanelGroupItem[] = group.items
                .map((item) => {
                    const printer = this.printers[item.id]
                    if (!printer) return null
                    return {
                        ...item,
                        printer,
                    }
                })
                .filter((entry): entry is PrinterPanelGroupItem => entry !== null)

            return {
                key: group.key,
                label: group.label,
                items: printerItems,
                manualId: group.manualId,
                isManual: group.isManual,
            }
        })
    }

    get groupOptions(): string[] {
        const names = new Set<string>()

        this.printerSelectionGroups.forEach((group) => {
            if (group.label) names.add(group.label)
        })

        const sorted = Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

        return ['Ungrouped', ...sorted]
    }

    isEditingGroup(key: string): boolean {
        return this.editingGroupKey === key
    }

    get hasPrinterSelection() {
        return Array.isArray(this.selectedPrinters) && this.selectedPrinters.length > 0
    }

    // File handling methods
    async onFileDrop(event: DragEvent) {
        this.isDragging = false
        const files = event.dataTransfer?.files
        if (files && files.length > 0) {
            await this.setSelectedFile(files[0])
        }
    }

    async onFileSelected(event: Event) {
        const target = event.target as HTMLInputElement
        if (target.files && target.files.length > 0) {
            await this.setSelectedFile(target.files[0])
        }
    }

    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }

    toggleSelectAll() {
        if (this.selectAll) {
            this.selectedPrinters = this.tableItems.map((item) => item.id)
        } else {
            this.selectedPrinters = []
        }
    }

    toggleSelectionMode(): void {
        if (this.isSelectionMode) {
            this.exitSelectionMode()
        } else {
            this.isSelectionMode = true
        }
    }

    exitSelectionMode(): void {
        if (!this.isSelectionMode) return

        this.isSelectionMode = false
        this.closeMoveDialog()
        this.endDrag()
    }

    openMoveDialog(): void {
        if (this.selectedPrinters.length === 0) return

        this.isMoveDialogOpen = true
        const normalized = this.normalizeGroupInput(this.moveTargetGroup)
        this.moveTargetGroup = normalized ?? 'Ungrouped'
    }

    closeMoveDialog(): void {
        this.isMoveDialogOpen = false
    }

    onPanelClick(printerId: string, event: MouseEvent): void {
        if (!this.isSelectionMode) return

        event.stopPropagation()
        this.togglePrinterSelection(printerId)
    }

    private togglePrinterSelection(printerId: string): void {
        const exists = this.selectedPrinters.includes(printerId)
        this.selectedPrinters = exists
            ? this.selectedPrinters.filter((id) => id !== printerId)
            : [...this.selectedPrinters, printerId]
    }

    async moveSelectedPrinters(): Promise<void> {
        if (this.selectedPrinters.length === 0) return

        const normalizedTarget = this.normalizeGroupInput(this.moveTargetGroup)
        const targetLabel = normalizedTarget ?? null
        const existingGroups = new Set(this.groupOptions.map((option) => option.toLowerCase()))

        this.isMoveProcessing = true

        try {
            const promises = this.selectedPrinters.map((printerId) =>
                this.setPrinterGroup(printerId, targetLabel, { silent: true })
            )

            const results = await Promise.allSettled(promises)
            const failures = results.filter((result) => result.status === 'rejected')

            if (failures.length > 0) {
                this.$toast.error('One or more printers failed to move. Please try again.')
                return
            }

            if (normalizedTarget && !existingGroups.has(normalizedTarget.toLowerCase())) {
                this.ensureManualGroupExists(normalizedTarget)
            }

            this.$toast.success(
                targetLabel
                    ? `Moved ${this.selectedPrinters.length} printer(s) to "${targetLabel}"`
                    : `Moved ${this.selectedPrinters.length} printer(s) to Ungrouped`
            )

            this.closeMoveDialog()
        } catch (error) {
            console.error('Farm.vue: Failed to move printers', error)
            this.$toast.error('Failed to move printers.')
        } finally {
            this.isMoveProcessing = false
        }
    }

    private normalizeGroupInput(value: string | null): string | null {
        const trimmed = (value ?? '').trim()
        if (trimmed.length === 0) return null

        if (trimmed.toLowerCase() === 'ungrouped') return null

        return trimmed
    }

    private ensureManualGroupExists(label: string): void {
        const normalized = label.trim()
        if (normalized.length === 0) return

        const exists = this.manualGroups.some((group) => group.label.toLowerCase() === normalized.toLowerCase())
        if (exists) return

        const manualGroup: ManualGroup = {
            id: this.generateManualGroupId(),
            label: normalized,
        }

        this.manualGroups = [...this.manualGroups, manualGroup]
        this.saveManualGroups()
    }

    private syncSelectAll(): void {
        const tableEntries = this.tableItems
        const total = tableEntries.length

        if (total > 0) {
            const allowed = new Set(tableEntries.map((item) => item.id))
            const filtered = this.selectedPrinters.filter((id) => allowed.has(id))
            if (filtered.length !== this.selectedPrinters.length) {
                this.selectedPrinters = filtered
            }
        }

        if (total === 0) {
            this.selectAll = false
            return
        }

        const isAllSelected = this.selectedPrinters.length === total
        this.selectAll = isAllSelected
    }

    clearSelection() {
        this.clearSelectedFile()
        this.selectedPrinters = []
        this.selectAll = false
    }

    private clearSelectedFile() {
        this.selectedFile = null
        this.thumbnailUrl = null
        this.resetFileInput()
    }

    private async setSelectedFile(file: File) {
        this.selectedFile = file
        this.isDragging = false
        await this.loadGcodeThumbnail(file)
    }

    private resetFileInput() {
        const input = this.$refs.fileInput as HTMLInputElement | undefined
        if (input) input.value = ''
    }

    triggerFileDialog() {
        const input = this.$refs.fileInput as HTMLInputElement | undefined
        if (input) input.click()
    }

    private async loadGcodeThumbnail(file: File) {
        this.thumbnailUrl = null

        const name = file.name.toLowerCase()
        if (!/\.(gcode|g|gco|ufp|nc)$/.test(name)) return

        try {
            const maxBytes = 500000
            const blob = file.slice(0, maxBytes)
            const content = await blob.text()

            const beginRegex = /;\s*thumbnail\s+begin\s+(\d+)x(\d+)\s+(\d+)/i
            const endRegex = /;\s*thumbnail\s+end/i
            const beginMatch = beginRegex.exec(content)
            if (!beginMatch || beginMatch.index === undefined) return

            const afterBegin = content.slice(beginMatch.index + beginMatch[0].length)
            const lines = afterBegin.split(/\r?\n/)
            let base64 = ''
            for (const line of lines) {
                if (endRegex.test(line)) break

                const cleaned = line
                    .replace(/^;\s*/, '')
                    .replace(/\s+/g, '')
                    .trim()

                if (cleaned.length > 0) base64 += cleaned
            }

            if (base64) {
                this.thumbnailUrl = `data:image/png;base64,${base64}`
            }
        } catch (error) {
            console.error('Farm.vue: Failed to load GCode thumbnail', error)
        }
    }

    async enqueueToSelectedPrinters(fileOverride?: File) {
        const file = fileOverride ?? this.selectedFile

        if (!file) {
            this.$toast.error('Select a GCode file to upload.')
            return
        }

        if (this.selectedPrinters.length === 0) {
            this.$toast.error('Select at least one printer before uploading.')
            return
        }

        if (this.isUploading) {
            this.$toast.info('An upload is already in progress.')
            return
        }

    const succeeded: Array<{ id: string; name: string }> = []
    const failed: Array<{ id: string; name: string; error: unknown }> = []

        this.isUploading = true
        try {
            for (const printerId of this.selectedPrinters) {
                const printerName = this.$store.getters['farm/getPrinterName'](printerId) ?? printerId

                try {
                    const printer = this.printers[printerId]
                    if (!printer?.socket?.hostname || !printer?.socket?.port) {
                        throw new Error('Printer connection details unavailable')
                    }

                    console.log(`Uploading ${file.name} to printer ${printerId}`)

                    const formData = new FormData()
                    formData.append('file', file)
                    formData.append('root', 'gcodes')
                    formData.append('path', '')

                    const wsProtocol = printer.socket.protocol ?? 'ws'
                    const httpProtocol = wsProtocol === 'wss' ? 'https' : 'http'
                    const normPath = (printer.socket.path ?? '').replace(/(^\/+)|(\/+$)/g, '')
                    const basePath = normPath.length > 0 ? `/${normPath}` : ''
                    const url = `${httpProtocol}://${printer.socket.hostname}:${printer.socket.port}${basePath}/server/files/upload`

                    const response = await fetch(url, {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                    })

                    if (!response.ok) {
                        throw new Error(`Upload failed with status ${response.status}`)
                    }

                    succeeded.push({ id: printerId, name: printerName })
                    console.log(`Successfully uploaded to ${printerId}`)
                } catch (error) {
                    failed.push({ id: printerId, name: printerName, error })
                    console.error(`Farm.vue: Failed to upload to printer ${printerId}`, error)
                }
            }

            if (succeeded.length > 0) {
                const successMessage =
                    succeeded.length === 1
                        ? `File "${file.name}" queued to ${succeeded[0].name}`
                        : `File "${file.name}" queued to ${succeeded.length} printers`

                if (failed.length > 0) {
                    this.$toast.info(successMessage)
                } else {
                    this.$toast.success(successMessage)
                }
            }

            if (failed.length > 0) {
                const failureDetails = failed
                    .slice(0, 3)
                    .map((entry) => `${entry.name}: ${this.describeUploadError(entry.error)}`)
                    .join(', ')
                const suffix = failed.length > 3 ? `, +${failed.length - 3} more` : ''
                this.$toast.error(`Failed to upload "${file.name}" to ${failureDetails}${suffix}`)
            }
        } finally {
            this.isUploading = false
            if (failed.length === 0) {
                this.clearSelectedFile()
            }
        }
    }

    private describeUploadError(error: unknown): string {
        if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
            return error.message
        }

        if (error && typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
            const message = (error as Record<string, unknown>).message
            if (typeof message === 'string' && message.length > 0) return message
        }

        if (typeof error === 'string' && error.length > 0) {
            return error
        }

        return 'Unknown error'
    }

    mounted() {
        this.loadManualGroups()
        EventBus.$on(FARM_UPLOAD_DROP, this.farmDropListener)
    }

    beforeDestroy() {
        EventBus.$off(FARM_UPLOAD_DROP, this.farmDropListener)
    }

    addManualGroup(): void {
        const id = this.generateManualGroupId()
        const label = this.getUniqueGroupLabel('New Group')
        const newGroup: ManualGroup = {
            id,
            label,
        }

        this.manualGroups = [...this.manualGroups, newGroup]
        this.saveManualGroups()

        this.$nextTick(() => {
            const group = this.groupedPrinters.find((entry) => entry.manualId === id)
            if (group) {
                this.startEditingGroup(group)
            }
        })
    }

    startEditingGroup(group: PrinterPanelGroup): void {
        this.editingGroupKey = group.key
        this.editingLabel = group.label ?? ''
        this.focusEditingInput()
    }

    cancelGroupEdit(): void {
        this.editingGroupKey = null
        this.editingLabel = ''
    }

    async saveGroupLabel(group: PrinterPanelGroup): Promise<void> {
        if (this.editingGroupKey !== group.key || this.isSavingGroup) return

        const trimmed = this.editingLabel.trim()
        if (trimmed.length === 0) {
            this.$toast.error('Group name cannot be empty.')
            return
        }

        if (group.label === trimmed) {
            this.cancelGroupEdit()
            return
        }

        if (this.groupLabelExists(trimmed, group.key)) {
            this.$toast.error('A group with that name already exists.')
            return
        }

        this.isSavingGroup = true

        try {
            await this.applyGroupLabel(group, trimmed)
            this.$toast.success(`Group renamed to "${trimmed}"`)
            this.cancelGroupEdit()
        } catch (error) {
            console.error('Farm.vue: Failed to rename group', error)
            this.$toast.error('Failed to rename group')
        } finally {
            this.isSavingGroup = false
        }
    }

    private focusEditingInput(): void {
        this.$nextTick(() => {
            const refs = this.$refs.groupNameInput as any
            if (!refs) return

            const refArray = Array.isArray(refs) ? refs : [refs]
            const inputComponent = refArray[refArray.length - 1]
            const inputElement = inputComponent?.$el?.querySelector('input') as HTMLInputElement | undefined
            if (inputElement) {
                inputElement.focus()
                inputElement.select()
            }
        })
    }

    private async applyGroupLabel(group: PrinterPanelGroup, newLabel: string): Promise<void> {
        const originalLabel = group.label ?? ''
        await this.renameGroupPrinters(group, newLabel, originalLabel)

        if (group.manualId) {
            this.updateManualGroupLabel(group.manualId, newLabel)
        }

        this.saveManualGroups()
    }

    private async renameGroupPrinters(group: PrinterPanelGroup, newLabel: string, originalLabel: string): Promise<void> {
        if (group.items.length === 0) return

        const updatedIds: string[] = []
        try {
            for (const item of group.items) {
                await this.$store.dispatch('gui/remoteprinters/updateSettings', {
                    id: item.id,
                    values: { group: newLabel },
                })
                updatedIds.push(item.id)
            }
        } catch (error) {
            for (const id of updatedIds) {
                await this.$store.dispatch('gui/remoteprinters/updateSettings', {
                    id,
                    values: { group: originalLabel },
                })
            }
            throw error
        }
    }

    private updateManualGroupLabel(manualId: string, newLabel: string): void {
        const index = this.manualGroups.findIndex((group) => group.id === manualId)
        if (index === -1) return

        const updated: ManualGroup = {
            ...this.manualGroups[index],
            label: newLabel,
        }

        this.manualGroups.splice(index, 1, updated)
    }

    private loadManualGroups(): void {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return

        try {
            const raw = localStorage.getItem(this.manualGroupsStorageKey)
            if (!raw) return

            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) return

            const sanitized: ManualGroup[] = []
            const seen = new Set<string>()
            parsed.forEach((item) => {
                if (typeof item?.id === 'string' && typeof item?.label === 'string') {
                    const label = item.label.trim()
                    const lower = label.toLowerCase()
                    if (label.length > 0 && !seen.has(lower)) {
                        sanitized.push({ id: item.id, label })
                        seen.add(lower)
                    }
                }
            })

            this.manualGroups = sanitized

            if (sanitized.length !== parsed.length) {
                this.saveManualGroups()
            }
        } catch (error) {
            console.error('Farm.vue: Failed to load manual groups', error)
        }
    }

    private saveManualGroups(): void {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return

        try {
            localStorage.setItem(this.manualGroupsStorageKey, JSON.stringify(this.manualGroups))
        } catch (error) {
            console.error('Farm.vue: Failed to save manual groups', error)
        }
    }

    private generateManualGroupId(): string {
        return `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }

    private getManualGroupKey(id: string): string {
        return `manual-${id}`
    }

    private groupLabelExists(label: string, skipKey: string | null): boolean {
        const target = label.trim().toLowerCase()
        if (target.length === 0) return false

        const manualConflict = this.manualGroups.some((group) => {
            const key = this.getManualGroupKey(group.id)
            return key !== skipKey && group.label.trim().toLowerCase() === target
        })

        if (manualConflict) return true

        return this.printerSelectionGroups.some(
            (group) => group.key !== skipKey && group.label !== null && group.label.trim().toLowerCase() === target
        )
    }

    private getUniqueGroupLabel(baseLabel: string): string {
        let attempt = baseLabel
        let counter = 1

        while (this.groupLabelExists(attempt, null)) {
            counter += 1
            attempt = `${baseLabel} ${counter}`
        }

        return attempt
    }

    startDrag(printerId: string, group: PrinterPanelGroup, event: DragEvent): void {
        if (this.isSelectionMode) {
            event.preventDefault()
            return
        }

        if (this.editingGroupKey !== null) this.cancelGroupEdit()

        this.draggedPrinterId = printerId
        this.dragSourceGroupKey = group.key

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', printerId)
        }
    }

    endDrag(): void {
        this.draggedPrinterId = null
        this.dragSourceGroupKey = null
        this.dragOverGroupKey = null
    }

    handleDragEnter(group: PrinterPanelGroup): void {
        if (!this.draggedPrinterId) return
        this.dragOverGroupKey = group.key
    }

    handleDragOver(_group: PrinterPanelGroup, event: DragEvent): void {
        if (!this.draggedPrinterId) return
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }

    handleDragLeave(group: PrinterPanelGroup, event: DragEvent): void {
        if (!this.draggedPrinterId) return

        const currentTarget = event.currentTarget as HTMLElement | null
        const relatedTarget = event.relatedTarget as HTMLElement | null

        if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return

        if (this.dragOverGroupKey === group.key) this.dragOverGroupKey = null
    }

    async handleDrop(group: PrinterPanelGroup, event: DragEvent): Promise<void> {
        if (!this.draggedPrinterId) return

        const printerId = this.draggedPrinterId
        const sourceKey = this.dragSourceGroupKey
        const targetKey = group.key

        this.dragOverGroupKey = null
        event.stopPropagation()

        if (sourceKey === targetKey) {
            this.endDrag()
            return
        }

        const newLabel = group.label ?? null

        try {
            await this.setPrinterGroup(printerId, newLabel)
        } finally {
            this.endDrag()
        }
    }

    private async setPrinterGroup(
        printerId: string,
        groupLabel: string | null,
        options: { silent?: boolean } = {}
    ): Promise<void> {
        const { silent = false } = options
        const printerName = this.$store.getters['farm/getPrinterName'](printerId)
        const targetGroupName = this.getGroupDisplayName(groupLabel)

        try {
            await this.$store.dispatch('gui/remoteprinters/updateSettings', {
                id: printerId,
                values: { group: groupLabel ?? '' },
            })
            if (!silent) {
                this.$toast.success(`${printerName} moved to ${targetGroupName}`)
            }
        } catch (error) {
            console.error('Farm.vue: Failed to move printer between groups', error)
            this.$toast.error(`Failed to move ${printerName} to ${targetGroupName}`)
            throw error
        }
    }

    private getGroupDisplayName(groupLabel: string | null): string {
        const trimmed = groupLabel?.trim()
        return trimmed && trimmed.length > 0 ? trimmed : 'Ungrouped'
    }
}

export default PageFarm
</script>

<style scoped>
.drop-zone-preview {
    display: flex;
    justify-content: center;
    margin-top: 16px;
}

.drop-zone-preview img {
    max-width: 100%;
    border-radius: 6px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.group-heading {
    letter-spacing: 0.08em;
}

.group-panels {
    margin-top: 24px;
}

.group-header-content {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 8px;
}

.group-title {
    font-weight: 600;
    font-size: 1rem;
}

.group-name-input {
    flex: 1;
}

.group-edit-actions {
    display: flex;
    gap: 4px;
}

.group-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    overflow-x: hidden;
    padding: 12px;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: border 0.2s ease, background-color 0.2s ease;
}

.group-body--dragover {
    border-color: rgba(0, 123, 255, 0.5);
    background-color: rgba(0, 123, 255, 0.08);
}

.group-body-heading {
    font-weight: 600;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.7);
}

.group-panel-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
}


.group-panel-item {
    width: 100%;
    display: flex;
    align-items: stretch;
    cursor: grab;
    user-select: none;
}

.group-panel-item ::v-deep .panel {
    width: 100%;
    height: 100%;
}

.group-panel-item--dragging {
    opacity: 0.6;
    cursor: grabbing;
}

.empty-group-placeholder {
    padding: 16px;
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
}

.add-group-btn-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
}

.add-group-btn {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}
</style>
