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

        <!-- Recipies Section -->
        <v-row class="mb-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-source-branch</v-icon>
                        Gcode Recipies
                    </v-card-title>
                    <v-card-text>
                        <input
                            ref="recipeGcodeInput"
                            type="file"
                            multiple
                            accept=".gcode,.g,.gc,.gco"
                            style="display: none"
                            @change="onRecipeGcodeFilesSelected"
                        />
                        <v-row>
                            <v-col cols="12" md="8">
                                <v-treeview
                                    :items="recipeTreeItems"
                                    item-key="id"
                                    item-text="name"
                                    open-on-click
                                    activatable
                                    dense
                                    hoverable
                                    :open.sync="recipeOpen"
                                    :active.sync="recipeActive"
                                >
                                    <template #prepend="{ item }">
                                        <v-icon small :color="item.isAddAction ? 'success' : item.children && item.children.length ? 'primary' : 'secondary'">
                                            {{ item.isAddAction ? 'mdi-plus-circle-outline' : item.children && item.children.length ? 'mdi-package-variant' : 'mdi-cube-outline' }}
                                        </v-icon>
                                    </template>
                                </v-treeview>
                                <div v-if="!recipes.length" class="text-body-2 grey--text">
                                    No recipes yet. Add a product to get started.
                                </div>
                            </v-col>

                            <v-col cols="12" md="4">
                                <v-text-field
                                    v-model="newRecipeProductName"
                                    label="New Product"
                                    placeholder="e.g., Modovolo Lift Quad Copter"
                                    outlined
                                    dense
                                    prepend-icon="mdi-package-variant"
                                    @keyup.enter="addRecipeProduct"
                                ></v-text-field>
                                <v-btn
                                    color="primary"
                                    block
                                    :disabled="!newRecipeProductName.trim()"
                                    @click="addRecipeProduct"
                                >
                                    <v-icon left small>mdi-plus</v-icon>
                                    Add Product
                                </v-btn>

                                <v-divider class="my-4"></v-divider>

                                <v-select
                                    v-model="recipeAddMode"
                                    :items="recipeAddModeOptions"
                                    item-text="text"
                                    item-value="value"
                                    label="Add Type"
                                    outlined
                                    dense
                                    prepend-icon="mdi-tune-variant"
                                    :disabled="selectedRecipeTargetParentId === undefined || recipeUploading"
                                ></v-select>

                                <v-text-field
                                    v-if="recipeAddMode === 'item'"
                                    v-model="newRecipePartName"
                                    :label="selectedRecipeTargetLabel"
                                    placeholder="e.g., Control Box"
                                    outlined
                                    dense
                                    prepend-icon="mdi-cube-outline"
                                    :disabled="selectedRecipeTargetParentId === undefined"
                                    @keyup.enter="addRecipePart"
                                ></v-text-field>

                                <div v-else>
                                    <v-btn
                                        outlined
                                        block
                                        color="secondary"
                                        :disabled="selectedRecipeTargetParentId === undefined || recipeUploading"
                                        @click="openRecipeGcodePicker"
                                    >
                                        <v-icon left small>mdi-file-upload</v-icon>
                                        Select G-Code Files
                                    </v-btn>
                                    <div v-if="recipeGcodeFiles.length" class="mt-2 mb-2">
                                        <v-chip
                                            v-for="(file, index) in recipeGcodeFiles"
                                            :key="`recipe-upload-${index}`"
                                            small
                                            class="mr-1 mb-1"
                                            close
                                            @click:close="removeRecipeGcodeFile(index)"
                                        >
                                            <v-icon left x-small>mdi-file-document</v-icon>
                                            {{ file.name }}
                                        </v-chip>
                                    </div>
                                </div>

                                <v-btn
                                    color="secondary"
                                    block
                                    :disabled="!canAddRecipePart"
                                    :loading="recipeUploading"
                                    @click="addRecipePart"
                                >
                                    <v-icon left small>mdi-plus</v-icon>
                                    {{ recipeAddMode === 'item' ? 'Add Part' : 'Upload G-Code' }}
                                </v-btn>

                                <v-btn
                                    class="mt-2"
                                    text
                                    color="error"
                                    block
                                    :disabled="!canRemoveSelectedRecipeNode"
                                    @click="removeSelectedRecipeNode"
                                >
                                    <v-icon left small>mdi-delete</v-icon>
                                    Remove Selected
                                </v-btn>

                                <div class="text-caption grey--text mt-3">
                                    Select a product/part to add under it, or select a + node to add at that level.
                                </div>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Featured Files Grid -->
        <v-row v-if="groupedFeaturedParts.length > 0">
            <v-col cols="12">
                <h2 class="text-h5 mb-4">
                    <v-icon class="mr-2">mdi-star</v-icon>
                    Featured Parts
                </h2>
            </v-col>
             <v-col v-for="group in groupedFeaturedParts" :key="group.category" cols="12" sm="6" md="4">
                <v-card elevation="3" class="part-tile" hover>
                    <div class="thumbnail-container">
                        <v-img
                            :src="getCategoryThumbnail(group.category)"
                            height="180"
                            class="part-thumbnail"
                            gradient="to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.7) 100%"
                        >
                            <template #placeholder>
                                <v-row class="fill-height ma-0" align="center" justify="center">
                                    <v-icon size="64" color="grey lighten-1">{{ getCategoryIcon(group.category) }}</v-icon>
                                </v-row>
                            </template>
                            <div class="version-badge">
                                <v-chip small color="primary" class="ma-2">
                                    v{{ group.latestVersion }}
                                </v-chip>
                            </div>
                        </v-img>
                    </div>
                    <v-card-title class="pb-2 pt-3">
                        <v-icon class="mr-2" color="blue">mdi-package-variant</v-icon>
                        {{ getCategoryDisplayName(group.category) }}
                    </v-card-title>
                    <v-card-subtitle class="pb-3 px-4">
                        {{ group.files.length }} file{{ group.files.length !== 1 ? 's' : '' }} in this part set
                    </v-card-subtitle>
                    <v-divider></v-divider>
                    
                    <!-- Files Table -->
                    <v-simple-table dense class="files-table clickable-table">
                        <template #default>
                            <thead>
                                <tr>
                                    <th class="text-left px-4">File</th>
                                    <th class="text-right px-4">Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr 
                                    v-for="file in group.files" 
                                    :key="file.id"
                                    class="clickable-row"
                                    @click="openFileActionsDialog(file)"
                                >
                                    <td class="px-4 py-2">
                                        <div class="d-flex align-center">
                                            <v-icon small class="mr-2" color="primary">mdi-file-document</v-icon>
                                            <div>
                                                <div class="file-name text-truncate" style="max-width: 180px;">{{ file.name }}</div>
                                                <div v-if="file.printTime" class="text-caption grey--text">
                                                    <v-icon x-small class="mr-1">mdi-clock-outline</v-icon>
                                                    {{ file.printTime }}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="text-right px-4 py-2 text-caption">{{ formatFileSize(file.size) }}</td>
                                </tr>
                            </tbody>
                        </template>
                    </v-simple-table>
                    
                    <v-divider></v-divider>
                    <v-card-actions class="px-4 py-3">
                        <v-btn text color="primary" small @click="sendAllToPrinter(group)">
                            <v-icon left small>mdi-send-check</v-icon>
                            Send All
                        </v-btn>
                        <v-spacer></v-spacer>
                        <span class="text-caption grey--text">
                            Updated {{ formatUploadDate(group.latestUpload) }}
                        </span>
                    </v-card-actions>
                </v-card>
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
                        <input
                            ref="fileInput"
                            type="file"
                            multiple
                            accept=".gcode,.g,.gc,.gco"
                            style="display: none"
                            @change="onFilesSelected"
                        />
                        
                        <!-- File Selection -->
                        <div class="d-flex align-center flex-wrap gap-2 mb-4">
                            <v-btn
                                color="secondary"
                                outlined
                                :disabled="uploading"
                                @click="$refs.fileInput.click()"
                            >
                                <v-icon left>mdi-file-document-multiple</v-icon>
                                Select Files
                            </v-btn>
                        </div>
                        
                        <div v-if="selectedFiles.length" class="mb-4">
                            <v-chip
                                v-for="(file, index) in selectedFiles"
                                :key="index"
                                class="mr-2 mb-2"
                                close
                                @click:close="removeFile(index)"
                            >
                                <v-icon left small>mdi-file-document</v-icon>
                                {{ file.name }} ({{ formatFileSize(file.size) }})
                            </v-chip>
                        </div>
                        
                        <!-- Metadata Fields -->
                        <v-row v-if="selectedFiles.length">
                            <v-col cols="12" sm="4">
                                <v-text-field
                                    v-model="uploadVersion"
                                    label="Version"
                                    placeholder="e.g., 1.0, 2.1, 3.2"
                                    outlined
                                    dense
                                    prepend-icon="mdi-tag"
                                    hint="Version number for this file"
                                    persistent-hint
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="4">
                                <v-combobox
                                    v-model="uploadCategory"
                                    :items="categoryOptions"
                                    item-text="text"
                                    item-value="value"
                                    label="Part Category (Optional)"
                                    outlined
                                    dense
                                    clearable
                                    prepend-icon="mdi-shape"
                                    hint="Select existing or type to create new"
                                    persistent-hint
                                    :return-object="false"
                                ></v-combobox>
                            </v-col>
                            <v-col cols="12" sm="4">
                                <v-text-field
                                    v-model="uploadPrintTime"
                                    label="Estimated Print Time (Optional)"
                                    placeholder="e.g., 2h 30m"
                                    outlined
                                    dense
                                    prepend-icon="mdi-clock-outline"
                                    hint="Displayed on featured parts"
                                    persistent-hint
                                ></v-text-field>
                            </v-col>
                        </v-row>
                        
                        <!-- Upload Button & Progress -->
                        <div v-if="selectedFiles.length" class="mt-4">
                            <v-btn
                                color="primary"
                                :disabled="!selectedFiles.length || uploading"
                                :loading="uploading"
                                @click="uploadFiles"
                            >
                                <v-icon left>mdi-upload</v-icon>
                                Upload to Repository
                            </v-btn>
                            
                            <!-- Upload Progress Bar -->
                            <div v-if="uploading" class="mt-4">
                                <div class="d-flex align-center mb-2">
                                    <v-icon small class="mr-2" color="primary">mdi-cloud-upload</v-icon>
                                    <span class="text-body-2">Uploading...</span>
                                    <v-spacer></v-spacer>
                                    <span class="text-body-2 font-weight-medium">{{ uploadProgress }}%</span>
                                </div>
                                <v-progress-linear
                                    :value="uploadProgress"
                                    color="primary"
                                    height="8"
                                    rounded
                                    striped
                                    :indeterminate="uploadProgress === 0"
                                ></v-progress-linear>
                                <div class="text-caption grey--text mt-1">
                                    {{ getUploadStatusText() }}
                                </div>
                            </div>
                        </div>
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
                        <v-btn color="primary" small class="ml-2" @click="openCreateDirectoryDialog">
                            <v-icon left small>mdi-folder-plus</v-icon>
                            New Folder
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
                        class="files-table clickable-table"
                        @click:row="openFileActionsDialog"
                    >
                        <template #item.name="{ item }">
                            <div class="d-flex align-center">
                                <v-icon class="mr-2" color="primary">mdi-file-document</v-icon>
                                {{ item.name }}
                            </div>
                        </template>

                        <template #item.version="{ item }">
                            <v-chip small color="primary" outlined>
                                v{{ item.version || '1.0' }}
                            </v-chip>
                        </template>

                        <template #item.category="{ item }">
                            <v-chip v-if="item.category" small color="secondary" outlined>
                                <v-icon left x-small>{{ getCategoryIcon(item.category) }}</v-icon>
                                {{ formatCategory(item.category) }}
                            </v-chip>
                            <span v-else class="grey--text">—</span>
                        </template>

                        <template #item.size="{ item }">
                            {{ formatFileSize(item.size) }}
                        </template>

                        <template #item.uploadedAt="{ item }">
                            {{ formatUploadDate(item.uploadedAt) }}
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

        <!-- File Actions Dialog -->
        <v-dialog v-model="fileActionsDialog" max-width="450">
            <v-card v-if="selectedFile">
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-file-document</v-icon>
                    File Actions
                </v-card-title>
                <v-card-text class="pa-0">
                    <v-list class="py-0">
                        <v-list-item class="px-6 py-3">
                            <v-list-item-content>
                                <v-list-item-title class="text-h6">{{ selectedFile.name }}</v-list-item-title>
                                <v-list-item-subtitle class="mt-1">
                                    {{ formatFileSize(selectedFile.size) }}
                                    <span v-if="selectedFile.version"> · v{{ selectedFile.version }}</span>
                                    <span v-if="selectedFile.category"> · {{ getCategoryDisplayName(selectedFile.category) }}</span>
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                        <v-divider></v-divider>
                        <v-list-item 
                            class="action-item" 
                            @click="handleSendToPrinter"
                        >
                            <v-list-item-icon>
                                <v-icon color="primary">mdi-printer-3d</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title>Send to Printer</v-list-item-title>
                                <v-list-item-subtitle>Transfer file to a connected printer</v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action>
                                <v-icon>mdi-chevron-right</v-icon>
                            </v-list-item-action>
                        </v-list-item>
                        <v-divider inset></v-divider>
                        <v-list-item 
                            class="action-item" 
                            @click="handleDownloadFile"
                        >
                            <v-list-item-icon>
                                <v-icon color="info">mdi-download</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title>Download</v-list-item-title>
                                <v-list-item-subtitle>Save file to your computer</v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action>
                                <v-icon>mdi-chevron-right</v-icon>
                            </v-list-item-action>
                        </v-list-item>
                        <v-divider inset></v-divider>
                        <v-list-item 
                            class="action-item" 
                            @click="handleDeleteFile"
                        >
                            <v-list-item-icon>
                                <v-icon color="error">mdi-delete</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title class="error--text">Delete File</v-list-item-title>
                                <v-list-item-subtitle>Permanently remove from repository</v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action>
                                <v-icon>mdi-chevron-right</v-icon>
                            </v-list-item-action>
                        </v-list-item>
                    </v-list>
                </v-card-text>
                <v-card-actions class="px-4 py-3">
                    <v-spacer></v-spacer>
                    <v-btn text @click="fileActionsDialog = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Create Directory Dialog -->
        <v-dialog v-model="createDirectoryDialog" max-width="450">
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-folder-plus</v-icon>
                    Create New Directory
                </v-card-title>
                <v-card-text class="pa-6">
                    <v-text-field
                        v-model="newDirectoryName"
                        label="Directory Name"
                        placeholder="Enter directory name"
                        outlined
                        autofocus
                        prepend-icon="mdi-folder"
                        :rules="directoryNameRules"
                        @keyup.enter="createDirectory"
                    ></v-text-field>
                    <div class="text-caption grey--text mt-2">
                        Directory will be created in the repository root.
                    </div>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="createDirectoryDialog = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!isValidDirectoryName"
                        :loading="creatingDirectory"
                        @click="createDirectory"
                    >
                        <v-icon left>mdi-folder-plus</v-icon>
                        Create
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
    version?: string
    category?: string
    printTime?: string
    featured?: boolean
}

interface Printer {
    printerId: string
    name: string
    isActive: boolean
}

interface RecipeNode {
    id: number
    name: string
    children: RecipeNode[]
}

interface RecipeTreeNode {
    id: number | string
    name: string
    children?: RecipeTreeNode[]
    isAddAction?: boolean
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
    uploadProgress = 0
    sending = false
    deleting = false

    // Upload metadata
    uploadVersion = '1.0'
    uploadCategory: string | null = null
    uploadPrintTime = ''

    // Directory creation
    createDirectoryDialog = false
    newDirectoryName = ''
    creatingDirectory = false

    // Recipies tree data
    recipes: RecipeNode[] = []
    recipeOpen: Array<number | string> = []
    recipeActive: Array<number | string> = []
    recipeNextId = 1
    newRecipeProductName = ''
    newRecipePartName = ''
    recipeAddMode: 'item' | 'gcode' = 'item'
    recipeGcodeFiles: File[] = []
    recipeUploading = false

    recipeAddModeOptions = [
        { text: 'List Item', value: 'item' },
        { text: 'G-Code File', value: 'gcode' },
    ]

    // Category options for dropdown - base options
    baseCategoryOptions = [
        { text: 'Propeller', value: 'propeller' },
        { text: 'Truss', value: 'truss' },
        { text: 'Control Box', value: 'control-box' },
    ]

    // Computed category options that include existing categories from files
    get categoryOptions(): { text: string; value: string }[] {
        const options = [...this.baseCategoryOptions]
        const existingValues = new Set(options.map(o => o.value))
        
        // Add categories from existing files
        for (const file of this.files) {
            if (file.category && !existingValues.has(file.category)) {
                existingValues.add(file.category)
                options.push({
                    text: this.formatCategoryName(file.category),
                    value: file.category
                })
            }
        }
        
        return options.sort((a, b) => a.text.localeCompare(b.text))
    }

    formatCategoryName(category: string): string {
        // Convert kebab-case or snake_case to Title Case
        return category
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase())
    }

    // Featured parts data - loaded from API
    featuredParts: RepositoryFile[] = []

    // Dialogs
    sendDialog = false
    deleteDialog = false
    fileActionsDialog = false
    selectedFile: RepositoryFile | null = null
    selectedPrinter: string | null = null

    // Directory name validation rules
    directoryNameRules = [
        (v: string) => !!v || 'Directory name is required',
        (v: string) => (v && v.length >= 1) || 'Directory name must be at least 1 character',
        (v: string) => (v && v.length <= 255) || 'Directory name must be less than 255 characters',
        (v: string) => /^[^<>:"/\\|?*]+$/.test(v) || 'Directory name contains invalid characters',
    ]

    get isValidDirectoryName(): boolean {
        const name = this.newDirectoryName.trim()
        if (!name || name.length === 0 || name.length > 255) return false
        return /^[^<>:"/\\|?*]+$/.test(name)
    }

    // Snackbar
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    headers = [
        { text: 'Name', value: 'name', sortable: true },
        { text: 'Version', value: 'version', sortable: true },
        { text: 'Category', value: 'category', sortable: true },
        { text: 'Size', value: 'size', sortable: true },
        { text: 'Uploaded', value: 'uploadedAt', sortable: true },
        { text: 'Uploaded By', value: 'uploadedBy', sortable: true },
    ]

    get filteredFiles(): RepositoryFile[] {
        if (!this.search) return this.files
        const searchLower = this.search.toLowerCase()
        return this.files.filter((f) => f.name.toLowerCase().includes(searchLower))
    }

    get groupedFeaturedParts(): { category: string; files: RepositoryFile[]; latestVersion: string; latestUpload: string }[] {
        // Group featured parts by category
        const groups: Record<string, RepositoryFile[]> = {}
        
        for (const part of this.featuredParts) {
            const category = part.category || 'uncategorized'
            if (!groups[category]) {
                groups[category] = []
            }
            groups[category].push(part)
        }
        
        // Convert to array with metadata
        return Object.entries(groups).map(([category, files]) => {
            // Sort files by name for consistent display
            files.sort((a, b) => a.name.localeCompare(b.name))
            
            // Get the latest version from all files in this category
            const versions = files.map(f => f.version || '1.0')
            const latestVersion = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
            
            // Get the most recent upload date
            const dates = files.map(f => f.uploadedAt).sort().reverse()
            const latestUpload = dates[0]
            
            return {
                category,
                files,
                latestVersion,
                latestUpload
            }
        })
    }

    mounted() {
        this.loadRecipes()
        this.refreshFiles()
        this.loadPrinters()
        this.loadFeaturedParts()
    }

    get recipeTreeItems(): RecipeTreeNode[] {
        return this.buildRecipeTree(this.recipes, null)
    }

    get selectedRecipeNode(): RecipeNode | null {
        if (!this.recipeActive.length) return null
        const activeId = this.recipeActive[0]
        if (typeof activeId === 'string' && activeId.startsWith('add:')) {
            return null
        }
        const nodeId = typeof activeId === 'number' ? activeId : Number(activeId)
        if (Number.isNaN(nodeId)) return null
        return this.findRecipeNodeById(this.recipes, nodeId)
    }

    get selectedRecipeTargetParentId(): number | null | undefined {
        if (!this.recipeActive.length) return undefined
        const activeId = this.recipeActive[0]

        if (typeof activeId === 'string' && activeId.startsWith('add:')) {
            const parentSegment = activeId.replace('add:', '')
            if (parentSegment === 'root') return null
            const parsedParent = Number(parentSegment)
            return Number.isNaN(parsedParent) ? undefined : parsedParent
        }

        if (typeof activeId === 'number') {
            return activeId
        }

        const parsed = Number(activeId)
        return Number.isNaN(parsed) ? undefined : parsed
    }

    get selectedRecipeTargetLabel(): string {
        const parentId = this.selectedRecipeTargetParentId
        if (parentId === undefined) return 'Select a node in the tree'
        if (parentId === null) {
            return this.recipeAddMode === 'item' ? 'Add item at root level' : 'Upload G-Code to root level'
        }
        const node = this.findRecipeNodeById(this.recipes, parentId)
        if (!node) return 'Select a node in the tree'
        return this.recipeAddMode === 'item' ? `Part for ${node.name}` : `Upload G-Code under ${node.name}`
    }

    get canAddRecipePart(): boolean {
        if (this.selectedRecipeTargetParentId === undefined || this.recipeUploading) return false
        if (this.recipeAddMode === 'item') {
            return !!this.newRecipePartName.trim()
        }
        return this.recipeGcodeFiles.length > 0
    }

    get canRemoveSelectedRecipeNode(): boolean {
        if (!this.recipeActive.length) return false
        const activeId = this.recipeActive[0]
        return !(typeof activeId === 'string' && activeId.startsWith('add:'))
    }

    get defaultRecipes(): RecipeNode[] {
        return [
            {
                id: 1,
                name: 'Modovolo Lift Quad Copter',
                children: [
                    { id: 2, name: 'Control Box', children: [] },
                    { id: 3, name: 'Air Frame', children: [] },
                    { id: 4, name: '...', children: [] },
                ],
            },
        ]
    }

    loadRecipes() {
        const storageKey = 'central_files_recipies_v1'
        const stored = localStorage.getItem(storageKey)

        if (stored) {
            try {
                const parsed = JSON.parse(stored) as RecipeNode[]
                if (Array.isArray(parsed)) {
                    this.recipes = this.normalizeRecipeNodes(parsed)
                }
            } catch (error) {
                console.error('Error loading recipies:', error)
            }
        }

        if (!this.recipes.length) {
            this.recipes = JSON.parse(JSON.stringify(this.defaultRecipes))
            this.saveRecipes()
        }

        const maxId = this.getMaxRecipeId(this.recipes)
        this.recipeNextId = maxId + 1
        this.recipeOpen = this.recipes.map((recipe) => recipe.id)
    }

    normalizeRecipeNodes(nodes: RecipeNode[]): RecipeNode[] {
        return nodes.map((node) => ({
            id: node.id,
            name: node.name,
            children: this.normalizeRecipeNodes(node.children || []),
        }))
    }

    saveRecipes() {
        const storageKey = 'central_files_recipies_v1'
        localStorage.setItem(storageKey, JSON.stringify(this.recipes))
    }

    getMaxRecipeId(nodes: RecipeNode[]): number {
        let maxId = 0
        for (const node of nodes) {
            maxId = Math.max(maxId, node.id)
            if (node.children.length) {
                maxId = Math.max(maxId, this.getMaxRecipeId(node.children))
            }
        }
        return maxId
    }

    getNextRecipeId(): number {
        const id = this.recipeNextId
        this.recipeNextId += 1
        return id
    }

    findRecipeNodeById(nodes: RecipeNode[], id: number): RecipeNode | null {
        for (const node of nodes) {
            if (node.id === id) {
                return node
            }
            if (node.children.length) {
                const found = this.findRecipeNodeById(node.children, id)
                if (found) return found
            }
        }
        return null
    }

    buildRecipeTree(nodes: RecipeNode[], parentId: number | null): RecipeTreeNode[] {
        const treeNodes: RecipeTreeNode[] = nodes.map((node) => ({
            id: node.id,
            name: node.name,
            children: this.buildRecipeTree(node.children, node.id),
        }))

        treeNodes.push({
            id: this.getAddNodeId(parentId),
            name: this.getAddNodeLabel(parentId),
            isAddAction: true,
        })

        return treeNodes
    }

    getAddNodeId(parentId: number | null): string {
        return `add:${parentId === null ? 'root' : parentId}`
    }

    getAddNodeLabel(parentId: number | null): string {
        return parentId === null ? '+ Add Product' : '+ Add Part'
    }

    addRecipeProduct() {
        const name = this.newRecipeProductName.trim()
        if (!name) return

        const product: RecipeNode = {
            id: this.getNextRecipeId(),
            name,
            children: [],
        }

        this.recipes = [...this.recipes, product]
        this.recipeOpen = [...this.recipeOpen, product.id]
        this.newRecipeProductName = ''
        this.saveRecipes()
        this.showSuccess('Product recipe added')
    }

    async addRecipePart() {
        const targetParentId = this.selectedRecipeTargetParentId
        if (targetParentId === undefined) return

        if (this.recipeAddMode === 'gcode') {
            await this.uploadRecipeFilesToTree(targetParentId)
            return
        }

        const partName = this.newRecipePartName.trim()
        if (!partName) return

        if (targetParentId === null) {
            this.recipes = [...this.recipes, {
                id: this.getNextRecipeId(),
                name: partName,
                children: [],
            }]
            this.newRecipePartName = ''
            this.saveRecipes()
            this.showSuccess('Recipe item added at root level')
            return
        }

        const childNode: RecipeNode = {
            id: this.getNextRecipeId(),
            name: partName,
            children: [],
        }

        const updatedTree = this.appendRecipeChild(this.recipes, targetParentId, childNode)
        if (!updatedTree.added) return

        this.recipes = updatedTree.nodes

        if (!this.recipeOpen.includes(targetParentId)) {
            this.recipeOpen = [...this.recipeOpen, targetParentId]
        }

        this.newRecipePartName = ''
        this.saveRecipes()
        this.showSuccess('Recipe part added')
    }

    onRecipeGcodeFilesSelected(event: Event) {
        const input = event.target as HTMLInputElement
        if (input.files) {
            this.recipeGcodeFiles = Array.from(input.files)
        }
    }

    openRecipeGcodePicker() {
        const input = this.$refs.recipeGcodeInput as HTMLInputElement | undefined
        input?.click()
    }

    removeRecipeGcodeFile(index: number) {
        this.recipeGcodeFiles.splice(index, 1)
    }

    async uploadRecipeFilesToTree(targetParentId: number | null) {
        if (!this.recipeGcodeFiles.length) return

        this.recipeUploading = true
        try {
            const token = localStorage.getItem('fleet_token')
            const formData = new FormData()

            for (const file of this.recipeGcodeFiles) {
                formData.append('files', file)
            }

            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            })

            if (!response.ok) {
                let errorMessage = 'Failed to upload G-Code files'
                try {
                    const data = await response.json()
                    if (data?.error) {
                        errorMessage = data.error
                    }
                } catch {
                    // Keep default message
                }
                this.showError(errorMessage)
                return
            }

            const uploadedNodes: RecipeNode[] = this.recipeGcodeFiles.map((file) => ({
                id: this.getNextRecipeId(),
                name: file.name,
                children: [],
            }))

            const inserted = this.insertRecipeNodesAtTarget(this.recipes, targetParentId, uploadedNodes)
            if (!inserted.inserted) {
                this.showError('Unable to add uploaded files to recipe tree')
                return
            }

            this.recipes = inserted.nodes
            if (targetParentId !== null && !this.recipeOpen.includes(targetParentId)) {
                this.recipeOpen = [...this.recipeOpen, targetParentId]
            }

            this.recipeGcodeFiles = []
            this.saveRecipes()
            await this.refreshFiles()
            await this.loadFeaturedParts()
            this.showSuccess('G-Code files uploaded and added to recipe tree')
        } catch (error) {
            console.error('Error uploading recipe gcode files:', error)
            this.showError('Failed to upload G-Code files')
        } finally {
            this.recipeUploading = false
        }
    }

    insertRecipeNodesAtTarget(nodes: RecipeNode[], targetParentId: number | null, newNodes: RecipeNode[]): { nodes: RecipeNode[]; inserted: boolean } {
        if (targetParentId === null) {
            return {
                nodes: [...nodes, ...newNodes],
                inserted: true,
            }
        }

        let inserted = false
        const updatedNodes = nodes.map((node) => {
            if (node.id === targetParentId) {
                inserted = true
                return {
                    ...node,
                    children: [...node.children, ...newNodes],
                }
            }

            const nested = this.insertRecipeNodesAtTarget(node.children, targetParentId, newNodes)
            if (nested.inserted) {
                inserted = true
                return {
                    ...node,
                    children: nested.nodes,
                }
            }

            return node
        })

        return {
            nodes: updatedNodes,
            inserted,
        }
    }

    appendRecipeChild(nodes: RecipeNode[], parentId: number, childNode: RecipeNode): { nodes: RecipeNode[]; added: boolean } {
        let added = false
        const updatedNodes = nodes.map((node) => {
            if (node.id === parentId) {
                added = true
                return {
                    ...node,
                    children: [...node.children, childNode],
                }
            }

            const nested = this.appendRecipeChild(node.children, parentId, childNode)
            if (nested.added) {
                added = true
                return {
                    ...node,
                    children: nested.nodes,
                }
            }

            return node
        })

        return {
            nodes: updatedNodes,
            added,
        }
    }

    removeSelectedRecipeNode() {
        if (!this.recipeActive.length) return
        const selectedId = this.recipeActive[0]
        if (typeof selectedId === 'string' && selectedId.startsWith('add:')) return

        const numericId = typeof selectedId === 'number' ? selectedId : Number(selectedId)
        if (Number.isNaN(numericId)) return

        const removed = this.removeRecipeNodeById(this.recipes, numericId)
        if (removed) {
            this.recipeActive = []
            this.saveRecipes()
            this.showSuccess('Recipe item removed')
        }
    }

    removeRecipeNodeById(nodes: RecipeNode[], id: number): boolean {
        const index = nodes.findIndex((node) => node.id === id)
        if (index !== -1) {
            nodes.splice(index, 1)
            return true
        }

        for (const node of nodes) {
            if (node.children && node.children.length) {
                const removed = this.removeRecipeNodeById(node.children, id)
                if (removed) return true
            }
        }

        return false
    }

    async loadFeaturedParts() {
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/files', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            if (response.ok) {
                const data = await response.json()
                // Filter to only featured files (those with a category)
                this.featuredParts = (data.files || []).filter((f: RepositoryFile) => f.featured || f.category)
            }
        } catch (error) {
            console.error('Error loading featured parts:', error)
        }
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
            const response = await fetch('/api/printers/accessible', {
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

    onFilesSelected(event: Event) {
        const input = event.target as HTMLInputElement
        if (input.files) {
            this.selectedFiles = Array.from(input.files)
        }
    }

    removeFile(index: number) {
        this.selectedFiles.splice(index, 1)
    }

    getUploadStatusText(): string {
        if (this.uploadProgress === 0) return 'Preparing upload...'
        if (this.uploadProgress < 100) return `Uploading ${this.selectedFiles.length} file(s)...`
        return 'Processing files...'
    }

    async uploadFiles() {
        if (!this.selectedFiles.length) return

        this.uploading = true
        this.uploadProgress = 0
        
        try {
            const token = localStorage.getItem('fleet_token')
            const formData = new FormData()

            // Add metadata fields first (before files for multipart parsing)
            if (this.uploadVersion) {
                formData.append('version', this.uploadVersion)
            }
            if (this.uploadCategory) {
                formData.append('category', this.uploadCategory)
            }
            if (this.uploadPrintTime) {
                formData.append('printTime', this.uploadPrintTime)
            }

            // Add files
            for (const file of this.selectedFiles) {
                formData.append('files', file)
            }

            // Use XMLHttpRequest for upload progress tracking
            const result = await new Promise<{ ok: boolean; data?: any; error?: string }>((resolve) => {
                const xhr = new XMLHttpRequest()
                
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        this.uploadProgress = Math.round((event.loaded / event.total) * 100)
                    }
                })
                
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve({ ok: true })
                    } else {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            resolve({ ok: false, error: data.error || 'Upload failed' })
                        } catch {
                            resolve({ ok: false, error: 'Upload failed' })
                        }
                    }
                })
                
                xhr.addEventListener('error', () => {
                    resolve({ ok: false, error: 'Network error during upload' })
                })
                
                xhr.open('POST', '/api/files/upload')
                xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                xhr.send(formData)
            })

            if (result.ok) {
                this.showSuccess('Files uploaded successfully')
                this.selectedFiles = []
                // Reset form fields
                this.uploadVersion = '1.0'
                this.uploadCategory = null
                this.uploadPrintTime = ''
                await this.refreshFiles()
                await this.loadFeaturedParts()
            } else {
                this.showError(result.error || 'Failed to upload files')
            }
        } catch (error) {
            console.error('Error uploading files:', error)
            this.showError('Failed to upload files')
        } finally {
            this.uploading = false
            this.uploadProgress = 0
        }
    }

    openFileActionsDialog(file: RepositoryFile) {
        this.selectedFile = file
        this.fileActionsDialog = true
    }

    handleSendToPrinter() {
        this.fileActionsDialog = false
        this.selectedPrinter = null
        this.sendDialog = true
    }

    handleDownloadFile() {
        if (this.selectedFile) {
            this.downloadFile(this.selectedFile)
            this.fileActionsDialog = false
        }
    }

    handleDeleteFile() {
        this.fileActionsDialog = false
        this.deleteDialog = true
    }

    sendToPrinter(file: RepositoryFile) {
        this.selectedFile = file
        this.selectedPrinter = null
        this.sendDialog = true
    }

    sendAllToPrinter(group: { category: string; files: RepositoryFile[] }) {
        // For now, show the dialog with the first file - user can send each individually
        // In the future, this could be enhanced to queue all files
        if (group.files.length > 0) {
            this.selectedFile = group.files[0]
            this.selectedPrinter = null
            this.sendDialog = true
            this.showSuccess(`Selected "${this.getCategoryDisplayName(group.category)}" part set. Send each file individually from the table.`)
        }
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

    getCategoryDisplayName(category: string | undefined): string {
        const names: Record<string, string> = {
            'propeller': 'Propeller',
            'truss': 'Truss',
            'control-box': 'Control Box',
        }
        if (!category) return 'Uncategorized'
        return names[category] || this.formatCategoryName(category)
    }

    getCategoryIcon(category: string | undefined): string {
        const icons: Record<string, string> = {
            'propeller': 'mdi-fan',
            'truss': 'mdi-bridge',
            'control-box': 'mdi-cube-outline',
        }
        return category ? icons[category] || 'mdi-file-document' : 'mdi-file-document'
    }

    getCategoryThumbnail(category: string | undefined): string {
        const thumbnails: Record<string, string> = {
            'propeller': '/img/parts/propeller-thumb.png',
            'truss': '/img/parts/truss-thumb.png',
            'control-box': '/img/parts/control-box-thumb.png',
        }
        return category ? thumbnails[category] || '' : ''
    }

    formatCategory(category: string | undefined): string {
        return this.getCategoryDisplayName(category)
    }

    openCreateDirectoryDialog() {
        this.newDirectoryName = ''
        this.createDirectoryDialog = true
    }

    async createDirectory() {
        const directoryName = this.newDirectoryName.trim()
        if (!directoryName || !this.isValidDirectoryName) return

        this.creatingDirectory = true
        try {
            const token = localStorage.getItem('fleet_token')
            const response = await fetch('/api/files/directory', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: directoryName,
                }),
            })

            if (response.ok) {
                this.showSuccess(`Directory "${directoryName}" created successfully`)
                this.createDirectoryDialog = false
                this.newDirectoryName = ''
                await this.refreshFiles()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to create directory')
            }
        } catch (error) {
            console.error('Error creating directory:', error)
            this.showError('Failed to create directory')
        } finally {
            this.creatingDirectory = false
        }
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

.gap-2 {
    gap: 8px;
}

.part-tile {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    overflow: hidden;
}

.part-tile:hover {
    transform: translateY(-4px);
}

.thumbnail-container {
    position: relative;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.part-thumbnail {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.version-badge {
    position: absolute;
    top: 0;
    right: 0;
}

.files-table {
    max-height: 200px;
    overflow-y: auto;
}

.files-table th {
    background-color: rgba(0, 0, 0, 0.05) !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.files-table td {
    font-size: 0.875rem;
}

.files-table tr:hover {
    background-color: rgba(var(--v-primary-base), 0.05) !important;
}

.file-name {
    font-weight: 500;
}

/* Clickable table rows */
.clickable-table tbody tr {
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.clickable-table tbody tr:hover {
    background-color: rgba(25, 118, 210, 0.12) !important;
}

.clickable-table tbody tr:active {
    background-color: rgba(25, 118, 210, 0.2) !important;
}

/* File actions dialog items */
.action-item {
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.action-item:hover {
    background-color: rgba(0, 0, 0, 0.04);
}
</style>
