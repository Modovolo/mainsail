<template>
    <v-container fluid>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h4 mb-2">
                    <v-icon large class="mr-2">mdi-cog-sync</v-icon>
                    Configuration Sync
                </h1>
                <p class="text-subtitle-1 grey--text mb-6">
                    Manage and synchronize printer configurations across your fleet
                </p>
            </v-col>
        </v-row>

        <!-- Config Templates Section -->
        <v-row>
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-file-cog</v-icon>
                        Config Templates
                        <v-spacer></v-spacer>
                        <v-btn color="primary" @click="openCreateDialog">
                            <v-icon left>mdi-plus</v-icon>
                            New Template
                        </v-btn>
                        <v-btn icon class="ml-2" @click="refreshData" :loading="loading">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>

                    <!-- Loading State -->
                    <v-card-text v-if="loading" class="text-center pa-6">
                        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                        <div class="mt-4 grey--text">Loading templates...</div>
                    </v-card-text>

                    <!-- Empty State -->
                    <v-card-text v-else-if="templates.length === 0" class="text-center pa-6">
                        <v-icon size="80" color="grey lighten-1">mdi-file-cog-outline</v-icon>
                        <div class="text-h6 grey--text mt-4">No config templates</div>
                        <div class="text-body-2 grey--text">Create a template to start syncing configurations</div>
                        <v-btn color="primary" class="mt-4" @click="openCreateDialog">
                            <v-icon left>mdi-plus</v-icon>
                            Create First Template
                        </v-btn>
                    </v-card-text>

                    <!-- Templates Table -->
                    <v-data-table
                        v-else
                        :headers="templateHeaders"
                        :items="templates"
                        :items-per-page="10"
                        class="clickable-table"
                        @click:row="openEditDialog"
                    >
                        <template #item.name="{ item }">
                            <div class="d-flex align-center">
                                <v-icon class="mr-2" color="primary">mdi-file-cog</v-icon>
                                <div>
                                    <div class="font-weight-medium">{{ item.name }}</div>
                                    <div class="text-caption grey--text">{{ item.filename }}</div>
                                    <v-btn
                                        x-small
                                        text
                                        color="primary"
                                        class="px-0 mt-1"
                                        @click.stop="openTemplateInEditor(item)"
                                    >
                                        Open in Editor
                                    </v-btn>
                                </div>
                            </div>
                        </template>

                        <template #item.version="{ item }">
                            <v-chip small color="primary" outlined>
                                v{{ item.version }}
                            </v-chip>
                        </template>

                        <template #item.updatedAt="{ item }">
                            {{ formatDateStr(item.updatedAt) }}
                        </template>

                        <template #item.actions="{ item }">
                            <v-btn icon small @click.stop="openTemplateInEditor(item)">
                                <v-icon small>mdi-file-document-edit-outline</v-icon>
                            </v-btn>
                            <v-btn icon small @click.stop="openEditDialog(item)">
                                <v-icon small>mdi-pencil</v-icon>
                            </v-btn>
                            <v-btn icon small color="error" @click.stop="confirmDeleteTemplate(item)">
                                <v-icon small>mdi-delete</v-icon>
                            </v-btn>
                        </template>
                    </v-data-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Fleet Sync Status Section -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-printer-3d-nozzle</v-icon>
                        Fleet Sync Status
                        <v-spacer></v-spacer>
                        <v-chip small :color="onlinePrintersCount > 0 ? 'success' : 'grey'" class="mr-2">
                            {{ onlinePrintersCount }} Online
                        </v-chip>
                    </v-card-title>
                    <v-divider></v-divider>

                    <!-- Empty State -->
                    <v-card-text v-if="printerStatuses.length === 0 && !loading" class="text-center pa-6">
                        <v-icon size="80" color="grey lighten-1">mdi-printer-3d-off</v-icon>
                        <div class="text-h6 grey--text mt-4">No printers found</div>
                        <div class="text-body-2 grey--text">Register printers to sync configurations</div>
                    </v-card-text>

                    <!-- Printers Status List -->
                    <v-list v-else three-line>
                        <template v-for="(printer, index) in printerStatuses">
                            <v-list-item :key="printer.printerId">
                                <v-list-item-avatar>
                                    <v-icon 
                                        :color="printer.isOnline ? 'success' : 'grey'"
                                        size="32"
                                    >
                                        mdi-printer-3d
                                    </v-icon>
                                </v-list-item-avatar>

                                <v-list-item-content>
                                    <v-list-item-title class="font-weight-medium">
                                        {{ printer.printerName }}
                                        <v-chip 
                                            x-small 
                                            :color="printer.isOnline ? 'success' : 'grey'" 
                                            class="ml-2"
                                        >
                                            {{ printer.isOnline ? 'Online' : 'Offline' }}
                                        </v-chip>
                                    </v-list-item-title>
                                    <v-list-item-subtitle>
                                        <div class="d-flex flex-wrap gap-1 mt-1">
                                            <v-chip
                                                v-for="tpl in printer.templates"
                                                :key="tpl.templateId"
                                                x-small
                                                :color="getSyncStatusColor(tpl.status)"
                                                :outlined="tpl.status === 'synced'"
                                                class="template-chip"
                                                @click.stop="openTemplateFileFromPrinter(printer, tpl)"
                                            >
                                                <v-icon x-small left>{{ getSyncStatusIcon(tpl.status) }}</v-icon>
                                                {{ tpl.templateName }}
                                                <span v-if="tpl.syncedVersion" class="ml-1">v{{ tpl.syncedVersion }}</span>
                                            </v-chip>
                                        </div>
                                        <div class="d-flex flex-wrap gap-1 mt-2 align-center">
                                            <span class="text-caption grey--text mr-2">Config files:</span>
                                            <v-btn
                                                icon
                                                x-small
                                                :disabled="!printer.isOnline || !!printer.configFilesLoading"
                                                :loading="!!printer.configFilesLoading"
                                                @click.stop="loadPrinterConfigFiles(printer.printerId)"
                                            >
                                                <v-icon x-small>mdi-refresh</v-icon>
                                            </v-btn>
                                            <v-chip
                                                v-for="cfg in printer.configFiles || []"
                                                :key="`${printer.printerId}-${cfg}`"
                                                x-small
                                                color="white"
                                                text-color="black"
                                                class="config-file-chip"
                                                @click.stop="openConfigFileFromPrinter(printer, cfg)"
                                            >
                                                {{ cfg }}
                                            </v-chip>
                                            <span v-if="!printer.isOnline" class="text-caption grey--text">
                                                Printer offline
                                            </span>
                                            <span
                                                v-else-if="printer.configFilesLoading"
                                                class="text-caption grey--text"
                                            >
                                                Loading...
                                            </span>
                                            <span v-else-if="printer.configFilesError" class="text-caption error--text">
                                                {{ printer.configFilesError }}
                                            </span>
                                            <span
                                                v-else-if="printer.configFilesLoaded && printer.configFiles && printer.configFiles.length === 0"
                                                class="text-caption grey--text"
                                            >
                                                No config files reported
                                            </span>
                                            <span
                                                v-else-if="printer.isOnline"
                                                class="text-caption grey--text"
                                            >
                                                Click refresh to load files
                                            </span>
                                        </div>
                                    </v-list-item-subtitle>
                                </v-list-item-content>

                                <v-list-item-action>
                                    <v-menu
                                        offset-y
                                        :disabled="!printer.isOnline || !!printer.configFilesLoading || migrationTemplateOptions(printer).length === 0"
                                    >
                                        <template #activator="{ on, attrs }">
                                            <v-btn
                                                color="orange"
                                                small
                                                class="mb-2"
                                                :disabled="!printer.isOnline || !!printer.configFilesLoading || migrationTemplateOptions(printer).length === 0"
                                                :loading="migratingPrinter === printer.printerId"
                                                v-bind="attrs"
                                                v-on="on"
                                            >
                                                <v-icon left small>mdi-file-replace</v-icon>
                                                Migrate & Review
                                                <v-icon right x-small>mdi-menu-down</v-icon>
                                            </v-btn>
                                        </template>

                                        <v-list dense>
                                            <v-list-item @click="startMigrationReview(printer)">
                                                <v-list-item-title>All templates</v-list-item-title>
                                            </v-list-item>
                                            <v-divider></v-divider>
                                            <v-list-item
                                                v-for="templateOption in migrationTemplateOptions(printer)"
                                                :key="`migration-option-${printer.printerId}-${templateOption.templateId}`"
                                                @click="startMigrationReview(printer, [templateOption.templateId], templateOption.templateName)"
                                            >
                                                <v-list-item-content>
                                                    <v-list-item-title>{{ templateOption.templateName }}</v-list-item-title>
                                                    <v-list-item-subtitle>{{ templateOption.sourcePath || templateOption.filename }}</v-list-item-subtitle>
                                                </v-list-item-content>
                                            </v-list-item>
                                        </v-list>
                                    </v-menu>

                                    <v-btn
                                        color="warning"
                                        small
                                        class="mb-2"
                                        :disabled="!printer.isOnline || !!printer.configFilesLoading"
                                        :loading="downloadingPrinter === printer.printerId"
                                        @click="downloadRunningConfigs(printer)"
                                    >
                                        <v-icon left small>mdi-download</v-icon>
                                        Download Configs
                                    </v-btn>

                                    <v-btn
                                        color="secondary"
                                        small
                                        class="mb-2"
                                        :loading="loadingBackupsPrinter === printer.printerId"
                                        @click="openBackupsDialog(printer)"
                                    >
                                        <v-icon left small>mdi-history</v-icon>
                                        Backups
                                    </v-btn>

                                    <v-btn
                                        color="primary"
                                        small
                                        :disabled="!printer.isOnline || templates.length === 0 || !!printer.migrationPendingVerification"
                                        :loading="syncingPrinter === printer.printerId"
                                        @click="openSyncConfigsDialog(printer)"
                                    >
                                        <v-icon left small>mdi-sync</v-icon>
                                        Sync Configs
                                    </v-btn>
                                    <div
                                        v-if="printer.migrationPendingVerification"
                                        class="text-caption warning--text mt-1 text-right"
                                    >
                                        Verification required
                                    </div>
                                </v-list-item-action>
                            </v-list-item>
                            <v-divider v-if="index < printerStatuses.length - 1" :key="'div-' + printer.printerId"></v-divider>
                        </template>
                    </v-list>
                </v-card>
            </v-col>
        </v-row>

        <!-- Fleet Client Version Section -->
        <v-row class="mt-4">
            <v-col cols="12">
                <v-card elevation="2">
                    <v-card-title>
                        <v-icon class="mr-2">mdi-update</v-icon>
                        Fleet Client Version
                        <v-spacer></v-spacer>
                        <v-chip small color="primary" class="mr-2">
                            Latest: v{{ latestClientVersion }}
                        </v-chip>
                        <v-btn
                            small
                            color="primary"
                            :loading="updatingAll"
                            :disabled="!hasOutdatedClients"
                            @click="triggerUpdateAll"
                        >
                            <v-icon left small>mdi-cloud-download</v-icon>
                            Update All
                        </v-btn>
                        <v-btn icon class="ml-2" @click="loadClientStatus" :loading="loadingClientStatus">
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                    </v-card-title>
                    <v-divider></v-divider>

                    <!-- Version Info Banner -->
                    <v-alert
                        v-if="clientVersionChangelog"
                        type="info"
                        text
                        dense
                        class="ma-3 mb-0"
                    >
                        <div class="text-body-2 font-weight-medium">Version {{ latestClientVersion }} - Released {{ clientVersionReleased }}</div>
                        <div class="text-caption">{{ clientVersionChangelog }}</div>
                    </v-alert>

                    <!-- Loading State -->
                    <v-card-text v-if="loadingClientStatus" class="text-center pa-6">
                        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                        <div class="mt-4 grey--text">Loading client versions...</div>
                    </v-card-text>

                    <!-- Empty State -->
                    <v-card-text v-else-if="clientStatuses.length === 0" class="text-center pa-6">
                        <v-icon size="80" color="grey lighten-1">mdi-cloud-off-outline</v-icon>
                        <div class="text-h6 grey--text mt-4">No printers found</div>
                    </v-card-text>

                    <!-- Client Version Table -->
                    <v-simple-table v-else dense>
                        <thead>
                            <tr>
                                <th>Printer</th>
                                <th>Status</th>
                                <th>Client Version</th>
                                <th>Auto-Update</th>
                                <th class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="client in clientStatuses" :key="client.printerId">
                                <td>
                                    <div class="d-flex align-center">
                                        <v-icon 
                                            :color="client.isOnline ? 'success' : 'grey'"
                                            small
                                            class="mr-2"
                                        >
                                            mdi-printer-3d
                                        </v-icon>
                                        {{ client.printerName }}
                                    </div>
                                </td>
                                <td>
                                    <v-chip 
                                        x-small 
                                        :color="getClientUpdateStatusColor(client.updateStatus)"
                                        :outlined="client.updateStatus === 'up_to_date'"
                                    >
                                        <v-icon x-small left>{{ getClientUpdateStatusIcon(client.updateStatus) }}</v-icon>
                                        {{ getClientUpdateStatusText(client.updateStatus) }}
                                    </v-chip>
                                </td>
                                <td>
                                    <div>
                                        <span v-if="client.clientVersion">v{{ client.clientVersion }}</span>
                                        <span v-else class="grey--text">—</span>
                                    </div>
                                    <div v-if="client.updateMessage" class="text-caption mt-1">
                                        {{ client.updateMessage }}
                                    </div>
                                    <v-progress-linear
                                        v-if="isClientOperationActive(client)"
                                        :value="client.updateProgress || 0"
                                        :color="getClientOperationColor(client)"
                                        height="6"
                                        rounded
                                        class="mt-2 mb-1"
                                    ></v-progress-linear>
                                    <div v-if="getRecentClientLogs(client).length" class="mt-1">
                                        <div
                                            v-for="(log, logIndex) in getRecentClientLogs(client)"
                                            :key="`${client.printerId}-log-${logIndex}`"
                                            class="text-caption grey--text client-log-line"
                                        >
                                            {{ log }}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <v-switch
                                        :value="client.autoUpdate"
                                        dense
                                        hide-details
                                        :disabled="!client.isOnline || togglingAutoUpdate === client.printerId"
                                        :loading="togglingAutoUpdate === client.printerId"
                                        @click.stop="toggleAutoUpdate(client)"
                                        class="mt-0 pt-0"
                                    ></v-switch>
                                </td>
                                <td class="text-right">
                                    <div class="d-inline-flex align-center">
                                        <v-btn
                                            small
                                            text
                                            color="primary"
                                            :disabled="!client.isOnline || client.updateStatus === 'up_to_date' || restartingPrinter === client.printerId || isClientOperationActive(client)"
                                            :loading="updatingPrinter === client.printerId"
                                            @click="triggerUpdate(client)"
                                        >
                                            <v-icon small left>mdi-download</v-icon>
                                            Update
                                        </v-btn>
                                        <v-btn
                                            small
                                            text
                                            color="secondary"
                                            :disabled="!client.isOnline || updatingPrinter === client.printerId || isClientOperationActive(client)"
                                            :loading="restartingPrinter === client.printerId"
                                            @click="triggerRestart(client)"
                                        >
                                            <v-icon small left>mdi-restart</v-icon>
                                            Restart
                                        </v-btn>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Create/Edit Template Dialog -->
        <v-dialog v-model="templateDialog" max-width="800" persistent>
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">{{ editingTemplate ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
                    {{ editingTemplate ? 'Edit Config Template' : 'Create Config Template' }}
                </v-card-title>
                <v-card-text class="pa-6">
                    <v-row>
                        <v-col cols="12" sm="6">
                            <v-text-field
                                v-model="templateForm.name"
                                label="Template Name"
                                placeholder="e.g., Main Printer Config"
                                outlined
                                dense
                                prepend-icon="mdi-label"
                                :rules="[v => !!v || 'Name is required']"
                            ></v-text-field>
                        </v-col>
                        <v-col cols="12" sm="6">
                            <v-file-input
                                v-model="templateFile"
                                label="Upload Config File"
                                outlined
                                dense
                                prepend-icon="mdi-upload"
                                accept=".cfg,.conf,.ini,.txt"
                                :hint="editingTemplate ? 'Upload to replace existing file content' : 'Required to create template'"
                                persistent-hint
                                @change="onFileSelected"
                            ></v-file-input>
                        </v-col>
                    </v-row>
                    <v-row>
                        <v-col cols="12" sm="6">
                            <v-text-field
                                v-model="templateForm.version"
                                label="Version"
                                placeholder="e.g., 1.0"
                                outlined
                                dense
                                prepend-icon="mdi-tag"
                                hint="Semantic version (e.g., 1.0, 1.1, 2.0)"
                                persistent-hint
                            ></v-text-field>
                        </v-col>
                        <v-col cols="12" sm="6">
                            <v-text-field
                                :value="templateForm.filename"
                                label="Filename"
                                outlined
                                dense
                                prepend-icon="mdi-file"
                                readonly
                                :rules="[v => !!v || 'Please upload a config file']"
                                hint="Auto-filled from uploaded file"
                                persistent-hint
                            ></v-text-field>
                        </v-col>
                    </v-row>
                    <v-row>
                        <v-col cols="12">
                            <v-text-field
                                v-model="templateForm.sourcePath"
                                label="Source Path (Optional)"
                                placeholder="e.g., printer.cfg or configs/mainsail_idex.cfg"
                                outlined
                                dense
                                prepend-icon="mdi-link-variant"
                                hint="Canonical runtime config path for migration and file matching"
                                persistent-hint
                            ></v-text-field>
                        </v-col>
                    </v-row>
                    <v-row>
                        <v-col cols="12">
                            <v-text-field
                                v-model="templateForm.description"
                                label="Description (Optional)"
                                placeholder="Brief description of this configuration"
                                outlined
                                dense
                                prepend-icon="mdi-text"
                            ></v-text-field>
                        </v-col>
                    </v-row>
                </v-card-text>
                <v-card-actions class="px-6 pb-4">
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeTemplateDialog">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!isTemplateFormValid"
                        :loading="saving"
                        @click="saveTemplate"
                    >
                        <v-icon left>mdi-content-save</v-icon>
                        {{ editingTemplate ? 'Update' : 'Create' }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="syncConfigsDialog" max-width="720" persistent>
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-sync</v-icon>
                    Sync Configs
                </v-card-title>
                <v-card-text class="pa-6">
                    <div class="text-body-2 mb-4">
                        Select which configs to push to
                        <strong>{{ syncConfigsPrinter?.printerName }}</strong>.
                    </div>

                    <v-simple-table dense>
                        <thead>
                            <tr>
                                <th class="text-center" style="width: 80px;">Sync</th>
                                <th>Template</th>
                                <th>Current Version</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="tpl in syncConfigsTemplates" :key="tpl.templateId">
                                <td class="text-center">
                                    <v-checkbox
                                        :input-value="!!syncConfigsSelection[tpl.templateId]"
                                        hide-details
                                        class="mt-0 pt-0"
                                        @change="setSyncConfigSelection(tpl.templateId, $event)"
                                    ></v-checkbox>
                                </td>
                                <td>
                                    <div class="font-weight-medium">{{ tpl.templateName }}</div>
                                    <div class="text-caption grey--text">{{ tpl.filename }}</div>
                                </td>
                                <td>
                                    <v-chip x-small outlined color="info">v{{ tpl.currentVersion }}</v-chip>
                                </td>
                                <td>
                                    <v-chip x-small :color="getSyncStatusColor(tpl.status)" :outlined="tpl.status === 'synced'">
                                        <v-icon x-small left>{{ getSyncStatusIcon(tpl.status) }}</v-icon>
                                        {{ tpl.status }}
                                    </v-chip>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>

                    <div class="text-caption mt-3">
                        Selected: <strong>{{ selectedSyncConfigIds.length }}</strong>
                    </div>
                </v-card-text>
                <v-card-actions class="px-6 pb-4">
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeSyncConfigsDialog">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="selectedSyncConfigIds.length === 0 || !syncConfigsPrinter"
                        :loading="syncingPrinter === syncConfigsPrinter?.printerId"
                        @click="syncSelectedConfigsToPrinter"
                    >
                        <v-icon left>mdi-sync</v-icon>
                        Push Selected Configs
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="backupsDialog" max-width="980" persistent>
            <v-card>
                <v-card-title class="secondary white--text d-flex align-center">
                    <v-icon class="mr-2" color="white">mdi-history</v-icon>
                    Migration Backups
                    <v-spacer></v-spacer>
                    <v-btn icon dark :loading="backupsLoading" @click="refreshBackupsDialog">
                        <v-icon>mdi-refresh</v-icon>
                    </v-btn>
                </v-card-title>
                <v-card-text class="pa-6">
                    <div class="text-body-2 mb-3">
                        Backups captured before migration apply for
                        <strong>{{ backupsPrinter?.printerName }}</strong>.
                    </div>
                    <v-alert type="info" dense text class="mb-4">
                        Retention policy keeps the latest 10 backups per printer.
                    </v-alert>

                    <v-simple-table dense v-if="backupEntries.length">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Template</th>
                                <th>Created</th>
                                <th>Version</th>
                                <th>Status</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="backup in backupEntries" :key="backup.id">
                                <td class="text-caption font-weight-medium">{{ backup.filename }}</td>
                                <td>
                                    <div class="text-caption">{{ backup.templateName }}</div>
                                    <div class="text-caption grey--text">{{ backup.sourcePath }}</div>
                                </td>
                                <td class="text-caption">{{ formatDateStr(backup.createdAt) }}</td>
                                <td>
                                    <v-chip x-small outlined color="info">
                                        v{{ backup.versionBefore }} → v{{ backup.versionAfter }}
                                    </v-chip>
                                </td>
                                <td>
                                    <v-chip
                                        x-small
                                        :color="backup.restoredAt ? 'success' : 'grey'"
                                        :outlined="!backup.restoredAt"
                                    >
                                        {{ backup.restoredAt ? 'restored' : 'available' }}
                                    </v-chip>
                                </td>
                                <td class="text-right">
                                    <v-btn
                                        x-small
                                        color="primary"
                                        :loading="restoringBackupId === backup.id"
                                        @click="restoreMigrationBackup(backup)"
                                    >
                                        Restore
                                    </v-btn>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>

                    <v-alert v-else type="info" text dense>
                        No migration backups found for this printer.
                    </v-alert>
                </v-card-text>
                <v-card-actions class="px-6 pb-4">
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeBackupsDialog">Close</v-btn>
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
                    Are you sure you want to delete <strong>{{ templateToDelete?.name }}</strong>?
                    <br><br>
                    This will also remove all sync status records for this template.
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="deleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" :loading="deleting" @click="deleteTemplate">
                        <v-icon left>mdi-delete</v-icon>
                        Delete
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="migrationDialog" max-width="980" persistent>
            <v-card>
                <v-card-title class="orange white--text">
                    <v-icon class="mr-2" color="white">mdi-file-replace</v-icon>
                    Migration Review
                </v-card-title>
                <v-card-text class="pa-6">
                    <div class="text-body-2 mb-4">
                        Review generated template updates for <strong>{{ migrationPrinter?.printerName }}</strong>.
                        Configs can only be applied after each item is reviewed and marked as accepted or declined.
                    </div>

                    <v-simple-table dense>
                        <thead>
                            <tr>
                                <th>Template</th>
                                <th>Source</th>
                                <th>New File</th>
                                <th>Version</th>
                                <th class="text-center">Review</th>
                                <th class="text-center">Decision</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="candidate in migrationCandidates" :key="candidate.templateId">
                                <td>
                                    <div class="font-weight-medium">{{ candidate.templateName }}</div>
                                    <div class="text-caption grey--text">{{ candidate.filename }}</div>
                                    <div
                                        v-if="(candidate.reviewMode === 'migration' && candidate.verificationSummary && candidate.verificationSummary.totalChecks > 0) || (candidate.reviewMode === 'macro_merge' && candidate.macroMergeSummary)"
                                        class="text-caption mt-1"
                                        :class="getMigrationVerificationTextClass(candidate)"
                                    >
                                        {{ formatMigrationVerificationSummary(candidate) }}
                                    </div>
                                </td>
                                <td class="text-caption">{{ candidate.sourcePath }}</td>
                                <td class="text-caption">{{ candidate.filename }}</td>
                                <td>
                                    <v-chip x-small outlined color="info">
                                        v{{ candidate.currentVersion }} → v{{ candidate.proposedVersion }}
                                    </v-chip>
                                </td>
                                <td class="text-center">
                                    <div class="d-flex flex-column align-center">
                                        <v-btn x-small text color="primary" @click="openMigrationCandidateInEditor(candidate)">
                                            {{ candidate.hasContentChanges === false ? 'View File' : 'View Diff' }}
                                        </v-btn>
                                        <v-btn
                                            v-if="candidate.hasContentChanges !== false && candidate.reviewMode === 'migration'"
                                            x-small
                                            text
                                            color="primary"
                                            @click="openLineReviewDialog(candidate)">
                                            Review Lines
                                        </v-btn>
                                        <v-btn
                                            v-if="candidate.reviewMode === 'migration' && candidate.verificationSummary && candidate.verificationSummary.totalChecks > 0"
                                            x-small
                                            text
                                            :color="candidate.verificationSummary.missingChecks || candidate.verificationSummary.mismatchedChecks ? 'error' : 'success'"
                                            @click="openMigrationVerificationInEditor(candidate)"
                                        >
                                            View Pins
                                        </v-btn>
                                    </div>
                                </td>
                                <td class="text-center">
                                    <v-btn
                                        x-small
                                        class="mr-1"
                                        :color="candidate.decision === 'accepted' ? 'success' : 'grey'"
                                        :outlined="candidate.decision !== 'accepted'"
                                        @click="setMigrationDecision(candidate, 'accepted')">
                                        Accept
                                    </v-btn>
                                    <v-btn
                                        x-small
                                        :color="candidate.decision === 'declined' ? 'error' : 'grey'"
                                        :outlined="candidate.decision !== 'declined'"
                                        @click="setMigrationDecision(candidate, 'declined')">
                                        Decline
                                    </v-btn>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>

                    <!-- Pin Mappings Section -->
                    <div
                        v-for="candidate in migrationCandidates"
                        :key="'pins-' + candidate.templateId"
                        class="mt-5"
                        v-if="candidate.reviewMode === 'migration'"
                    >
                        <div class="d-flex align-center mb-2">
                            <v-icon small class="mr-1">mdi-chip</v-icon>
                            <span class="text-subtitle-2 font-weight-medium">Pin &amp; Position Mappings — {{ candidate.templateName }}</span>
                            <v-chip
                                v-if="candidate.verificationSummary && candidate.verificationSummary.totalChecks > 0"
                                x-small
                                class="ml-2"
                                :color="candidate.verificationSummary.missingChecks || candidate.verificationSummary.mismatchedChecks ? 'error' : 'success'"
                                :outlined="!(candidate.verificationSummary.missingChecks || candidate.verificationSummary.mismatchedChecks)"
                            >
                                {{ candidate.verificationSummary.matchedChecks }}/{{ candidate.verificationSummary.totalChecks }}
                            </v-chip>
                        </div>

                        <v-alert
                            v-if="!candidate.verificationSummary"
                            type="warning"
                            text
                            dense
                        >
                            No verification summary returned by server for this candidate.
                        </v-alert>

                        <v-alert
                            v-else-if="!candidate.verificationSummary.mappings || candidate.verificationSummary.mappings.length === 0"
                            type="info"
                            text
                            dense
                        >
                            No migratable pin or position values detected in source config.
                            (totalChecks: {{ candidate.verificationSummary.totalChecks }}, reviewMode: {{ candidate.reviewMode }})
                        </v-alert>

                        <v-simple-table v-else dense class="pin-mapping-table">
                            <thead>
                                <tr>
                                    <th>Pin Object</th>
                                    <th>Source Value</th>
                                    <th>New Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(mapping, mIdx) in candidate.verificationSummary.mappings"
                                    :key="mIdx"
                                    :class="getPinMappingRowClass(mapping.status)"
                                >
                                    <td class="text-caption">
                                        <span class="grey--text">[{{ mapping.section }}]</span>
                                        <span class="font-weight-medium ml-1">{{ mapping.parameter }}</span>
                                    </td>
                                    <td class="text-caption font-weight-medium">{{ mapping.sourceValue }}</td>
                                    <td class="text-caption font-weight-medium">
                                        <span v-if="mapping.newValue != null">{{ mapping.newValue }}</span>
                                        <span v-else class="error--text font-italic">missing</span>
                                        <v-icon
                                            v-if="mapping.status === 'matched'"
                                            x-small
                                            color="success"
                                            class="ml-1"
                                        >mdi-check-circle</v-icon>
                                        <v-icon
                                            v-else-if="mapping.status === 'mismatch'"
                                            x-small
                                            color="warning"
                                            class="ml-1"
                                        >mdi-alert</v-icon>
                                        <v-icon
                                            v-else
                                            x-small
                                            color="error"
                                            class="ml-1"
                                        >mdi-close-circle</v-icon>
                                    </td>
                                </tr>
                            </tbody>
                        </v-simple-table>
                    </div>

                    <div
                        v-for="candidate in migrationCandidates"
                        :key="'macro-' + candidate.templateId"
                        class="mt-5"
                        v-if="candidate.reviewMode === 'macro_merge'"
                    >
                        <div class="d-flex align-center mb-2">
                            <v-icon small class="mr-1">mdi-source-merge</v-icon>
                            <span class="text-subtitle-2 font-weight-medium">Section Merge Decisions — {{ candidate.templateName }}</span>
                        </div>

                        <v-alert
                            v-if="!candidate.macroSections || candidate.macroSections.length === 0"
                            type="info"
                            text
                            dense
                        >
                            No section metadata returned for macro merge review.
                        </v-alert>

                        <v-simple-table v-else dense class="macro-merge-table">
                            <thead>
                                <tr>
                                    <th class="text-center" style="width: 80px;">Use</th>
                                    <th>Section</th>
                                    <th>Status</th>
                                    <th>Choice</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="section in candidate.macroSections"
                                    :key="`${candidate.templateId}-${section.sectionHeader}`"
                                >
                                    <td class="text-center">
                                        <v-checkbox
                                            :input-value="!!section.selected"
                                            hide-details
                                            class="mt-0 pt-0"
                                            @change="setMacroSectionSelected(candidate, section.sectionHeader, $event)"
                                        ></v-checkbox>
                                    </td>
                                    <td>
                                        <div class="text-caption font-weight-medium">{{ section.sectionHeader }}</div>
                                        <div v-if="section.sectionType" class="text-caption grey--text">{{ section.sectionType }}</div>
                                    </td>
                                    <td>
                                        <v-chip x-small :color="getMacroSectionStatusColor(section.classification)" outlined>
                                            {{ section.classification }}
                                        </v-chip>
                                    </td>
                                    <td>
                                        <v-btn
                                            x-small
                                            class="mr-1"
                                            :disabled="!section.selected || !section.templateContent"
                                            :color="section.choice === 'template' ? 'primary' : 'grey'"
                                            :outlined="section.choice !== 'template'"
                                            @click="setMacroSectionChoice(candidate, section.sectionHeader, 'template')"
                                        >
                                            Template
                                        </v-btn>
                                        <v-btn
                                            x-small
                                            :disabled="!section.selected || !section.sourceContent"
                                            :color="section.choice === 'source' ? 'info' : 'grey'"
                                            :outlined="section.choice !== 'source'"
                                            @click="setMacroSectionChoice(candidate, section.sectionHeader, 'source')"
                                        >
                                            Printer
                                        </v-btn>
                                    </td>
                                </tr>
                            </tbody>
                        </v-simple-table>
                    </div>

                    <div class="text-caption mt-3">
                        Accepted: <strong>{{ acceptedMigrationCandidates.length }}</strong> ·
                        Declined: <strong>{{ declinedMigrationCandidates.length }}</strong>
                    </div>

                    <v-alert
                        v-if="migrationUnmatchedTemplates.length"
                        type="warning"
                        text
                        dense
                        class="mt-4"
                    >
                        {{ migrationUnmatchedTemplates.length }} template(s) had no matching running config file.
                    </v-alert>

                    <v-checkbox
                        v-model="migrationVerificationConfirmed"
                        class="mt-4"
                        hide-details
                        label="I have reviewed all diffs and confirmed my accept/decline decisions"
                    ></v-checkbox>
                </v-card-text>
                <v-card-actions class="px-6 pb-4">
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeMigrationDialog()">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!allMigrationCandidatesReviewed || acceptedMigrationCandidates.length === 0 || !migrationVerificationConfirmed"
                        :loading="applyingMigration"
                        @click="applyAcceptedMigration"
                    >
                        <v-icon left>mdi-check</v-icon>
                        Apply Accepted Changes
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="lineReviewDialog" max-width="1100" persistent>
            <v-card>
                <v-card-title class="primary white--text">
                    <v-icon class="mr-2" color="white">mdi-format-list-bulleted-type</v-icon>
                    Line-Level Diff Review
                </v-card-title>
                <v-card-text class="pa-6" v-if="lineReviewCandidate">
                    <div class="text-body-2 mb-3">
                        Select which changed lines should be applied for
                        <strong>{{ lineReviewCandidate.templateName }}</strong>.
                    </div>

                    <v-simple-table dense class="line-review-table">
                        <thead>
                            <tr>
                                <th class="text-center">Apply</th>
                                <th>Type</th>
                                <th>Line</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="op in lineReviewOps"
                                :key="`${lineReviewCandidate.templateId}-${op.index}`"
                                :class="op.type === 'add' ? 'line-op-add' : 'line-op-remove'"
                            >
                                <td class="text-center" style="width: 80px;">
                                    <v-checkbox
                                        :input-value="isLineDecisionAccepted(lineReviewCandidate, op.index)"
                                        hide-details
                                        class="mt-0 pt-0"
                                        @change="setLineDecision(lineReviewCandidate, op.index, $event)"
                                    ></v-checkbox>
                                </td>
                                <td style="width: 90px;">
                                    <v-chip x-small :color="op.type === 'add' ? 'success' : 'error'" outlined>
                                        {{ op.type === 'add' ? 'ADD' : 'REMOVE' }}
                                    </v-chip>
                                </td>
                                <td>
                                    <code>{{ op.line }}</code>
                                </td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-card-text>
                <v-card-actions class="px-6 pb-4">
                    <v-spacer></v-spacer>
                    <v-btn text @click="closeLineReviewDialog">Close</v-btn>
                    <v-btn color="primary" @click="applyLineReviewSelections">Apply Line Decisions</v-btn>
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
import JSZip from 'jszip'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

interface ConfigTemplate {
    id: string
    name: string
    filename: string
    sourcePath?: string
    content?: string
    contentHash: string
    version: string
    description?: string
    createdBy: string
    createdByUsername?: string
    createdAt: string
    updatedAt: string
}

interface TemplateStatus {
    templateId: string
    templateName: string
    filename: string
    sourcePath?: string
    currentVersion: string
    syncedVersion: string | null
    syncedAt: string | null
    status: 'synced' | 'outdated' | 'missing'
}

interface PrinterStatus {
    printerId: string
    printerName: string
    printerHost?: string
    isOnline: boolean
    templates: TemplateStatus[]
    configFiles?: string[]
    configFilesError?: string
    configFilesLoading?: boolean
    configFilesLoaded?: boolean
    configFileEntries?: ConfigSnapshotFile[]
    migrationPendingVerification?: boolean
}

interface ConfigSnapshotFile {
    path: string
    content?: string
    contentHash?: string
}

interface ConfigMigrationBackupEntry {
    id: string
    printerId: string
    templateId: string
    templateName: string
    sourcePath: string
    filename: string
    contentHash: string
    versionBefore: string
    versionAfter: string
    reason: string
    createdBy: string
    createdAt: string
    restoredBy?: string | null
    restoredAt?: string | null
}

interface ClientStatus {
    printerId: string
    printerName: string
    isOnline: boolean
    clientVersion: string | null
    updateStatus: 'up_to_date' | 'update_available' | 'requires_update' | 'offline' | 'unknown'
    autoUpdate: boolean
    updateState?: string | null
    updateMessage?: string | null
    updateProgress?: number | null
    updateLogs?: string[]
    serviceName?: string | null
    lastSeen?: string | null
}

type MacroMergeClassification = 'identical' | 'template_only' | 'remote_only' | 'conflict'

interface MacroMergeSection {
    sectionHeader: string
    sectionType?: string
    classification: MacroMergeClassification
    defaultChoice?: 'template' | 'source'
    defaultSelected?: boolean
    templateContent?: string | null
    sourceContent?: string | null
    hasDiff?: boolean
    choice?: 'template' | 'source'
    selected?: boolean
}

interface MacroMergeSummary {
    totalSections: number
    identicalSections: number
    templateOnlySections: number
    remoteOnlySections: number
    conflictSections: number
}

interface MigrationCandidate {
    templateId: string
    templateName: string
    filename: string
    currentVersion: string
    currentContent?: string
    proposedVersion: string
    sourcePath: string
    sourcePathBound?: string
    matchType?: string
    matchAmbiguous?: boolean
    matchCandidateCount?: number
    content: string
    contentHash: string
    reviewMode?: 'migration' | 'macro_merge'
    hasContentChanges?: boolean
    sourceContent?: string | null
    macroMergeSummary?: MacroMergeSummary
    macroSections?: MacroMergeSection[]
    verificationSummary?: {
        totalChecks: number
        matchedChecks: number
        missingChecks: number
        mismatchedChecks: number
        pinChecks: number
        pinMatched: number
        positionChecks: number
        positionMatched: number
        issues: Array<{
            type: 'missing' | 'mismatch'
            section: string
            parameter: string
            expected: string
            actual?: string | null
            category: 'pin' | 'position' | 'other'
        }>
        mappings: Array<{
            section: string
            parameter: string
            sourceValue: string
            newValue: string | null
            status: 'matched' | 'missing' | 'mismatch'
            category: 'pin' | 'position' | 'other'
        }>
    }
    lineDecisions?: Record<string, boolean>
    decision?: 'accepted' | 'declined' | null
}

interface DiffOperation {
    type: 'equal' | 'add' | 'remove'
    line: string
    index: number
}

@Component
export default class ConfigSync extends Mixins(BaseMixin) {
    // Data
    templates: ConfigTemplate[] = []
    printerStatuses: PrinterStatus[] = []
    loading = false
    saving = false
    deleting = false
    syncingPrinter: string | null = null
    migratingPrinter: string | null = null
    downloadingPrinter: string | null = null
    applyingMigration = false
    syncConfigsDialog = false
    syncConfigsPrinter: PrinterStatus | null = null
    syncConfigsSelection: Record<string, boolean> = {}
    backupsDialog = false
    backupsPrinter: PrinterStatus | null = null
    backupEntries: ConfigMigrationBackupEntry[] = []
    backupsLoading = false
    loadingBackupsPrinter: string | null = null
    restoringBackupId: string | null = null

    // Dialog states
    templateDialog = false
    deleteDialog = false
    editingTemplate: ConfigTemplate | null = null
    templateToDelete: ConfigTemplate | null = null
    templateFile: File | null = null

    // Form data
    templateForm = {
        name: '',
        filename: '',
        sourcePath: '',
        version: '1.0',
        description: '',
        content: '',
    }

    // Snackbar
    snackbar = false
    snackbarText = ''
    snackbarColor = 'success'

    templateHeaders = [
        { text: 'Template', value: 'name', sortable: true },
        { text: 'Version', value: 'version', sortable: true },
        { text: 'Last Updated', value: 'updatedAt', sortable: true },
        { text: 'Actions', value: 'actions', sortable: false, width: '160px' },
    ]

    // Fleet client version data
    clientStatuses: ClientStatus[] = []
    latestClientVersion = ''
    minClientVersion = ''
    clientVersionChangelog = ''
    clientVersionReleased = ''
    loadingClientStatus = false
    updatingPrinter: string | null = null
    restartingPrinter: string | null = null
    updatingAll = false
    togglingAutoUpdate: string | null = null
    clientStatusPollTimer: number | null = null

    // Migration review state
    migrationDialog = false
    migrationPrinter: PrinterStatus | null = null
    migrationCandidates: MigrationCandidate[] = []
    migrationUnmatchedTemplates: Array<{ templateName: string; filename: string; sourcePath?: string; reason: string }> = []
    migrationVerificationConfirmed = false
    lineReviewDialog = false
    lineReviewCandidateId: string | null = null
    lineReviewOps: DiffOperation[] = []
    readonly idexConfigFilenameAliases: string[] = [
        'mainsail-idex.cfg',
        'mainsail_idex.cfg',
        'mainsaild_idex.cfg',
        'mainsaild-idex.cfg',
    ]

    get lineReviewCandidate(): MigrationCandidate | null {
        if (!this.lineReviewCandidateId) return null
        return this.migrationCandidates.find((candidate: MigrationCandidate) => candidate.templateId === this.lineReviewCandidateId) || null
    }

    get allMigrationCandidatesReviewed(): boolean {
        return this.migrationCandidates.length > 0 && this.migrationCandidates.every(c => !!c.decision)
    }

    get acceptedMigrationCandidates(): MigrationCandidate[] {
        return this.migrationCandidates.filter(c => c.decision === 'accepted')
    }

    get declinedMigrationCandidates(): MigrationCandidate[] {
        return this.migrationCandidates.filter(c => c.decision === 'declined')
    }

    get isTemplateFormValid(): boolean {
        const hasName = !!this.templateForm.name.trim()
        const hasVersion = !!this.templateForm.version.trim()

        if (this.editingTemplate) {
            return hasName && hasVersion && !!this.templateForm.filename.trim() && !!this.templateForm.content.trim()
        }

        return hasName && hasVersion && !!this.templateFile && !!this.templateForm.filename.trim() && !!this.templateForm.content.trim()
    }

    get onlinePrintersCount(): number {
        return this.printerStatuses.filter(p => p.isOnline).length
    }

    get hasOutdatedClients(): boolean {
        return this.clientStatuses.some(
            c => c.isOnline && (c.updateStatus === 'update_available' || c.updateStatus === 'requires_update')
        )
    }

    get syncConfigsTemplates(): TemplateStatus[] {
        return this.syncConfigsPrinter?.templates || []
    }

    get selectedSyncConfigIds(): string[] {
        return Object.keys(this.syncConfigsSelection).filter((templateId: string) => !!this.syncConfigsSelection[templateId])
    }

    migrationTemplateOptions(printer: PrinterStatus): TemplateStatus[] {
        return (printer.templates || [])
            .filter((template: TemplateStatus) => !!template.templateId)
            .slice()
            .sort((left: TemplateStatus, right: TemplateStatus) => {
                const leftLabel = `${left.templateName || ''}|${left.filename || ''}`.toLowerCase()
                const rightLabel = `${right.templateName || ''}|${right.filename || ''}`.toLowerCase()
                return leftLabel.localeCompare(rightLabel)
            })
    }

    mounted() {
        this.refreshData()
        this.loadClientStatus()
    }

    beforeDestroy() {
        this.stopClientStatusPolling()
    }

    get normalizedToken(): string {
        const token =
            (this.$store.getters['auth/token'] as string | null) ?? localStorage.getItem('fleet_token') ?? ''

        return token.replace(/^Bearer\s+/i, '').trim()
    }

    get authHeaders(): Record<string, string> {
        if (!this.normalizedToken) return {}

        return {
            Authorization: `Bearer ${this.normalizedToken}`,
        }
    }

    async handleUnauthorized() {
        this.showError('Session expired. Please log in again.')
        await this.$store.dispatch('auth/logout')
        this.$router.push({ path: '/login', query: { redirect: this.$route.fullPath } })
    }

    async refreshData() {
        this.loading = true
        try {
            await Promise.all([
                this.loadTemplates(),
                this.loadSyncStatus(),
            ])
        } finally {
            this.loading = false
        }
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/config-sync/templates', {
                headers: this.authHeaders,
            })
            if (response.ok) {
                const data = await response.json()
                this.templates = data.templates || []
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                this.showError('Failed to load templates')
            }
        } catch (error) {
            console.error('Error loading templates:', error)
            this.showError('Failed to load templates')
        }
    }

    async loadSyncStatus() {
        try {
            const response = await fetch('/api/config-sync/status', {
                headers: this.authHeaders,
            })
            if (response.ok) {
                const data = await response.json()
                this.printerStatuses = (data.printers || []).map((printer: PrinterStatus) => ({
                    ...printer,
                    configFiles: undefined,
                    configFilesError: undefined,
                    configFilesLoading: false,
                    configFilesLoaded: false,
                    configFileEntries: [],
                    migrationPendingVerification: false,
                }))

                void this.prefetchOnlinePrinterConfigFiles()
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                this.showError('Failed to load sync status')
            }
        } catch (error) {
            console.error('Error loading sync status:', error)
        }
    }

    setPrinterConfigFileState(
        printerId: string,
        configFiles: string[],
        configFilesError?: string,
        configFilesLoading = false,
        configFileEntries: ConfigSnapshotFile[] = [],
        configFilesLoaded = true
    ) {
        const idx = this.printerStatuses.findIndex((printer: PrinterStatus) => printer.printerId === printerId)
        if (idx === -1) return

        const updated = {
            ...this.printerStatuses[idx],
            configFiles,
            configFilesError,
            configFilesLoading,
            configFileEntries,
            configFilesLoaded,
        }
        this.printerStatuses.splice(idx, 1, updated)
    }

    setPrinterMigrationPending(printerId: string, pending: boolean) {
        const idx = this.printerStatuses.findIndex((printer: PrinterStatus) => printer.printerId === printerId)
        if (idx === -1) return

        const updated = {
            ...this.printerStatuses[idx],
            migrationPendingVerification: pending,
        }
        this.printerStatuses.splice(idx, 1, updated)
    }

    async prefetchOnlinePrinterConfigFiles() {
        const onlinePrinters = this.printerStatuses.filter((printer: PrinterStatus) => printer.isOnline)
        await Promise.all(onlinePrinters.map((printer: PrinterStatus) => this.loadPrinterConfigFiles(printer.printerId)))
    }

    async loadPrinterConfigFiles(printerId: string) {
        const printer = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printerId)
        if (!printer || !printer.isOnline) return

        this.setPrinterConfigFileState(
            printerId,
            printer.configFiles || [],
            undefined,
            true,
            printer.configFileEntries || [],
            !!printer.configFilesLoaded
        )

        try {
            const requestHeaders = {
                ...this.authHeaders,
                'Content-Type': 'application/json',
            }

            const fetchSnapshot = async (filenames: string[]) => {
                return fetch(`/api/config-sync/snapshot/${printerId}`, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify({
                        filenames,
                        includeDependencies: true,
                    }),
                })
            }

            const snapshotRequests: string[][] = [
                ['printer.cfg', 'mainsail-idex.cfg'],
                ['printer.cfg', 'mainsail_idex.cfg'],
                ['printer.cfg', 'mainsaild_idex.cfg'],
                ['printer.cfg', 'mainsaild-idex.cfg'],
                ['printer.cfg'],
            ]

            let response: Response | null = null
            for (const filenames of snapshotRequests) {
                response = await fetchSnapshot(filenames)
                if (response.status !== 404) {
                    break
                }
            }

            if (!response) {
                this.setPrinterConfigFileState(printerId, [], 'Failed to fetch files', false, [], true)
                return
            }

            if (!response.ok) {
                if (response.status === 504) {
                    const debugMessage = await this.getConfigFetchDebugMessage(printerId, 'Timed out fetching files')
                    this.setPrinterConfigFileState(printerId, [], debugMessage, false, [], true)
                } else if (response.status === 426) {
                    this.setPrinterConfigFileState(
                        printerId,
                        [],
                        'Fleet client needs update for config file listing',
                        false,
                        [],
                        true
                    )
                } else {
                    const debugMessage = await this.getConfigFetchDebugMessage(printerId, 'Failed to fetch files')
                    this.setPrinterConfigFileState(printerId, [], debugMessage, false, [], true)
                }
                return
            }

            const payload = await response.json()
            const entries: ConfigSnapshotFile[] = (payload.files || [])
                .map((file: { path?: string; content?: string; content_hash?: string }) => ({
                    path: file.path || '',
                    content: file.content,
                    contentHash: file.content_hash,
                }))
                .filter((file: ConfigSnapshotFile) => !!file.path)

            const uniqueEntriesByPath = new Map<string, ConfigSnapshotFile>()
            entries.forEach((entry: ConfigSnapshotFile) => {
                if (!uniqueEntriesByPath.has(entry.path)) {
                    uniqueEntriesByPath.set(entry.path, entry)
                }
            })

            const uniqueEntries = Array.from(uniqueEntriesByPath.values())
            const files: string[] = uniqueEntries.map((file: ConfigSnapshotFile) => file.path)
            const uniqueFiles: string[] = Array.from(new Set<string>(files)).sort((a, b) => a.localeCompare(b))

            this.setPrinterConfigFileState(printerId, uniqueFiles, undefined, false, uniqueEntries, true)
        } catch (error) {
            console.error(`Error loading config files for ${printerId}:`, error)
            this.setPrinterConfigFileState(printerId, [], 'Failed to fetch files', false, [], true)
        }
    }

    normalizeConfigPath(path: string): string {
        return path.replace(/^\/+/, '').replace(/\\/g, '/').trim()
    }

    isRuntimeBackupTargetPath(path: string): boolean {
        const baseName = this.getBasename(path).toLowerCase()
        if (baseName === 'printer.cfg') return true
        return this.isIdexConfigBasename(baseName)
    }

    buildBackupCandidatesForApply(): Array<{ templateId: string; sourcePath: string; sourceContent: string; proposedVersion: string }> {
        const requests = new Map<string, { templateId: string; sourcePath: string; sourceContent: string; proposedVersion: string }>()

        this.migrationCandidates.forEach((candidate: MigrationCandidate) => {
            const sourcePath = this.normalizeConfigPath(candidate.sourcePath || '')
            const sourceContent = candidate.sourceContent || ''

            if (!candidate.templateId || !sourcePath || !sourceContent) return
            if (!this.isRuntimeBackupTargetPath(sourcePath)) return

            const key = `${candidate.templateId}:${sourcePath}`
            requests.set(key, {
                templateId: candidate.templateId,
                sourcePath,
                sourceContent,
                proposedVersion: candidate.proposedVersion,
            })
        })

        return Array.from(requests.values())
    }

    isIdexConfigBasename(filename: string): boolean {
        const normalized = (filename || '').trim().toLowerCase()
        return this.idexConfigFilenameAliases.includes(normalized)
    }

    expandConfigPathAliases(path: string): string[] {
        const normalized = this.normalizeConfigPath(path)
        if (!normalized) return []

        const fileBasename = this.getBasename(normalized).toLowerCase()
        if (!this.isIdexConfigBasename(fileBasename)) {
            return [normalized]
        }

        const dirname = this.getDirname(normalized)
        return Array.from(new Set(this.idexConfigFilenameAliases.map((alias: string) => (
            dirname ? `${dirname}/${alias}` : alias
        ))))
    }

    getBasename(path: string): string {
        const normalized = this.normalizeConfigPath(path)
        const parts = normalized.split('/')
        return parts[parts.length - 1] || normalized
    }

    getDirname(path: string): string {
        const normalized = this.normalizeConfigPath(path)
        const parts = normalized.split('/')
        parts.pop()
        return parts.join('/')
    }

    decodeBase64Utf8(encoded: string): string {
        const binary = atob(encoded)
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
        return new TextDecoder().decode(bytes)
    }

    sanitizeFilenamePart(value: string): string {
        return (value || 'printer').replace(/[^a-zA-Z0-9._-]+/g, '_')
    }

    async downloadRunningConfigs(printer: PrinterStatus) {
        if (!printer.isOnline) {
            this.showError('Printer is offline')
            return
        }

        this.downloadingPrinter = printer.printerId

        try {
            const response = await fetch(`/api/config-sync/snapshot/${printer.printerId}`, {
                method: 'POST',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filenames: ['printer.cfg'],
                    includeDependencies: true,
                }),
            })

            if (!response.ok) {
                if (response.status === 401) {
                    await this.handleUnauthorized()
                    return
                }

                if (response.status === 504) {
                    const debugMessage = await this.getConfigFetchDebugMessage(
                        printer.printerId,
                        'Timed out fetching files for download'
                    )
                    this.showError(debugMessage)
                    return
                }

                if (response.status === 426) {
                    this.showError('Fleet client needs update for config file download')
                    return
                }

                const payload = await response.json().catch(() => ({}))
                this.showError(payload.error || 'Failed to fetch running configs')
                return
            }

            const payload = await response.json()
            const entries: ConfigSnapshotFile[] = (payload.files || [])
                .map((file: { path?: string; content?: string; content_hash?: string }) => ({
                    path: file.path || '',
                    content: file.content,
                    contentHash: file.content_hash,
                }))
                .filter((file: ConfigSnapshotFile) => !!file.path && !!file.content)

            if (!entries.length) {
                this.showError('No config files available to download')
                return
            }

            const uniqueEntriesByPath = new Map<string, ConfigSnapshotFile>()
            entries.forEach((entry: ConfigSnapshotFile) => {
                const normalizedPath = this.normalizeConfigPath(entry.path)
                if (!uniqueEntriesByPath.has(normalizedPath)) {
                    uniqueEntriesByPath.set(normalizedPath, { ...entry, path: normalizedPath })
                }
            })

            const uniqueEntries = Array.from(uniqueEntriesByPath.values()).sort((a, b) => a.path.localeCompare(b.path))
            const zip = new JSZip()

            uniqueEntries.forEach((entry: ConfigSnapshotFile) => {
                if (!entry.content) return
                const decodedContent = this.decodeBase64Utf8(entry.content)
                zip.file(entry.path, decodedContent)
            })

            if (Object.keys(zip.files).length === 0) {
                this.showError('No valid config files could be decoded for download')
                return
            }

            const blob = await zip.generateAsync({ type: 'blob' })
            const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
            const baseName = this.sanitizeFilenamePart(printer.printerName || printer.printerId)
            const archiveName = `${baseName}-klipper-configs-${timestamp}.zip`

            const link = document.createElement('a')
            const url = URL.createObjectURL(blob)
            link.href = url
            link.download = archiveName
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)

            const files: string[] = uniqueEntries.map((entry: ConfigSnapshotFile) => entry.path)
            this.setPrinterConfigFileState(printer.printerId, files, undefined, false, uniqueEntries, true)

            this.showSuccess(`Downloaded ${files.length} running config file(s) for ${printer.printerName}`)
        } catch (error) {
            console.error('Error downloading running configs:', error)
            this.showError('Failed to download running configs')
        } finally {
            this.downloadingPrinter = null
        }
    }

    findConfigEntryForTemplate(printer: PrinterStatus, template: TemplateStatus): ConfigSnapshotFile | null {
        const entries = printer.configFileEntries || []
        if (!entries.length) return null

        const candidatePaths = [template.sourcePath || '', template.filename || '', template.templateName || '']
            .map((value: string) => this.normalizeConfigPath(value))
            .filter((value: string, index: number, source: string[]) => !!value && source.indexOf(value) === index)

        const expandedCandidatePaths = candidatePaths
            .flatMap((candidatePath: string) => this.expandConfigPathAliases(candidatePath))
            .filter((value: string, index: number, source: string[]) => !!value && source.indexOf(value) === index)

        for (const candidatePath of expandedCandidatePaths) {
            const exactMatch = entries.find(
                (entry: ConfigSnapshotFile) => this.normalizeConfigPath(entry.path) === candidatePath
            )
            if (exactMatch) return exactMatch
        }

        for (const candidatePath of expandedCandidatePaths) {
            const candidateBasename = this.getBasename(candidatePath).toLowerCase()
            if (!candidateBasename) continue

            const basenameMatches = entries
                .filter((entry: ConfigSnapshotFile) => {
                    const entryBasename = this.getBasename(entry.path).toLowerCase()
                    if (entryBasename === candidateBasename) {
                        return true
                    }

                    if (!this.isIdexConfigBasename(candidateBasename)) {
                        return false
                    }

                    return this.isIdexConfigBasename(entryBasename)
                })
                .sort((left: ConfigSnapshotFile, right: ConfigSnapshotFile) =>
                    this.normalizeConfigPath(left.path).localeCompare(this.normalizeConfigPath(right.path))
                )

            if (basenameMatches.length > 0) {
                return basenameMatches[0]
            }
        }

        return null
    }

    async openTemplateFileFromPrinter(printer: PrinterStatus, template: TemplateStatus) {
        if (!printer.isOnline) {
            this.showError('Printer is offline')
            return
        }

        let currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)

        if (!currentPrinter?.configFilesLoaded || !currentPrinter.configFileEntries?.length) {
            await this.loadPrinterConfigFiles(printer.printerId)
            currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)
        }

        if (!currentPrinter) {
            this.showError('Printer status not found')
            return
        }

        const configEntry = this.findConfigEntryForTemplate(currentPrinter, template)
        if (!configEntry) {
            const boundLabel = template.sourcePath ? ` (bound: ${template.sourcePath})` : ''
            this.showError(`No matching config file for template "${template.templateName}"${boundLabel}`)
            return
        }

        if (!configEntry.content) {
            this.showError('Config content unavailable from printer snapshot')
            return
        }

        try {
            const content = this.decodeBase64Utf8(configEntry.content)
            const normalizedPath = this.normalizeConfigPath(configEntry.path)

            this.$store.commit('editor/setPermissions', 'r')
            this.$store.commit('editor/openFile', {
                filename: this.getBasename(normalizedPath),
                fileroot: 'config',
                filepath: this.getDirname(normalizedPath),
                file: content,
            })
            this.$store.commit('editor/showEditor')
        } catch (error) {
            console.error('Failed to open template config file in editor:', error)
            this.showError('Failed to open config file')
        }
    }

    async openConfigFileFromPrinter(printer: PrinterStatus, configPath: string) {
        if (!printer.isOnline) {
            this.showError('Printer is offline')
            return
        }

        let currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)
        if (!currentPrinter?.configFilesLoaded || !currentPrinter.configFileEntries?.length) {
            await this.loadPrinterConfigFiles(printer.printerId)
            currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)
        }

        if (!currentPrinter) {
            this.showError('Printer status not found')
            return
        }

        const normalizedTargetPath = this.normalizeConfigPath(configPath)
        const configEntry = (currentPrinter.configFileEntries || []).find(
            (entry: ConfigSnapshotFile) => this.normalizeConfigPath(entry.path) === normalizedTargetPath
        )

        if (!configEntry?.content) {
            this.showError(`Config content unavailable for "${configPath}"`)
            return
        }

        try {
            const content = this.decodeBase64Utf8(configEntry.content)
            const normalizedPath = this.normalizeConfigPath(configEntry.path)

            this.$store.commit('editor/setPermissions', 'r')
            this.$store.commit('editor/openFile', {
                filename: this.getBasename(normalizedPath),
                fileroot: 'config',
                filepath: this.getDirname(normalizedPath),
                file: content,
            })
            this.$store.commit('editor/showEditor')
        } catch (error) {
            console.error('Failed to open config file in editor:', error)
            this.showError('Failed to open config file')
        }
    }

    isMacroMergeCandidate(candidate: MigrationCandidate): boolean {
        return candidate.reviewMode === 'macro_merge'
    }

    initializeMacroMergeSections(candidate: MigrationCandidate) {
        if (!this.isMacroMergeCandidate(candidate)) return

        const normalizedSections = (candidate.macroSections || []).map((section: MacroMergeSection) => {
            const defaultChoice = section.defaultChoice === 'source' ? 'source' : 'template'
            const hasTemplate = !!section.templateContent
            const hasSource = !!section.sourceContent
            const normalizedChoice = section.choice || defaultChoice

            let choice: 'template' | 'source' = normalizedChoice === 'source' ? 'source' : 'template'
            if (choice === 'source' && !hasSource && hasTemplate) {
                choice = 'template'
            }
            if (choice === 'template' && !hasTemplate && hasSource) {
                choice = 'source'
            }

            const defaultSelected = typeof section.defaultSelected === 'boolean' ? section.defaultSelected : section.classification !== 'remote_only'
            const selected = typeof section.selected === 'boolean' ? section.selected : defaultSelected

            return {
                ...section,
                choice,
                selected,
            }
        })

        candidate.macroSections = normalizedSections
        this.refreshMacroMergeCandidateContent(candidate)
    }

    buildCandidateContentFromMacroSections(candidate: MigrationCandidate): string {
        const sections = candidate.macroSections || []
        const merged: string[] = []

        sections.forEach((section: MacroMergeSection) => {
            if (!section.selected) return
            const preferred = section.choice === 'source' ? section.sourceContent : section.templateContent
            const fallback = section.templateContent || section.sourceContent || ''
            const chosen = (preferred || fallback || '').trim()
            if (chosen) {
                merged.push(chosen)
            }
        })

        return merged.join('\n\n')
    }

    refreshMacroMergeCandidateContent(candidate: MigrationCandidate) {
        if (!this.isMacroMergeCandidate(candidate)) return
        const rebuilt = this.buildCandidateContentFromMacroSections(candidate)
        candidate.content = rebuilt
        candidate.contentHash = ''
        candidate.hasContentChanges = rebuilt !== (candidate.currentContent || '')
    }

    setMacroSectionSelected(candidate: MigrationCandidate, sectionHeader: string, selected: boolean) {
        if (!this.isMacroMergeCandidate(candidate)) return
        const sections = candidate.macroSections || []
        candidate.macroSections = sections.map((section: MacroMergeSection) => {
            if (section.sectionHeader !== sectionHeader) return section
            return {
                ...section,
                selected: !!selected,
            }
        })
        this.refreshMacroMergeCandidateContent(candidate)
    }

    setMacroSectionChoice(candidate: MigrationCandidate, sectionHeader: string, choice: 'template' | 'source') {
        if (!this.isMacroMergeCandidate(candidate)) return
        const sections = candidate.macroSections || []
        candidate.macroSections = sections.map((section: MacroMergeSection) => {
            if (section.sectionHeader !== sectionHeader) return section
            const hasTemplate = !!section.templateContent
            const hasSource = !!section.sourceContent
            const safeChoice = choice === 'source'
                ? (hasSource ? 'source' : 'template')
                : (hasTemplate ? 'template' : 'source')

            return {
                ...section,
                choice: safeChoice,
                selected: true,
            }
        })
        this.refreshMacroMergeCandidateContent(candidate)
    }

    macroSectionDecisionPayload(candidate: MigrationCandidate): Array<{ sectionHeader: string; selected: boolean; choice: 'template' | 'source' }> {
        return (candidate.macroSections || []).map((section: MacroMergeSection) => ({
            sectionHeader: section.sectionHeader,
            selected: !!section.selected,
            choice: section.choice === 'source' ? 'source' : 'template',
        }))
    }

    getMacroSectionStatusColor(classification: MacroMergeClassification): string {
        if (classification === 'conflict') return 'warning'
        if (classification === 'remote_only') return 'info'
        if (classification === 'template_only') return 'primary'
        return 'success'
    }

    formatMacroMergeSummary(candidate: MigrationCandidate): string {
        const summary = candidate.macroMergeSummary
        if (!summary) {
            return 'No macro section summary available'
        }
        return `Sections: ${summary.totalSections} total · ${summary.conflictSections} conflicts · ${summary.remoteOnlySections} remote-only · ${summary.templateOnlySections} template-only`
    }

    openMigrationCandidateInEditor(candidate: MigrationCandidate) {
        const normalizedPath = this.normalizeConfigPath(candidate.filename || `${candidate.templateName}.cfg`)
        const templateContent = candidate.currentContent || ''
        const newContent = this.isMacroMergeCandidate(candidate)
            ? (this.buildCandidateContentFromMacroSections(candidate) || candidate.content || '')
            : (candidate.content || '')

        if (candidate.hasContentChanges === false) {
            this.$store.commit('editor/setPermissions', 'r')
            this.$store.commit('editor/openFile', {
                filename: this.getBasename(normalizedPath),
                fileroot: 'config',
                filepath: this.getDirname(normalizedPath),
                file: newContent,
            })
            this.$store.commit('editor/showEditor')
            return
        }

        const remotePath = this.normalizeConfigPath(candidate.sourcePath || candidate.filename || normalizedPath)
        const remoteFilename = this.getBasename(remotePath)
        const remoteContent = candidate.sourceContent || newContent || ''
        const remoteHost = this.migrationPrinter?.printerHost || this.migrationPrinter?.printerName || this.migrationPrinter?.printerId || 'unknown-host'

        this.$store.commit('editor/setPermissions', 'r')
        this.$store.commit('editor/openFile', {
            filename: `${this.getBasename(normalizedPath)}.review`,
            fileroot: 'config',
            filepath: this.getDirname(normalizedPath),
            file: templateContent,
            splitMode: true,
            splitLeftTitle: `Template · ${this.getBasename(normalizedPath)}`,
            splitRightTitle: `${remoteFilename} · ${remoteHost}`,
            splitLeftFilename: this.getBasename(normalizedPath),
            splitRightFilename: remoteFilename,
            splitLeftContent: templateContent,
            splitRightContent: remoteContent,
        })
        this.$store.commit('editor/showEditor')
    }

    buildDiffOperations(oldContent: string, newContent: string): DiffOperation[] {
        const oldLines = oldContent.split('\n')
        const newLines = newContent.split('\n')
        const n = oldLines.length
        const m = newLines.length

        const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    lcs[i][j] = lcs[i - 1][j - 1] + 1
                } else {
                    lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
                }
            }
        }

        const ops: Array<{ type: 'equal' | 'add' | 'remove'; line: string }> = []
        let i = n
        let j = m

        while (i > 0 && j > 0) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                ops.push({ type: 'equal', line: oldLines[i - 1] })
                i--
                j--
            } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
                ops.push({ type: 'remove', line: oldLines[i - 1] })
                i--
            } else {
                ops.push({ type: 'add', line: newLines[j - 1] })
                j--
            }
        }

        while (i > 0) {
            ops.push({ type: 'remove', line: oldLines[i - 1] })
            i--
        }
        while (j > 0) {
            ops.push({ type: 'add', line: newLines[j - 1] })
            j--
        }

        ops.reverse()
        return ops.map((op, index) => ({ ...op, index }))
    }

    openLineReviewDialog(candidate: MigrationCandidate) {
        if (candidate.reviewMode !== 'migration') {
            return
        }
        this.initializeLineDecisions(candidate)
        const allOps = this.buildDiffOperations(candidate.currentContent || '', candidate.content || '')
        this.lineReviewOps = allOps.filter((op: DiffOperation) => op.type !== 'equal')
        this.lineReviewCandidateId = candidate.templateId
        this.lineReviewDialog = true
    }

    closeLineReviewDialog() {
        this.lineReviewDialog = false
        this.lineReviewCandidateId = null
        this.lineReviewOps = []
    }

    initializeLineDecisions(candidate: MigrationCandidate) {
        if (candidate.lineDecisions) return
        const decisions: Record<string, boolean> = {}
        const ops = this.buildDiffOperations(candidate.currentContent || '', candidate.content || '')
        ops.forEach((op: DiffOperation) => {
            if (op.type !== 'equal') {
                decisions[String(op.index)] = true
            }
        })
        candidate.lineDecisions = decisions
    }

    isLineDecisionAccepted(candidate: MigrationCandidate, opIndex: number): boolean {
        this.initializeLineDecisions(candidate)
        return !!candidate.lineDecisions?.[String(opIndex)]
    }

    setLineDecision(candidate: MigrationCandidate, opIndex: number, accepted: boolean) {
        this.initializeLineDecisions(candidate)
        candidate.lineDecisions = {
            ...(candidate.lineDecisions || {}),
            [String(opIndex)]: !!accepted,
        }
    }

    rebuildCandidateContentWithLineDecisions(candidate: MigrationCandidate): string {
        this.initializeLineDecisions(candidate)
        const ops = this.buildDiffOperations(candidate.currentContent || '', candidate.content || '')
        const result: string[] = []

        ops.forEach((op: DiffOperation) => {
            if (op.type === 'equal') {
                result.push(op.line)
                return
            }

            const accepted = !!candidate.lineDecisions?.[String(op.index)]
            if (op.type === 'add') {
                if (accepted) result.push(op.line)
                return
            }

            if (!accepted) {
                result.push(op.line)
            }
        })

        return result.join('\n')
    }

    applyLineReviewSelections() {
        const candidate = this.lineReviewCandidate
        if (!candidate) return

        const rebuilt = this.rebuildCandidateContentWithLineDecisions(candidate)
        candidate.content = rebuilt
        candidate.contentHash = ''
        candidate.hasContentChanges = rebuilt !== (candidate.currentContent || '')

        this.closeLineReviewDialog()
    }

    openMigrationVerificationInEditor(candidate: MigrationCandidate) {
        const normalizedPath = this.normalizeConfigPath(candidate.filename || `${candidate.templateName}.cfg`)
        const summary = candidate.verificationSummary
        if (!summary) {
            this.showError('No auto-verification summary is available for this candidate')
            return
        }

        const lines = [
            `Template: ${candidate.templateName}`,
            `Source: ${candidate.sourcePath}`,
            `Target: ${candidate.filename}`,
            `Mode: ${candidate.reviewMode || 'migration'}`,
            '',
            `Auto-check summary: ${summary.matchedChecks}/${summary.totalChecks} values matched`,
            `Pins: ${summary.pinMatched}/${summary.pinChecks}`,
            `Positions: ${summary.positionMatched}/${summary.positionChecks}`,
            `Missing: ${summary.missingChecks}`,
            `Mismatched: ${summary.mismatchedChecks}`,
        ]

        if (summary.issues.length) {
            lines.push('', 'Issues:')
            summary.issues.forEach(issue => {
                const actualValue = issue.actual == null ? '(missing)' : issue.actual
                lines.push(
                    `- [${issue.category}] [${issue.section}] ${issue.parameter}: expected ${issue.expected} | actual ${actualValue}`
                )
            })
        } else {
            lines.push('', 'All migratable source pin and position values were preserved in the proposed file.')
        }

        this.$store.commit('editor/setPermissions', 'r')
        this.$store.commit('editor/openFile', {
            filename: `${this.getBasename(normalizedPath)}.verification.txt`,
            fileroot: 'config',
            filepath: this.getDirname(normalizedPath),
            file: lines.join('\n'),
        })
        this.$store.commit('editor/showEditor')
    }

    formatMigrationVerificationSummary(candidate: MigrationCandidate): string {
        if (this.isMacroMergeCandidate(candidate)) {
            return this.formatMacroMergeSummary(candidate)
        }

        const summary = candidate.verificationSummary
        if (!summary || summary.totalChecks === 0) {
            return 'No auto-verifiable pin or position values found'
        }

        if (summary.missingChecks || summary.mismatchedChecks) {
            return `Auto-check: ${summary.matchedChecks}/${summary.totalChecks} matched, ${summary.missingChecks} missing, ${summary.mismatchedChecks} mismatched`
        }

        return `Auto-check: ${summary.matchedChecks}/${summary.totalChecks} matched`
    }

    getMigrationVerificationTextClass(candidate: MigrationCandidate): string {
        if (this.isMacroMergeCandidate(candidate)) {
            const summary = candidate.macroMergeSummary
            if (!summary) return 'grey--text'
            return summary.conflictSections > 0 ? 'warning--text' : 'info--text'
        }

        const summary = candidate.verificationSummary
        if (!summary || summary.totalChecks === 0) {
            return 'grey--text'
        }

        if (summary.missingChecks || summary.mismatchedChecks) {
            return 'error--text'
        }

        return 'success--text'
    }

    getPinMappingRowClass(status: string): string {
        if (status === 'mismatch') return 'pin-row-mismatch'
        if (status === 'missing') return 'pin-row-missing'
        return ''
    }

    setMigrationDecision(candidate: MigrationCandidate, decision: 'accepted' | 'declined') {
        if (this.isMacroMergeCandidate(candidate)) {
            this.initializeMacroMergeSections(candidate)
        }
        candidate.decision = decision
    }

    buildUnifiedDiff(oldContent: string, newContent: string, oldLabel: string, newLabel: string): string {
        const ops = this.buildDiffOperations(oldContent, newContent)

        const body = ops.map(op => {
            if (op.type === 'add') return `+${op.line}`
            if (op.type === 'remove') return `-${op.line}`
            return ` ${op.line}`
        })

        return [`--- ${oldLabel}`, `+++ ${newLabel}`, '@@', ...body].join('\n')
    }

    async openTemplateInEditor(template: ConfigTemplate) {
        try {
            const response = await fetch(`/api/config-sync/templates/${template.id}`, {
                headers: this.authHeaders,
            })

            if (!response.ok) {
                if (response.status === 401) {
                    await this.handleUnauthorized()
                } else {
                    this.showError('Failed to load template content')
                }
                return
            }

            const data = await response.json()
            const fullTemplate = data.template || template
            const content = fullTemplate.content || ''
            const normalizedPath = this.normalizeConfigPath(fullTemplate.filename || template.filename)

            this.$store.commit('editor/setPermissions', 'r')
            this.$store.commit('editor/openFile', {
                filename: this.getBasename(normalizedPath),
                fileroot: 'config',
                filepath: this.getDirname(normalizedPath),
                file: content,
            })
            this.$store.commit('editor/showEditor')
        } catch (error) {
            console.error('Failed to open template in editor:', error)
            this.showError('Failed to open template in editor')
        }
    }

    closeMigrationDialog(clearPending = true) {
        if (clearPending && this.migrationPrinter?.printerId) {
            this.setPrinterMigrationPending(this.migrationPrinter.printerId, false)
        }

        this.migrationDialog = false
        this.migrationPrinter = null
        this.migrationCandidates = []
        this.migrationUnmatchedTemplates = []
        this.migrationVerificationConfirmed = false
    }

    async startMigrationReview(printer: PrinterStatus, templateIds: string[] = [], templateLabel: string | null = null) {
        if (!printer.isOnline) {
            this.showError('Printer is offline')
            return
        }

        this.migratingPrinter = printer.printerId

        try {
            let currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)
            if (!currentPrinter?.configFilesLoaded || !currentPrinter.configFileEntries?.length) {
                await this.loadPrinterConfigFiles(printer.printerId)
                currentPrinter = this.printerStatuses.find((p: PrinterStatus) => p.printerId === printer.printerId)
            }

            const files = (currentPrinter?.configFileEntries || []).filter(
                (entry: ConfigSnapshotFile) => !!entry.path && !!entry.content
            )

            if (!files.length) {
                this.showError('No running config files available for migration review')
                return
            }

            const response = await fetch('/api/config-sync/migrate-preview', {
                method: 'POST',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    printerId: printer.printerId,
                    sourceType: 'runtime',
                    files,
                    templateIds: templateIds.length ? templateIds : undefined,
                }),
            })

            if (response.ok) {
                const payload = await response.json()
                const candidates: MigrationCandidate[] = (payload.candidates || []).map((candidate: MigrationCandidate) => ({
                    ...candidate,
                    decision: null,
                })).map((candidate: MigrationCandidate) => {
                    this.initializeMacroMergeSections(candidate)
                    return candidate
                })

                this.migrationUnmatchedTemplates = payload.unmatchedTemplates || []

                if (!candidates.length) {
                    const templateScopeLabel = templateLabel ? ` for ${templateLabel}` : ''
                    const unmatchedCount = this.migrationUnmatchedTemplates.length
                    if (unmatchedCount > 0) {
                        const previewItems = this.migrationUnmatchedTemplates
                            .slice(0, 3)
                            .map(item => `${item.templateName}: ${item.reason}`)
                            .join(' | ')
                        this.showError(`No migration changes detected${templateScopeLabel}. ${unmatchedCount} unmatched template(s): ${previewItems}`)
                    } else {
                        this.showError(`No migration changes detected${templateScopeLabel}`)
                    }
                    return
                }

                this.migrationPrinter = printer
                this.migrationCandidates = candidates
                this.migrationVerificationConfirmed = false
                this.migrationDialog = true

                candidates.forEach((c: MigrationCandidate) => {
                    console.log(
                        '[ConfigSync] candidate:', c.templateName,
                        'verificationSummary:', JSON.stringify(c.verificationSummary, null, 2)
                    )
                })
                this.setPrinterMigrationPending(printer.printerId, true)
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const payload = await response.json().catch(() => ({}))
                this.showError(payload.error || 'Failed to generate migration preview')
            }
        } catch (error) {
            console.error('Error generating migration preview:', error)
            this.showError('Failed to generate migration preview')
        } finally {
            this.migratingPrinter = null
        }
    }

    async applyAcceptedMigration() {
        if (!this.migrationPrinter) return
        if (!this.allMigrationCandidatesReviewed || !this.migrationVerificationConfirmed) {
            this.showError('Please review all diffs and set accept/decline before applying')
            return
        }
        if (this.acceptedMigrationCandidates.length === 0) {
            this.showError('No accepted changes to apply')
            return
        }

        this.applyingMigration = true

        try {
            const response = await fetch('/api/config-sync/migrate-apply', {
                method: 'POST',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    printerId: this.migrationPrinter.printerId,
                    verificationConfirmed: true,
                    backupCandidates: this.buildBackupCandidatesForApply(),
                    candidates: this.acceptedMigrationCandidates.map(candidate => ({
                        templateId: candidate.templateId,
                        reviewMode: candidate.reviewMode,
                        proposedVersion: candidate.proposedVersion,
                        sourcePath: candidate.sourcePath,
                        content: candidate.content,
                        sourceContent: candidate.sourceContent,
                        macroSectionDecisions: this.isMacroMergeCandidate(candidate)
                            ? this.macroSectionDecisionPayload(candidate)
                            : undefined,
                    })),
                }),
            })

            if (response.ok) {
                const payload = await response.json()
                const baseMessage = payload.message || 'Accepted migration changes applied'
                const backupCount = Number(payload.backupCount || 0)
                const backupSummary = backupCount > 0
                    ? ` Created ${backupCount} backup${backupCount > 1 ? 's' : ''} of running printer config files.`
                    : ''
                this.showSuccess(`${baseMessage}.${backupSummary} Run Sync Configs to push updated templates to this printer.`)
                this.setPrinterMigrationPending(this.migrationPrinter.printerId, false)
                this.closeMigrationDialog(false)
                await this.refreshData()

                if (this.backupsDialog && this.backupsPrinter?.printerId === this.migrationPrinter.printerId) {
                    await this.loadMigrationBackups(this.backupsPrinter.printerId)
                }
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const payload = await response.json().catch(() => ({}))
                this.showError(payload.error || 'Failed to apply migration')
            }
        } catch (error) {
            console.error('Error applying migration:', error)
            this.showError('Failed to apply migration')
        } finally {
            this.applyingMigration = false
        }
    }

    async getConfigFetchDebugMessage(printerId: string, fallback: string): Promise<string> {
        try {
            const response = await fetch(`/api/config-sync/snapshot-debug/${printerId}`, {
                headers: this.authHeaders,
            })

            const payload = await response.json()
            const detail = payload?.details || payload?.error || ''
            if (!detail) return fallback

            const message = `${fallback}: ${String(detail)}`
            return message.length > 180 ? `${message.slice(0, 177)}...` : message
        } catch (error) {
            console.error(`Error loading config fetch debug info for ${printerId}:`, error)
            return fallback
        }
    }

    openCreateDialog() {
        this.editingTemplate = null
        this.templateForm = {
            name: '',
            filename: '',
            sourcePath: '',
            version: '1.0',
            description: '',
            content: '',
        }
        this.templateFile = null
        this.templateDialog = true
    }

    async openEditDialog(template: ConfigTemplate) {
        this.editingTemplate = template
        
        // Load full template with content
        try {
            const response = await fetch(`/api/config-sync/templates/${template.id}`, {
                headers: this.authHeaders,
            })
            if (response.ok) {
                const data = await response.json()
                const fullTemplate = data.template
                this.templateForm = {
                    name: fullTemplate.name,
                    filename: fullTemplate.filename,
                    sourcePath: fullTemplate.sourcePath || '',
                    version: fullTemplate.version,
                    description: fullTemplate.description || '',
                    content: fullTemplate.content || '',
                }
                this.templateFile = null
                this.templateDialog = true
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                this.showError('Failed to load template')
            }
        } catch (error) {
            console.error('Error loading template:', error)
            this.showError('Failed to load template')
        }
    }

    closeTemplateDialog() {
        this.templateDialog = false
        this.editingTemplate = null
        this.templateFile = null
    }

    async onFileSelected() {
        if (this.templateFile) {
            try {
                const content = await this.templateFile.text()
                this.templateForm.content = content

                this.templateForm.filename = this.templateFile.name
            } catch (error) {
                console.error('Error reading file:', error)
                this.showError('Failed to read file')
            }
        } else {
            if (!this.editingTemplate) {
                this.templateForm.filename = ''
                this.templateForm.content = ''
            }
        }
    }

    async saveTemplate() {
        if (!this.isTemplateFormValid) return

        if (!this.editingTemplate && !this.templateFile) {
            this.showError('Please upload a config file')
            return
        }

        this.saving = true
        try {
            const url = this.editingTemplate
                ? `/api/config-sync/templates/${this.editingTemplate.id}`
                : '/api/config-sync/templates'
            const method = this.editingTemplate ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method,
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: this.templateForm.name.trim(),
                    filename: this.templateFile?.name ?? this.templateForm.filename.trim(),
                    sourcePath: this.templateForm.sourcePath.trim() || null,
                    version: this.templateForm.version.trim(),
                    description: this.templateForm.description.trim() || null,
                    content: this.templateForm.content,
                }),
            })

            if (response.ok) {
                this.showSuccess(this.editingTemplate ? 'Template updated successfully' : 'Template created successfully')
                this.closeTemplateDialog()
                await this.refreshData()
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to save template')
            }
        } catch (error) {
            console.error('Error saving template:', error)
            this.showError('Failed to save template')
        } finally {
            this.saving = false
        }
    }

    confirmDeleteTemplate(template: ConfigTemplate) {
        this.templateToDelete = template
        this.deleteDialog = true
    }

    async deleteTemplate() {
        if (!this.templateToDelete) return

        this.deleting = true
        try {
            const response = await fetch(`/api/config-sync/templates/${this.templateToDelete.id}`, {
                method: 'DELETE',
                headers: this.authHeaders,
            })

            if (response.ok) {
                this.showSuccess('Template deleted successfully')
                this.deleteDialog = false
                this.templateToDelete = null
                await this.refreshData()
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to delete template')
            }
        } catch (error) {
            console.error('Error deleting template:', error)
            this.showError('Failed to delete template')
        } finally {
            this.deleting = false
        }
    }

    async openBackupsDialog(printer: PrinterStatus) {
        this.backupsPrinter = printer
        this.backupsDialog = true
        this.loadingBackupsPrinter = printer.printerId

        try {
            await this.loadMigrationBackups(printer.printerId)
        } finally {
            this.loadingBackupsPrinter = null
        }
    }

    closeBackupsDialog() {
        this.backupsDialog = false
        this.backupsPrinter = null
        this.backupEntries = []
        this.restoringBackupId = null
    }

    async refreshBackupsDialog() {
        if (!this.backupsPrinter) return
        await this.loadMigrationBackups(this.backupsPrinter.printerId)
    }

    async loadMigrationBackups(printerId: string) {
        this.backupsLoading = true
        try {
            const response = await fetch(`/api/config-sync/backups/${printerId}?limit=50`, {
                headers: this.authHeaders,
            })

            if (response.ok) {
                const payload = await response.json()
                this.backupEntries = payload.backups || []
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const payload = await response.json().catch(() => ({}))
                this.showError(payload.error || 'Failed to load migration backups')
            }
        } catch (error) {
            console.error('Error loading migration backups:', error)
            this.showError('Failed to load migration backups')
        } finally {
            this.backupsLoading = false
        }
    }

    async restoreMigrationBackup(backup: ConfigMigrationBackupEntry) {
        if (!this.backupsPrinter) return

        const confirmed = window.confirm(
            `Restore ${backup.filename} backup from ${this.formatDateStr(backup.createdAt)}?\n\n` +
            'This updates the template content. Push Sync Configs afterwards to apply it to the printer.'
        )
        if (!confirmed) return

        this.restoringBackupId = backup.id
        try {
            const response = await fetch(`/api/config-sync/backups/${this.backupsPrinter.printerId}/restore`, {
                method: 'POST',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ backupId: backup.id }),
            })

            if (response.ok) {
                const payload = await response.json()
                this.showSuccess(payload.message || `Restored backup for ${backup.filename}`)
                await Promise.all([
                    this.loadMigrationBackups(this.backupsPrinter.printerId),
                    this.refreshData(),
                ])
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const payload = await response.json().catch(() => ({}))
                this.showError(payload.error || 'Failed to restore migration backup')
            }
        } catch (error) {
            console.error('Error restoring migration backup:', error)
            this.showError('Failed to restore migration backup')
        } finally {
            this.restoringBackupId = null
        }
    }

    openSyncConfigsDialog(printer: PrinterStatus) {
        if (!printer.isOnline) {
            this.showError('Printer is offline')
            return
        }

        if (printer.migrationPendingVerification) {
            this.showError('Verify and apply migration changes before pushing configs')
            return
        }

        this.syncConfigsPrinter = printer
        this.syncConfigsSelection = {}
        ;(printer.templates || []).forEach((tpl: TemplateStatus) => {
            this.syncConfigsSelection[tpl.templateId] = true
        })
        this.syncConfigsDialog = true
    }

    closeSyncConfigsDialog() {
        this.syncConfigsDialog = false
        this.syncConfigsPrinter = null
        this.syncConfigsSelection = {}
    }

    setSyncConfigSelection(templateId: string, selected: boolean) {
        this.syncConfigsSelection = {
            ...this.syncConfigsSelection,
            [templateId]: !!selected,
        }
    }

    async syncSelectedConfigsToPrinter() {
        const printer = this.syncConfigsPrinter
        if (!printer) return

        const selectedTemplateIds = this.selectedSyncConfigIds
        if (!selectedTemplateIds.length) {
            this.showError('Select at least one config template to sync')
            return
        }

        if (printer.migrationPendingVerification) {
            this.showError('Verify and apply migration changes before pushing configs')
            return
        }

        this.syncingPrinter = printer.printerId
        try {
            const response = await fetch(`/api/config-sync/push-all/${printer.printerId}`, {
                method: 'POST',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    templateIds: selectedTemplateIds,
                }),
            })

            if (response.ok) {
                const data = await response.json()
                this.showSuccess(data.message || 'Configs synced successfully')
                this.closeSyncConfigsDialog()
                await this.loadSyncStatus()
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to sync configs')
            }
        } catch (error) {
            console.error('Error syncing configs:', error)
            this.showError('Failed to sync configs')
        } finally {
            this.syncingPrinter = null
        }
    }

    getSyncStatusColor(status: string): string {
        switch (status) {
            case 'synced':
                return 'success'
            case 'outdated':
                return 'warning'
            case 'missing':
                return 'error'
            default:
                return 'grey'
        }
    }

    getSyncStatusIcon(status: string): string {
        switch (status) {
            case 'synced':
                return 'mdi-check-circle'
            case 'outdated':
                return 'mdi-alert-circle'
            case 'missing':
                return 'mdi-close-circle'
            default:
                return 'mdi-help-circle'
        }
    }

    formatDateStr(dateString: string): string {
        if (!dateString) return '—'
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

    // Fleet Client Version Methods
    async loadClientStatus() {
        this.loadingClientStatus = true
        try {
            const response = await fetch('/api/fleet/client-status', {
                headers: this.authHeaders,
            })
            if (response.ok) {
                const data = await response.json()
                this.clientStatuses = data.printers || []
                this.latestClientVersion = data.latestVersion || ''
                this.minClientVersion = data.minVersion || ''
                this.clientVersionChangelog = data.changelog || ''
                this.clientVersionReleased = data.released || ''
                this.syncClientStatusPolling()
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                this.showError('Failed to load client status')
            }
        } catch (error) {
            console.error('Error loading client status:', error)
            this.showError('Failed to load client status')
        } finally {
            this.loadingClientStatus = false
        }
    }

    syncClientStatusPolling() {
        if (this.clientStatuses.some(client => this.isClientOperationActive(client))) {
            this.startClientStatusPolling()
        } else {
            this.stopClientStatusPolling()
        }
    }

    startClientStatusPolling() {
        if (this.clientStatusPollTimer !== null) return

        this.clientStatusPollTimer = window.setInterval(() => {
            this.loadClientStatus()
        }, 3000)
    }

    stopClientStatusPolling() {
        if (this.clientStatusPollTimer === null) return

        window.clearInterval(this.clientStatusPollTimer)
        this.clientStatusPollTimer = null
    }

    async triggerUpdate(client: ClientStatus) {
        this.updatingPrinter = client.printerId
        try {
            const response = await fetch(`/api/fleet/update/${client.printerId}`, {
                method: 'POST',
                headers: this.authHeaders,
            })
            if (response.ok) {
                this.showSuccess(`Update triggered for ${client.printerName}`)
                this.startClientStatusPolling()
                setTimeout(() => this.loadClientStatus(), 1000)
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to trigger update')
            }
        } catch (error) {
            console.error('Error triggering update:', error)
            this.showError('Failed to trigger update')
        } finally {
            this.updatingPrinter = null
        }
    }

    async triggerRestart(client: ClientStatus) {
        this.restartingPrinter = client.printerId
        try {
            const response = await fetch(`/api/fleet/restart/${client.printerId}`, {
                method: 'POST',
                headers: this.authHeaders,
            })
            if (response.ok) {
                this.showSuccess(`Restart triggered for ${client.printerName}`)
                this.startClientStatusPolling()
                setTimeout(() => {
                    this.loadClientStatus()
                    this.loadSyncStatus()
                }, 1000)
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to trigger restart')
            }
        } catch (error) {
            console.error('Error triggering restart:', error)
            this.showError('Failed to trigger restart')
        } finally {
            this.restartingPrinter = null
        }
    }

    async triggerUpdateAll() {
        this.updatingAll = true
        try {
            const response = await fetch('/api/fleet/update-all', {
                method: 'POST',
                headers: this.authHeaders,
            })
            if (response.ok) {
                const data = await response.json()
                this.showSuccess(data.message || 'Updates triggered')
                this.startClientStatusPolling()
                setTimeout(() => this.loadClientStatus(), 1000)
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to trigger updates')
            }
        } catch (error) {
            console.error('Error triggering updates:', error)
            this.showError('Failed to trigger updates')
        } finally {
            this.updatingAll = false
        }
    }

    async toggleAutoUpdate(client: ClientStatus) {
        const enabled = !client.autoUpdate  // Toggle the current value
        this.togglingAutoUpdate = client.printerId
        try {
            const response = await fetch(`/api/fleet/auto-update/${client.printerId}`, {
                method: 'PUT',
                headers: {
                    ...this.authHeaders,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ autoUpdate: enabled }),
            })
            if (response.ok) {
                // Update local state
                const idx = this.clientStatuses.findIndex(c => c.printerId === client.printerId)
                if (idx !== -1) {
                    this.clientStatuses[idx].autoUpdate = enabled
                }
                this.showSuccess(`Auto-update ${enabled ? 'enabled' : 'disabled'} for ${client.printerName}`)
            } else if (response.status === 401) {
                await this.handleUnauthorized()
            } else {
                const data = await response.json()
                this.showError(data.error || 'Failed to update setting')
            }
        } catch (error) {
            console.error('Error toggling auto-update:', error)
            this.showError('Failed to update setting')
        } finally {
            this.togglingAutoUpdate = null
        }
    }

    getClientUpdateStatusColor(status: string): string {
        switch (status) {
            case 'up_to_date':
                return 'success'
            case 'update_available':
                return 'warning'
            case 'requires_update':
                return 'error'
            case 'offline':
                return 'grey'
            default:
                return 'grey'
        }
    }

    getClientUpdateStatusIcon(status: string): string {
        switch (status) {
            case 'up_to_date':
                return 'mdi-check-circle'
            case 'update_available':
                return 'mdi-cloud-download'
            case 'requires_update':
                return 'mdi-alert'
            case 'offline':
                return 'mdi-cloud-off'
            default:
                return 'mdi-help-circle'
        }
    }

    getClientUpdateStatusText(status: string): string {
        switch (status) {
            case 'up_to_date':
                return 'Up to Date'
            case 'update_available':
                return 'Update Available'
            case 'requires_update':
                return 'Update Required'
            case 'offline':
                return 'Offline'
            default:
                return 'Unknown'
        }
    }

    isClientOperationActive(client: ClientStatus): boolean {
        return ['requested', 'checking', 'downloading', 'installing', 'restarting'].includes(client.updateState || '')
    }

    getClientOperationColor(client: ClientStatus): string {
        switch (client.updateState) {
            case 'failed':
                return 'error'
            case 'completed':
            case 'up_to_date':
                return 'success'
            case 'restarting':
                return 'warning'
            default:
                return 'info'
        }
    }

    getRecentClientLogs(client: ClientStatus): string[] {
        return (client.updateLogs || []).slice(-3)
    }
}
</script>

<style scoped>
.clickable-table tbody tr {
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.clickable-table tbody tr:hover {
    background-color: rgba(25, 118, 210, 0.12) !important;
}

.gap-1 {
    gap: 4px;
}

.config-file-chip {
    cursor: pointer;
}

.pin-mapping-table {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
}

.pin-row-mismatch {
    background-color: rgba(255, 152, 0, 0.08) !important;
}

.pin-row-missing {
    background-color: rgba(244, 67, 54, 0.08) !important;
}

.macro-merge-table {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
}

.line-review-table {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
}

.line-op-add {
    background-color: rgba(76, 175, 80, 0.08) !important;
}

.line-op-remove {
    background-color: rgba(244, 67, 54, 0.08) !important;
}
</style>
