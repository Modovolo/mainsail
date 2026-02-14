<template>
    <div class="prepare-page" @contextmenu.prevent="showContextMenu">
        <!-- Hidden file input (multiple) -->
        <input
            ref="fileInput"
            type="file"
            accept=".stl,.3mf,.obj"
            multiple
            style="display: none"
            @change="handleFileSelect" />

        <!-- Full-screen 3D Viewer -->
        <div class="viewer-fullscreen">
            <div 
                ref="viewerContainer" 
                class="viewer-container"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="handleFileDrop">
            </div>
            
            <!-- Drop overlay -->
            <div v-if="isDragging" class="drop-overlay">
                <v-icon size="80" color="primary">{{ icons.mdiCloudUpload }}</v-icon>
                <div class="text-h6 mt-4">Drop files to import</div>
            </div>

            <!-- Loading overlay -->
            <v-overlay :value="isProcessing" absolute>
                <v-progress-circular indeterminate size="64" />
                <div class="mt-4">{{ processingMessage }}</div>
            </v-overlay>

            <!-- Empty state hint -->
            <div v-if="!hasWidgets && !isProcessing" class="empty-hint">
                <v-icon size="48" color="grey darken-1">{{ icons.mdiCube }}</v-icon>
                <div class="text-body-1 grey--text mt-2">Drag &amp; drop or use File → Import</div>
                <div class="text-caption grey--text mt-1">Supports STL, 3MF, OBJ</div>
            </div>

            <!-- Info bar at bottom -->
            <div v-if="hasSelection" class="model-info-bar">
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>{{ icons.mdiCubeOutline }}</v-icon>
                    {{ selectionDimensions }}
                </v-chip>
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>{{ icons.mdiTriangle }}</v-icon>
                    {{ formatNumber(selectionTriangles) }} triangles
                </v-chip>
                <v-chip v-if="platform && platform.selectionCount > 1" small class="mr-2" color="info" outlined>
                    {{ platform.selectionCount }} selected
                </v-chip>
            </div>
            <div v-else-if="hasWidgets" class="model-info-bar">
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>{{ icons.mdiCubeOutline }}</v-icon>
                    {{ widgetCount }} object{{ widgetCount !== 1 ? 's' : '' }}
                </v-chip>
                <v-chip small class="mr-2" outlined>
                    <v-icon left small>{{ icons.mdiTriangle }}</v-icon>
                    {{ formatNumber(totalTriangles) }} triangles
                </v-chip>
            </div>
        </div>

        <!-- Top Bar -->
        <div class="top-bar">
            <div class="top-bar-left">
                <v-btn text small class="mr-2" @click="openFilePicker">
                    <v-icon left small>{{ icons.mdiImport }}</v-icon>
                    Import
                </v-btn>
            </div>
            <div class="top-bar-center">
                <!-- Printer Profile Selector -->
                <v-menu
                    v-model="showPrinterMenu"
                    :close-on-content-click="false"
                    offset-y
                    bottom
                    max-width="400">
                    <template #activator="{ on, attrs }">
                        <v-btn text class="printer-selector" v-bind="attrs" v-on="on">
                            <v-icon left>{{ icons.mdiPrinter3d }}</v-icon>
                            {{ currentPrinterProfile.name }}
                            <v-icon right small>{{ showPrinterMenu ? icons.mdiChevronUp : icons.mdiChevronDown }}</v-icon>
                        </v-btn>
                    </template>
                    <v-card class="printer-menu-card">
                        <v-card-title class="py-2 text-subtitle-2">
                            Printer Profile
                        </v-card-title>
                        <v-divider />
                        <v-list dense class="py-0" style="max-height: 300px; overflow-y: auto;">
                            <v-list-item
                                v-for="profile in printerProfileList"
                                :key="profile.id"
                                :class="{ 'primary--text v-list-item--active': selectedPrinterId === profile.id }"
                                @click="selectPrinterProfile(profile.id)">
                                <v-list-item-icon class="mr-2">
                                    <v-icon small>{{ icons.mdiPrinter3d }}</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>{{ profile.name }}</v-list-item-title>
                                    <v-list-item-subtitle class="text-caption">
                                        {{ profile.buildVolume.x }}×{{ profile.buildVolume.y }}×{{ profile.buildVolume.z }}mm
                                        · {{ profile.extruderCount }} extruder{{ profile.extruderCount > 1 ? 's' : '' }}
                                    </v-list-item-subtitle>
                                </v-list-item-content>
                                <v-list-item-action class="my-0" v-if="!profile.isBuiltIn">
                                    <v-btn icon x-small @click.stop="editPrinterProfile(profile)">
                                        <v-icon x-small>{{ icons.mdiPencil }}</v-icon>
                                    </v-btn>
                                </v-list-item-action>
                            </v-list-item>
                        </v-list>
                        <v-divider />
                        <v-card-actions class="py-2">
                            <v-btn text small color="primary" @click="createNewPrinterProfile">
                                <v-icon left small>{{ icons.mdiPlus }}</v-icon>
                                New Profile
                            </v-btn>
                            <v-spacer />
                            <v-btn text small @click="showPrinterMenu = false">Close</v-btn>
                        </v-card-actions>
                    </v-card>
                </v-menu>
            </div>
            <div class="top-bar-right">
                <v-btn-toggle v-model="viewMode" mandatory dense class="mr-2">
                    <v-btn small value="solid">
                        <v-icon small>{{ icons.mdiCube }}</v-icon>
                    </v-btn>
                    <v-btn small value="wireframe">
                        <v-icon small>{{ icons.mdiVectorSquare }}</v-icon>
                    </v-btn>
                </v-btn-toggle>
            </div>
        </div>

        <!-- Left Toolbar -->
        <div class="left-toolbar">
            <!-- Objects List -->
            <v-tooltip right :disabled="toolbarMenus.objects">
                <template #activator="{ on: tooltipOn, attrs: tooltipAttrs }">
                    <v-menu
                        v-model="toolbarMenus.objects"
                        :close-on-content-click="false"
                        offset-x
                        right
                        nudge-right="8"
                        max-width="280">
                        <template #activator="{ on: menuOn, attrs: menuAttrs }">
                            <v-btn
                                icon
                                class="toolbar-btn"
                                :class="{ active: toolbarMenus.objects }"
                                v-bind="{ ...menuAttrs, ...tooltipAttrs }"
                                v-on="{ ...menuOn, ...tooltipOn }">
                                <v-icon>{{ icons.mdiFormatListBulleted }}</v-icon>
                            </v-btn>
                        </template>
                        <v-card class="toolbar-popout">
                            <v-card-title class="py-2 text-subtitle-2">
                                Objects ({{ widgetCount }})
                            </v-card-title>
                            <v-divider />
                            <v-list dense class="py-0" style="max-height: 300px; overflow-y: auto;">
                                <v-list-item
                                    v-for="widget in widgets"
                                    :key="widget.id"
                                    :class="{ 'primary--text': selectedWidgetIds.includes(widget.id) }"
                                    @click="onWidgetPanelSelect({ widget, shiftKey: $event.shiftKey, ctrlKey: $event.ctrlKey })">
                                    <v-list-item-icon class="mr-2">
                                        <v-icon small>{{ icons.mdiCubeOutline }}</v-icon>
                                    </v-list-item-icon>
                                    <v-list-item-content>
                                        <v-list-item-title class="text-caption">{{ widget.name }}</v-list-item-title>
                                    </v-list-item-content>
                                    <v-list-item-action class="my-0">
                                        <v-btn icon x-small @click.stop="deleteWidget(widget)">
                                            <v-icon x-small>{{ icons.mdiClose }}</v-icon>
                                        </v-btn>
                                    </v-list-item-action>
                                </v-list-item>
                                <v-list-item v-if="!hasWidgets" class="text-caption grey--text">
                                    No objects
                                </v-list-item>
                            </v-list>
                        </v-card>
                    </v-menu>
                </template>
                <span>Objects</span>
            </v-tooltip>

            <v-divider class="my-1" />

            <!-- Move/Translate -->
            <v-tooltip right :disabled="toolbarMenus.move || !hasSelection">
                <template #activator="{ on: tooltipOn, attrs: tooltipAttrs }">
                    <v-menu
                        v-model="toolbarMenus.move"
                        :close-on-content-click="false"
                        :disabled="!hasSelection"
                        offset-x
                        right
                        nudge-right="8">
                        <template #activator="{ on: menuOn, attrs: menuAttrs }">
                            <v-btn
                                icon
                                class="toolbar-btn"
                                :class="{ active: toolbarMenus.move }"
                                :disabled="!hasSelection"
                                v-bind="{ ...menuAttrs, ...tooltipAttrs }"
                                v-on="{ ...menuOn, ...tooltipOn }">
                                <v-icon>{{ icons.mdiAxisArrow }}</v-icon>
                            </v-btn>
                        </template>
                        <v-card class="toolbar-popout" width="220">
                            <v-card-title class="py-2 text-subtitle-2">Move</v-card-title>
                            <v-divider />
                            <v-card-text class="py-2">
                                <v-text-field
                                    v-model.number="transformInputs.posX"
                                    label="X"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="mm"
                                    class="mb-2"
                                    @change="applyPositionFromInputs" />
                                <v-text-field
                                    v-model.number="transformInputs.posY"
                                    label="Y"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="mm"
                                    class="mb-2"
                                    @change="applyPositionFromInputs" />
                                <v-text-field
                                    v-model.number="transformInputs.posZ"
                                    label="Z"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="mm"
                                    @change="applyPositionFromInputs" />
                                <v-btn small block class="mt-3" @click="centerSelected">
                                    <v-icon left small>{{ icons.mdiAlignHorizontalCenter }}</v-icon>
                                    Center
                                </v-btn>
                            </v-card-text>
                        </v-card>
                    </v-menu>
                </template>
                <span>Move (Alt+Arrows)</span>
            </v-tooltip>

            <!-- Rotate -->
            <v-tooltip right :disabled="toolbarMenus.rotate || !hasSelection">
                <template #activator="{ on: tooltipOn, attrs: tooltipAttrs }">
                    <v-menu
                        v-model="toolbarMenus.rotate"
                        :close-on-content-click="false"
                        :disabled="!hasSelection"
                        offset-x
                        right
                        nudge-right="8">
                        <template #activator="{ on: menuOn, attrs: menuAttrs }">
                            <v-btn
                                icon
                                class="toolbar-btn"
                                :class="{ active: toolbarMenus.rotate }"
                                :disabled="!hasSelection"
                                v-bind="{ ...menuAttrs, ...tooltipAttrs }"
                                v-on="{ ...menuOn, ...tooltipOn }">
                                <v-icon>{{ icons.mdiRotate3dVariant }}</v-icon>
                            </v-btn>
                        </template>
                        <v-card class="toolbar-popout" width="220">
                            <v-card-title class="py-2 text-subtitle-2">Rotate</v-card-title>
                            <v-divider />
                            <v-card-text class="py-2">
                                <v-text-field
                                    v-model.number="transformInputs.rotX"
                                    label="X"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="°"
                                    class="mb-2"
                                    @change="applyRotationFromInputs" />
                                <v-text-field
                                    v-model.number="transformInputs.rotY"
                                    label="Y"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="°"
                                    class="mb-2"
                                    @change="applyRotationFromInputs" />
                                <v-text-field
                                    v-model.number="transformInputs.rotZ"
                                    label="Z"
                                    type="number"
                                    dense
                                    hide-details
                                    suffix="°"
                                    @change="applyRotationFromInputs" />
                                <div class="d-flex mt-3">
                                    <v-btn small class="flex-grow-1 mr-1" @click="rotateBy(90, 'z')">+90°</v-btn>
                                    <v-btn small class="flex-grow-1" @click="rotateBy(-90, 'z')">-90°</v-btn>
                                </div>
                                <v-btn small block class="mt-2" @click="layFlatSelected">
                                    <v-icon left small>{{ icons.mdiAlignVerticalBottom }}</v-icon>
                                    Lay Flat
                                </v-btn>
                            </v-card-text>
                        </v-card>
                    </v-menu>
                </template>
                <span>Rotate (Arrow keys)</span>
            </v-tooltip>

            <!-- Scale -->
            <v-tooltip right :disabled="toolbarMenus.scale || !hasSelection">
                <template #activator="{ on: tooltipOn, attrs: tooltipAttrs }">
                    <v-menu
                        v-model="toolbarMenus.scale"
                        :close-on-content-click="false"
                        :disabled="!hasSelection"
                        offset-x
                        right
                        nudge-right="8">
                        <template #activator="{ on: menuOn, attrs: menuAttrs }">
                            <v-btn
                                icon
                                class="toolbar-btn"
                                :class="{ active: toolbarMenus.scale }"
                                :disabled="!hasSelection"
                                v-bind="{ ...menuAttrs, ...tooltipAttrs }"
                                v-on="{ ...menuOn, ...tooltipOn }">
                                <v-icon>{{ icons.mdiResize }}</v-icon>
                            </v-btn>
                        </template>
                        <v-card class="toolbar-popout" width="220">
                            <v-card-title class="py-2 text-subtitle-2">Scale</v-card-title>
                            <v-divider />
                            <v-card-text class="py-2">
                                <v-switch
                                    v-model="uniformScale"
                                    label="Uniform"
                                    dense
                                    hide-details
                                    class="mt-0 mb-2" />
                                <v-text-field
                                    v-model.number="transformInputs.scaleX"
                                    label="X"
                                    type="number"
                                    step="0.1"
                                    dense
                                    hide-details
                                    class="mb-2"
                                    @change="applyScaleFromInputs('x')" />
                                <v-text-field
                                    v-model.number="transformInputs.scaleY"
                                    label="Y"
                                    type="number"
                                    step="0.1"
                                    dense
                                    hide-details
                                    :disabled="uniformScale"
                                    class="mb-2"
                                    @change="applyScaleFromInputs('y')" />
                                <v-text-field
                                    v-model.number="transformInputs.scaleZ"
                                    label="Z"
                                    type="number"
                                    step="0.1"
                                    dense
                                    hide-details
                                    :disabled="uniformScale"
                                    @change="applyScaleFromInputs('z')" />
                                <div class="d-flex mt-3">
                                    <v-btn small class="flex-grow-1 mr-1" @click="scaleBy(0.5)">50%</v-btn>
                                    <v-btn small class="flex-grow-1 mr-1" @click="scaleBy(1)">100%</v-btn>
                                    <v-btn small class="flex-grow-1" @click="scaleBy(2)">200%</v-btn>
                                </div>
                            </v-card-text>
                        </v-card>
                    </v-menu>
                </template>
                <span>Scale</span>
            </v-tooltip>

            <v-divider class="my-1" />

            <!-- Mirror -->
            <v-tooltip right :disabled="toolbarMenus.mirror || !hasSelection">
                <template #activator="{ on: tooltipOn, attrs: tooltipAttrs }">
                    <v-menu
                        v-model="toolbarMenus.mirror"
                        :close-on-content-click="false"
                        :disabled="!hasSelection"
                        offset-x
                        right
                        nudge-right="8">
                        <template #activator="{ on: menuOn, attrs: menuAttrs }">
                            <v-btn
                                icon
                                class="toolbar-btn"
                                :class="{ active: toolbarMenus.mirror }"
                                :disabled="!hasSelection"
                                v-bind="{ ...menuAttrs, ...tooltipAttrs }"
                                v-on="{ ...menuOn, ...tooltipOn }">
                                <v-icon>{{ icons.mdiFlipHorizontal }}</v-icon>
                            </v-btn>
                        </template>
                        <v-card class="toolbar-popout" width="180">
                            <v-card-title class="py-2 text-subtitle-2">Mirror</v-card-title>
                            <v-divider />
                            <v-card-text class="py-2">
                                <v-btn small block class="mb-2" @click="mirrorAxis('x')">Mirror X</v-btn>
                                <v-btn small block class="mb-2" @click="mirrorAxis('y')">Mirror Y</v-btn>
                                <v-btn small block @click="mirrorAxis('z')">Mirror Z</v-btn>
                            </v-card-text>
                        </v-card>
                    </v-menu>
                </template>
                <span>Mirror (M)</span>
            </v-tooltip>

            <!-- Duplicate -->
            <v-tooltip right>
                <template #activator="{ on, attrs }">
                    <v-btn
                        icon
                        class="toolbar-btn"
                        :disabled="!hasSelection"
                        v-bind="attrs"
                        v-on="on"
                        @click="duplicateSelected">
                        <v-icon>{{ icons.mdiContentDuplicate }}</v-icon>
                    </v-btn>
                </template>
                <span>Duplicate (D)</span>
            </v-tooltip>

            <!-- Arrange -->
            <v-tooltip right>
                <template #activator="{ on, attrs }">
                    <v-btn
                        icon
                        class="toolbar-btn"
                        :disabled="!hasWidgets"
                        v-bind="attrs"
                        v-on="on"
                        @click="arrangeAll">
                        <v-icon>{{ icons.mdiViewGrid }}</v-icon>
                    </v-btn>
                </template>
                <span>Auto Arrange (A)</span>
            </v-tooltip>

            <v-divider class="my-1" />

            <!-- Delete -->
            <v-tooltip right>
                <template #activator="{ on, attrs }">
                    <v-btn
                        icon
                        class="toolbar-btn"
                        color="error"
                        :disabled="!hasSelection"
                        v-bind="attrs"
                        v-on="on"
                        @click="deleteSelected">
                        <v-icon>{{ icons.mdiDelete }}</v-icon>
                    </v-btn>
                </template>
                <span>Delete (Del)</span>
            </v-tooltip>
        </div>

        <!-- Right Panel Toggle Button -->
        <v-tooltip left :disabled="showRightPanel">
            <template #activator="{ on, attrs }">
                <v-btn
                    fab
                    small
                    class="panel-toggle panel-toggle-right"
                    :class="{ 'panel-hidden': !showRightPanel }"
                    v-bind="attrs"
                    v-on="on"
                    @click="showRightPanel = !showRightPanel">
                    <v-icon>{{ showRightPanel ? icons.mdiChevronRight : icons.mdiTune }}</v-icon>
                </v-btn>
            </template>
            <span>Slice Settings</span>
        </v-tooltip>

        <!-- Right Panel: Slice Settings (floating) -->
        <transition name="slide-right">
            <div v-show="showRightPanel" class="floating-panel floating-panel-right">
                <div class="panel-header d-flex align-center justify-space-between px-3 py-2">
                    <span class="text-subtitle-2">Slice Settings</span>
                    <v-btn icon x-small @click="showRightPanel = false">
                        <v-icon small>{{ icons.mdiClose }}</v-icon>
                    </v-btn>
                </div>
                <div class="panel-content">
                    <slice-settings-panel
                        v-model="sliceParams"
                        :can-slice="hasWidgets"
                        :is-slicing="isSlicing"
                        @slice="startSlicing"
                        @save-profile="saveProfile"
                        @load-profile="loadProfile" />
                </div>
            </div>
        </transition>
        
        <!-- Context Menu -->
        <v-menu
            v-model="contextMenu.show"
            :position-x="contextMenu.x"
            :position-y="contextMenu.y"
            absolute
            offset-y>
            <v-list dense>
                <v-list-item @click="openFilePicker">
                    <v-list-item-icon><v-icon small>{{ icons.mdiImport }}</v-icon></v-list-item-icon>
                    <v-list-item-title>Import Model...</v-list-item-title>
                </v-list-item>
                <template v-if="hasSelection">
                    <v-divider />
                    <v-list-item @click="centerSelected">
                        <v-list-item-icon><v-icon small>{{ icons.mdiAlignHorizontalCenter }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Center on Platform</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="layFlatSelected">
                        <v-list-item-icon><v-icon small>{{ icons.mdiAlignVerticalBottom }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Lay Flat</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="duplicateSelected">
                        <v-list-item-icon><v-icon small>{{ icons.mdiContentDuplicate }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Duplicate</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="mirrorSelected">
                        <v-list-item-icon><v-icon small>{{ icons.mdiFlipHorizontal }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Mirror</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="deleteSelected">
                        <v-list-item-icon><v-icon small color="error">{{ icons.mdiDelete }}</v-icon></v-list-item-icon>
                        <v-list-item-title class="error--text">Delete</v-list-item-title>
                    </v-list-item>
                </template>
                <template v-if="hasWidgets">
                    <v-divider />
                    <v-list-item @click="selectAll">
                        <v-list-item-icon><v-icon small>{{ icons.mdiSelectAll }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Select All</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="arrangeAll">
                        <v-list-item-icon><v-icon small>{{ icons.mdiViewGrid }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Auto Arrange</v-list-item-title>
                    </v-list-item>
                </template>
            </v-list>
        </v-menu>

        <!-- Slicing Progress Dialog -->
        <v-dialog v-model="showSlicingDialog" persistent max-width="500">
            <v-card>
                <v-card-title>
                    <v-icon left>{{ icons.mdiPrinter3dNozzle }}</v-icon>
                    Slicing in Progress
                </v-card-title>
                <v-card-text>
                    <div class="text-center mb-4">{{ slicingMessage }}</div>
                    <v-progress-linear :value="slicingProgress" height="24" striped>
                        <template #default>
                            <strong>{{ Math.round(slicingProgress) }}%</strong>
                        </template>
                    </v-progress-linear>
                </v-card-text>
            </v-card>
        </v-dialog>
        
        <!-- Slice Complete Dialog -->
        <v-dialog v-model="showResultDialog" max-width="600">
            <v-card v-if="sliceResult">
                <v-card-title class="success--text">
                    <v-icon left color="success">{{ icons.mdiCheckCircle }}</v-icon>
                    Slicing Complete
                </v-card-title>
                <v-card-text>
                    <v-row>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Layers</div>
                            <div class="text-h5">{{ sliceResult.layer_count }}</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Estimated Time</div>
                            <div class="text-h5">{{ sliceResult.estimated_time_formatted }}</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Filament</div>
                            <div class="text-h5">{{ sliceResult.filament_used_m }}m</div>
                        </v-col>
                        <v-col cols="6">
                            <div class="text-subtitle-2">Weight</div>
                            <div class="text-h5">{{ sliceResult.filament_weight_g }}g</div>
                        </v-col>
                    </v-row>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showResultDialog = false">Close</v-btn>
                    <v-btn color="primary" @click="previewGcode">
                        <v-icon left>{{ icons.mdiEye }}</v-icon>
                        Preview
                    </v-btn>
                    <v-btn color="info" @click="uploadGcodeToMoonraker">
                        <v-icon left>{{ icons.mdiCloudUpload }}</v-icon>
                        Upload to Printer
                    </v-btn>
                    <v-btn color="success" @click="downloadGcode">
                        <v-icon left>{{ icons.mdiDownload }}</v-icon>
                        Download G-code
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Printer Profile Edit Dialog -->
        <v-dialog v-model="showPrinterProfileDialog" max-width="600" persistent>
            <v-card>
                <v-card-title>
                    <v-icon left>{{ icons.mdiPrinter3d }}</v-icon>
                    {{ editingProfileId ? 'Edit Printer Profile' : 'New Printer Profile' }}
                </v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="printerProfileForm.name"
                        label="Profile Name"
                        outlined
                        dense
                        hide-details
                        class="mb-4" />

                    <div class="text-subtitle-2 mb-2">Build Volume</div>
                    <v-row dense class="mb-4">
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="printerProfileForm.buildVolume.x"
                                label="X"
                                type="number"
                                suffix="mm"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="printerProfileForm.buildVolume.y"
                                label="Y"
                                type="number"
                                suffix="mm"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="printerProfileForm.buildVolume.z"
                                label="Z"
                                type="number"
                                suffix="mm"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                    </v-row>

                    <div class="text-subtitle-2 mb-2">Extruders</div>
                    <v-row dense class="mb-4">
                        <v-col cols="6">
                            <v-text-field
                                v-model.number="printerProfileForm.extruderCount"
                                label="Number of Extruders"
                                type="number"
                                min="1"
                                max="8"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                v-model.number="printerProfileForm.nozzleDiameter"
                                label="Nozzle Diameter"
                                type="number"
                                step="0.1"
                                suffix="mm"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                    </v-row>

                    <div class="text-subtitle-2 mb-2">Filament</div>
                    <v-row dense class="mb-4">
                        <v-col cols="6">
                            <v-text-field
                                v-model.number="printerProfileForm.filamentDiameter"
                                label="Filament Diameter"
                                type="number"
                                step="0.05"
                                suffix="mm"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-select
                                v-model="printerProfileForm.bedShape"
                                :items="bedShapeOptions"
                                label="Bed Shape"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                    </v-row>

                    <div class="text-subtitle-2 mb-2">Capabilities</div>
                    <v-row dense>
                        <v-col cols="6">
                            <v-checkbox
                                v-model="printerProfileForm.heatedBed"
                                label="Heated Bed"
                                dense
                                hide-details
                                class="mt-0" />
                        </v-col>
                        <v-col cols="6">
                            <v-checkbox
                                v-model="printerProfileForm.heatedChamber"
                                label="Heated Chamber"
                                dense
                                hide-details
                                class="mt-0" />
                        </v-col>
                        <v-col cols="6">
                            <v-checkbox
                                v-model="printerProfileForm.autoBedLeveling"
                                label="Auto Bed Leveling"
                                dense
                                hide-details
                                class="mt-0" />
                        </v-col>
                        <v-col cols="6">
                            <v-checkbox
                                v-model="printerProfileForm.directDrive"
                                label="Direct Drive"
                                dense
                                hide-details
                                class="mt-0" />
                        </v-col>
                    </v-row>

                    <template v-if="printerProfileForm.extruderCount > 1">
                        <v-divider class="my-4" />
                        <div class="text-subtitle-2 mb-2">Multi-Extruder Settings</div>
                        <v-select
                            v-model="printerProfileForm.multiExtruderType"
                            :items="multiExtruderTypeOptions"
                            label="Type"
                            outlined
                            dense
                            hide-details />
                    </template>
                </v-card-text>
                <v-card-actions>
                    <v-btn
                        v-if="editingProfileId && !printerProfileList.find(p => p.id === editingProfileId)?.isBuiltIn"
                        text
                        color="error"
                        @click="deletePrinterProfile">
                        <v-icon left small>{{ icons.mdiDelete }}</v-icon>
                        Delete
                    </v-btn>
                    <v-spacer />
                    <v-btn text @click="closePrinterProfileDialog">Cancel</v-btn>
                    <v-btn color="primary" @click="savePrinterProfile">
                        <v-icon left small>{{ icons.mdiCheck }}</v-icon>
                        Save
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import axios from 'axios'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import {
    loadMeshFile,
    LoadResult,
    PrepareWidget,
    Platform,
    PlatformConfig,
    encodeSTL,
} from '@/util/mesh'
import ObjectListPanel from '@/components/panels/Prepare/ObjectListPanel.vue'
import TransformPanel from '@/components/panels/Prepare/TransformPanel.vue'
import SliceSettingsPanel from '@/components/panels/Prepare/SliceSettingsPanel.vue'
import { getSlicerEngine } from '@/util/slicer/SlicerEngine'
import { mapSettings } from '@/util/slicer/settingsMapper'
import type { SlicerConfig } from '@/util/slicer/types'
import {
    mdiCube,
    mdiCubeOutline,
    mdiCubeUnfolded,
    mdiVectorSquare,
    mdiRadioactive,
    mdiCloudUpload,
    mdiFolder,
    mdiTriangle,
    mdiAlert,
    mdiClose,
    mdiTune,
    mdiLayers,
    mdiGridLarge,
    mdiSpeedometer,
    mdiThermometer,
    mdiPillar,
    mdiFlask,
    mdiPrinter3dNozzle,
    mdiCheckCircle,
    mdiEye,
    mdiDownload,
    mdiFile,
    mdiImport,
    mdiExport,
    mdiCameraFlip,
    mdiArrowUpBold,
    mdiArrowDownBold,
    mdiArrowRightBold,
    mdiCheck,
    mdiAlignHorizontalCenter,
    mdiAlignVerticalBottom,
    mdiResize,
    mdiRotate3dVariant,
    mdiContentDuplicate,
    mdiFlipHorizontal,
    mdiDelete,
    mdiViewGrid,
    mdiSelectAll,
    mdiCropFree,
    mdiChevronLeft,
    mdiChevronRight,
    mdiFormatListBulleted,
    mdiAxisArrow,
    mdiPrinter3d,
    mdiChevronUp,
    mdiChevronDown,
    mdiPencil,
    mdiPlus,
} from '@mdi/js'

interface SliceParams {
    layer_height: number
    first_layer_height: number
    infill_density: number
    infill_pattern: string
    wall_count: number
    top_layers: number
    bottom_layers: number
    print_speed: number
    travel_speed: number
    first_layer_speed: number
    nozzle_temp: number
    bed_temp: number
    enable_support: boolean
    support_density: number
    support_pattern: string
    enable_non_planar: boolean
    max_slope_angle: number
    enable_idex: boolean
    idex_mode: string
}

interface SliceResult {
    layer_count: number
    filament_used_m: number
    filament_weight_g: number
    estimated_time_formatted: string
}

import { PrinterProfile } from '@/store/prepare/types'

const EMPTY_PRINTER_PROFILE: PrinterProfile = {
    id: '',
    name: '',
    buildVolume: { x: 220, y: 220, z: 250 },
    extruderCount: 1,
    nozzleDiameter: 0.4,
    filamentDiameter: 1.75,
    bedShape: 'rectangular',
    heatedBed: true,
    heatedChamber: false,
    autoBedLeveling: false,
    directDrive: false,
}

const DEG90 = Math.PI / 2
const DEG5 = Math.PI / 36

@Component({
    components: {
        ObjectListPanel,
        TransformPanel,
        SliceSettingsPanel,
    },
})
export default class PreparePage extends Mixins(BaseMixin) {
    icons = {
        mdiCube, mdiCubeOutline, mdiCubeUnfolded, mdiVectorSquare, mdiRadioactive,
        mdiCloudUpload, mdiFolder, mdiTriangle, mdiAlert, mdiClose, mdiTune,
        mdiLayers, mdiGridLarge, mdiSpeedometer, mdiThermometer, mdiPillar,
        mdiFlask, mdiPrinter3dNozzle, mdiCheckCircle, mdiEye, mdiDownload,
        mdiFile, mdiImport, mdiExport, mdiCameraFlip, mdiArrowUpBold,
        mdiArrowDownBold, mdiArrowRightBold, mdiCheck, mdiAlignHorizontalCenter,
        mdiAlignVerticalBottom, mdiResize, mdiRotate3dVariant, mdiContentDuplicate,
        mdiFlipHorizontal, mdiDelete, mdiViewGrid, mdiSelectAll, mdiCropFree,
        mdiChevronLeft, mdiChevronRight, mdiFormatListBulleted, mdiAxisArrow,
        mdiPrinter3d, mdiChevronUp, mdiChevronDown, mdiPencil, mdiPlus,
    }
    
    // Panel visibility state
    showLeftPanel = true
    showRightPanel = true
    
    // Toolbar menu states
    toolbarMenus = {
        objects: false,
        move: false,
        rotate: false,
        scale: false,
        mirror: false,
    }
    
    // Transform input values
    transformInputs = {
        posX: 0,
        posY: 0,
        posZ: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
    }
    
    uniformScale = true
    
    // View state
    viewMode = 'solid'
    isDragging = false
    isProcessing = false
    processingMessage = ''
    isSlicing = false
    showSlicingDialog = false
    showResultDialog = false
    slicingProgress = 0
    slicingMessage = ''
    openPanels: number[] = [0, 1]
    
    // Context menu
    contextMenu = { show: false, x: 0, y: 0 }
    
    // Three.js
    scene: THREE.Scene | null = null
    camera: THREE.PerspectiveCamera | null = null
    renderer: THREE.WebGLRenderer | null = null
    controls: OrbitControls | null = null
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()
    
    // Platform & widgets
    platform: Platform | null = null
    
    // Mouse interaction state
    private mouseStart: { x: number; y: number } | null = null
    private mouseDragPoint: THREE.Vector3 | null = null
    private dragPlatformPlane: THREE.Mesh | null = null
    private isDraggingWidget = false
    
    // Slicing
    qualityPreset = 'normal'
    sliceResult: SliceResult | null = null
    jobId = ''
    
    sliceParams: SliceParams = {
        layer_height: 0.2,
        first_layer_height: 0.3,
        infill_density: 20,
        infill_pattern: 'grid',
        wall_count: 3,
        top_layers: 4,
        bottom_layers: 4,
        print_speed: 60,
        travel_speed: 150,
        first_layer_speed: 20,
        nozzle_temp: 210,
        bed_temp: 60,
        enable_support: false,
        support_density: 15,
        support_pattern: 'grid',
        enable_non_planar: false,
        max_slope_angle: 45,
        enable_idex: false,
        idex_mode: 'normal',
    }
    
    infillPatterns = [
        { text: 'Grid', value: 'grid' },
        { text: 'Lines', value: 'lines' },
        { text: 'Triangles', value: 'triangles' },
        { text: 'Gyroid', value: 'gyroid' },
        { text: 'Honeycomb', value: 'honeycomb' },
    ]
    
    supportPatterns = [
        { text: 'Grid', value: 'grid' },
        { text: 'Lines', value: 'lines' },
        { text: 'ZigZag', value: 'zigzag' },
    ]
    
    idexModes = [
        { text: 'Normal', value: 'normal' },
        { text: 'Mirror', value: 'mirror' },
        { text: 'Duplicate', value: 'duplicate' },
    ]
    
    // Printer profile management (local UI state only)
    showPrinterMenu = false
    showPrinterProfileDialog = false
    editingProfileId: string | null = null
    printerProfileForm: PrinterProfile = { ...EMPTY_PRINTER_PROFILE }
    
    bedShapeOptions = [
        { text: 'Rectangular', value: 'rectangular' },
        { text: 'Circular', value: 'circular' },
    ]
    
    multiExtruderTypeOptions = [
        { text: 'Single Nozzle (Switching)', value: 'single' },
        { text: 'Dual Nozzle', value: 'dual' },
        { text: 'IDEX', value: 'idex' },
        { text: 'Tool Changer', value: 'toolchanger' },
    ]
    
    // Store-backed computed properties for printer profiles
    get printerProfileList(): PrinterProfile[] {
        return this.$store.state.prepare.printerProfiles
    }
    
    get selectedPrinterId(): string {
        return this.$store.state.prepare.activePrinterId || 'generic'
    }
    
    set selectedPrinterId(id: string) {
        this.$store.dispatch('prepare/selectPrinter', id)
    }
    
    get currentPrinterProfile(): PrinterProfile {
        return this.printerProfileList.find(p => p.id === this.selectedPrinterId) ||
            this.printerProfileList[0] || { ...EMPTY_PRINTER_PROFILE, id: 'generic', name: 'Generic Printer' }
    }
    
    // --- Computed ---
    
    get hasWidgets(): boolean {
        return this.platform ? this.platform.widgetCount > 0 : false
    }
    
    get hasSelection(): boolean {
        return this.platform ? this.platform.hasSelection : false
    }
    
    get widgets(): PrepareWidget[] {
        return this.platform ? this.platform.widgets : []
    }
    
    get widgetCount(): number {
        return this.platform ? this.platform.widgetCount : 0
    }
    
    get totalTriangles(): number {
        return this.platform ? this.platform.totalTriangles : 0
    }
    
    get selectionTriangles(): number {
        if (!this.platform) return 0
        let count = 0
        for (const w of this.platform.selected) {
            const pos = w.mesh.geometry.attributes.position
            if (pos) count += pos.count / 3
        }
        return count
    }
    
    get selectionDimensions(): string {
        if (!this.platform) return ''
        const info = this.platform.getSelectionInfo()
        if (!info) return ''
        const d = info.dimensions
        return `${d.x.toFixed(1)} × ${d.z.toFixed(1)} × ${d.y.toFixed(1)} mm`
    }
    
    get viewerCols(): number {
        return this.hasWidgets ? 7 : 9
    }
    
    get slicerServiceUrl(): string {
        return process.env.VUE_APP_SLICER_URL || 'http://localhost:8090'
    }
    
    get selectedWidgetIds(): string[] {
        if (!this.platform) return []
        return this.platform.selected.map(w => w.id)
    }
    
    get selectedWidget(): PrepareWidget | null {
        if (!this.platform || this.platform.selectionCount === 0) return null
        return this.platform.selected[0]
    }
    
    // --- Lifecycle ---
    
    mounted() {
        // Load printer profiles from PostgreSQL via fleet API
        this.$store.dispatch('prepare/initPrinterProfiles')
        
        // Use multiple strategies to ensure 3D environment loads
        this.$nextTick(() => {
            this.initThreeJS()
        })
        // Fallback: retry after a short delay if still not initialized
        setTimeout(() => {
            if (!this.scene) {
                this.initThreeJS()
            }
        }, 100)
        window.addEventListener('resize', this.onWindowResize)
        window.addEventListener('keydown', this.handleKeyDown)
    }
    
    beforeDestroy() {
        window.removeEventListener('resize', this.onWindowResize)
        window.removeEventListener('keydown', this.handleKeyDown)
        this.disposeThreeJS()
        // Reset store state when leaving page
        this.$store.commit('prepare/reset')
    }
    
    // --- Watchers ---
    
    @Watch('selectedPrinterId')
    onPrinterChange() {
        this.rebuildBuildVolume()
    }
    
    @Watch('qualityPreset')
    onQualityPresetChange(preset: string) {
        const presets: Record<string, Partial<SliceParams>> = {
            draft: { layer_height: 0.3, infill_density: 10, print_speed: 80 },
            normal: { layer_height: 0.2, infill_density: 20, print_speed: 60 },
            fine: { layer_height: 0.12, infill_density: 20, print_speed: 45 },
            ultra: { layer_height: 0.08, infill_density: 25, print_speed: 30 },
        }
        if (presets[preset]) {
            Object.assign(this.sliceParams, presets[preset])
        }
    }
    
    @Watch('viewMode')
    onViewModeChange(mode: string) {
        if (!this.platform) return
        for (const w of this.platform.widgets) {
            switch (mode) {
                case 'solid':
                    w.setWireframe(false)
                    w.setOpacity(0.85)
                    break
                case 'wireframe':
                    w.setWireframe(true)
                    w.setOpacity(1)
                    break
                case 'xray':
                    w.setWireframe(false)
                    w.setOpacity(0.5)
                    break
            }
        }
    }
    
    // Watch for store view mode changes from topbar
    @Watch('$store.state.prepare.viewMode')
    onStoreViewModeChange(mode: string) {
        if (this.viewMode !== mode) {
            this.viewMode = mode
        }
    }
    
    // Watch for store actions from topbar
    @Watch('$store.state.prepare.actionCounter')
    onPrepareAction() {
        const action = this.$store.state.prepare.pendingAction
        if (!action) return
        
        switch (action) {
            case 'import': this.openFilePicker(); break
            case 'clear': this.clearPlatform(); break
            case 'exportSTL': this.exportSelectedSTL(); break
            case 'resetCamera': this.resetCamera(); break
            case 'fitAll': this.fitCameraToAll(); break
            case 'viewTop': this.setViewTop(); break
            case 'viewFront': this.setViewFront(); break
            case 'viewRight': this.setViewRight(); break
            case 'centerSelected': this.centerSelected(); break
            case 'layFlat': this.layFlatSelected(); break
            case 'duplicate': this.duplicateSelected(); break
            case 'mirror': this.mirrorSelected(); break
            case 'delete': this.deleteSelected(); break
            case 'arrange': this.arrangeAll(); break
            case 'selectAll': this.selectAll(); break
        }
        this.$store.commit('prepare/clearAction')
    }
    
    // Sync platform state to store for topbar menu enable/disable
    syncStateToStore() {
        this.$store.dispatch('prepare/updateState', {
            hasWidgets: this.hasWidgets,
            hasSelection: this.hasSelection,
            widgetCount: this.widgetCount,
            selectionCount: this.platform?.selectionCount ?? 0,
        })
    }
    
    // Helper: update UI and sync state to store
    syncAndUpdate() {
        this.$forceUpdate()
        this.syncStateToStore()
        this.updateTransformInputsFromSelection()
    }
    
    // --- Three.js setup ---
    
    private initRetryCount = 0
    
    initThreeJS() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container) {
            // Container not ready, retry
            if (this.initRetryCount < 10) {
                this.initRetryCount++
                requestAnimationFrame(() => this.initThreeJS())
            }
            return
        }
        
        // Guard against 0-height container (layout not ready yet)
        if (container.clientHeight === 0 || container.clientWidth === 0) {
            if (this.initRetryCount < 20) {
                this.initRetryCount++
                requestAnimationFrame(() => this.initThreeJS())
            } else {
                // Force minimum dimensions as fallback
                console.warn('PreparePage: Container has no dimensions, using fallback size')
            }
            return
        }
        
        // Already initialized
        if (this.scene) return
        
        const profile = this.getPrinterProfile()
        
        // Scene
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x1e1e2e)
        
        // Camera
        const aspect = container.clientWidth / container.clientHeight
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000)
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setSize(container.clientWidth, container.clientHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        container.appendChild(this.renderer.domElement)
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.05
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
        this.scene.add(ambientLight)
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(1, 2, 1)
        this.scene.add(directionalLight)
        
        const backLight = new THREE.DirectionalLight(0xffffff, 0.3)
        backLight.position.set(-1, 1, -1)
        this.scene.add(backLight)
        
        // Invisible drag plane for widget dragging
        const dragGeo = new THREE.PlaneGeometry(10000, 10000)
        const dragMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        this.dragPlatformPlane = new THREE.Mesh(dragGeo, dragMat)
        this.dragPlatformPlane.rotation.x = -Math.PI / 2
        this.dragPlatformPlane.position.y = 0
        this.scene.add(this.dragPlatformPlane)
        
        // Platform
        const platformConfig: PlatformConfig = {
            bedWidth: profile.bed_size_x,
            bedDepth: profile.bed_size_y,
            bedHeight: profile.bed_size_z,
            gap: 5,
        }
        this.platform = new Platform(this.scene, platformConfig)
        
        // Build volume visualization
        this.updateBuildVolume()
        
        // Set initial camera position
        this.resetCamera()
        
        // Mouse event handlers
        const canvas = this.renderer.domElement
        canvas.addEventListener('mousedown', this.onMouseDown)
        canvas.addEventListener('mousemove', this.onMouseMove)
        canvas.addEventListener('mouseup', this.onMouseUp)
        
        // Animation loop
        this.animate()
    }
    
    updateBuildVolume() {
        if (!this.scene) return
        
        const profile = this.getPrinterProfile()
        const { bed_size_x, bed_size_y, bed_size_z } = profile
        
        // Remove old build volume elements
        const toRemove = this.scene.children.filter(c => c.userData.isBuildVolume)
        toRemove.forEach(c => this.scene?.remove(c))
        
        // Grid
        const gridSize = Math.max(bed_size_x, bed_size_y)
        const gridDivisions = Math.round(gridSize / 10)
        const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444466, 0x333344)
        gridHelper.position.set(bed_size_x / 2, 0, bed_size_y / 2)
        gridHelper.userData.isBuildVolume = true
        this.scene.add(gridHelper)
        
        // Floor plate
        const plateGeometry = new THREE.PlaneGeometry(bed_size_x, bed_size_y)
        const plateMaterial = new THREE.MeshBasicMaterial({
            color: 0x2a2a4a, side: THREE.DoubleSide,
            transparent: true, opacity: 0.6,
        })
        const plateMesh = new THREE.Mesh(plateGeometry, plateMaterial)
        plateMesh.rotation.x = -Math.PI / 2
        plateMesh.position.set(bed_size_x / 2, -0.1, bed_size_y / 2)
        plateMesh.userData.isBuildVolume = true
        this.scene.add(plateMesh)
        
        // Wireframe box
        const boxGeometry = new THREE.BoxGeometry(bed_size_x, bed_size_z, bed_size_y)
        const edges = new THREE.EdgesGeometry(boxGeometry)
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.5 })
        const wireframe = new THREE.LineSegments(edges, lineMaterial)
        wireframe.position.set(bed_size_x / 2, bed_size_z / 2, bed_size_y / 2)
        wireframe.userData.isBuildVolume = true
        this.scene.add(wireframe)
        
        // Origin axes
        const axesHelper = new THREE.AxesHelper(20)
        axesHelper.userData.isBuildVolume = true
        this.scene.add(axesHelper)
    }
    
    animate() {
        if (!this.renderer || !this.scene || !this.camera || !this.controls) return
        requestAnimationFrame(() => this.animate())
        this.controls.update()
        this.renderer.render(this.scene, this.camera)
    }
    
    onWindowResize() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.renderer) return
        if (container.clientHeight === 0) return  // Guard against collapsed container
        this.camera.aspect = container.clientWidth / container.clientHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(container.clientWidth, container.clientHeight)
    }
    
    disposeThreeJS() {
        const canvas = this.renderer?.domElement
        if (canvas) {
            canvas.removeEventListener('mousedown', this.onMouseDown)
            canvas.removeEventListener('mousemove', this.onMouseMove)
            canvas.removeEventListener('mouseup', this.onMouseUp)
        }
        if (this.renderer) this.renderer.dispose()
        if (this.platform) this.platform.removeAll()
    }
    
    // --- Mouse interaction (Kiri:Moto pattern) ---
    
    onMouseDown(event: MouseEvent) {
        if (event.button !== 0) return // Left click only
        
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.platform) return
        
        const rect = container.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        
        this.mouseStart = { x: this.mouse.x, y: this.mouse.y }
        
        // Raycast against widget meshes
        this.raycaster.setFromCamera(this.mouse, this.camera)
        const meshes = this.platform.getMeshes()
        const intersections = this.raycaster.intersectObjects(meshes, false)
        
        if (intersections.length > 0) {
            const hit = intersections[0]
            const widget = this.platform.widgetFromIntersection(hit)
            
            if (widget) {
                // Ctrl+click = lay flat on face
                if (event.ctrlKey || event.metaKey) {
                    if (hit.face) {
                        widget.layFlatOnFace(hit.face.normal)
                    }
                    return
                }
                
                // Start drag - record start point on platform plane
                if (this.dragPlatformPlane) {
                    const planeHits = this.raycaster.intersectObject(this.dragPlatformPlane, false)
                    if (planeHits.length > 0) {
                        this.mouseDragPoint = planeHits[0].point.clone()
                        this.isDraggingWidget = true
                        if (this.controls) this.controls.enabled = false
                    }
                }
                
                // Select on mousedown if not already selected
                if (!this.platform.isSelected(widget)) {
                    this.platform.select(widget, event.shiftKey)
                    this.syncAndUpdate()
                }
            }
        }
    }
    
    onMouseMove(event: MouseEvent) {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.platform) return
        
        const rect = container.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        
        this.raycaster.setFromCamera(this.mouse, this.camera)
        
        if (this.isDraggingWidget && this.mouseDragPoint && this.dragPlatformPlane) {
            // Drag mode: compute delta on platform plane
            const planeHits = this.raycaster.intersectObject(this.dragPlatformPlane, false)
            if (planeHits.length > 0) {
                const newPoint = planeHits[0].point
                const delta = newPoint.clone().sub(this.mouseDragPoint)
                this.mouseDragPoint = newPoint.clone()
                
                // Move selected widgets (delta.x = X, delta.z = Y on platform)
                this.platform.moveSelected(delta.x, delta.z, 0)
            }
        } else {
            // Hover mode: highlight widget under cursor
            const meshes = this.platform.getMeshes()
            const intersections = this.raycaster.intersectObjects(meshes, false)
            
            if (intersections.length > 0) {
                const widget = this.platform.widgetFromIntersection(intersections[0])
                this.platform.setHover(widget)
                if (container) container.style.cursor = 'pointer'
            } else {
                this.platform.setHover(null)
                if (container) container.style.cursor = 'default'
            }
        }
    }
    
    onMouseUp(event: MouseEvent) {
        if (event.button !== 0) return
        
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container || !this.camera || !this.platform) return
        
        // Re-enable orbit controls
        if (this.controls && this.isDraggingWidget) {
            this.controls.enabled = true
        }
        
        // Check if it was a click (no movement) vs drag
        const rect = container.getBoundingClientRect()
        const mouseEnd = {
            x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
        }
        
        const isClick = this.mouseStart &&
            Math.abs(mouseEnd.x - this.mouseStart.x) < 0.01 &&
            Math.abs(mouseEnd.y - this.mouseStart.y) < 0.01
        
        if (isClick && !this.isDraggingWidget) {
            // Click on empty space = deselect
            this.raycaster.setFromCamera(this.mouse, this.camera)
            const meshes = this.platform.getMeshes()
            const intersections = this.raycaster.intersectObjects(meshes, false)
            
            if (intersections.length > 0) {
                const widget = this.platform.widgetFromIntersection(intersections[0])
                if (widget) {
                    this.platform.select(widget, event.shiftKey)
                    this.syncAndUpdate()
                }
            } else {
                this.platform.deselect()
                this.syncAndUpdate()
            }
        }
        
        this.mouseDragPoint = null
        this.mouseStart = null
        this.isDraggingWidget = false
    }
    
    // --- Keyboard shortcuts (Kiri:Moto style) ---
    
    handleKeyDown(event: KeyboardEvent) {
        // Don't handle keys if typing in input
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
        
        const ctrl = event.ctrlKey || event.metaKey
        const shift = event.shiftKey
        const alt = event.altKey
        
        switch (event.key) {
            // File operations
            case 'i':
                if (ctrl) { event.preventDefault(); this.openFilePicker() }
                else this.openFilePicker()
                break
            
            // Selection
            case 'a':
                if (ctrl) { event.preventDefault(); this.selectAll() }
                else this.arrangeAll()
                break
            case 'Escape':
                this.platform?.deselect()
                this.syncAndUpdate()
                break
            
            // Model operations
            case 'd': this.duplicateSelected(); break
            case 'm': this.mirrorSelected(); break
            case 'Delete':
            case 'Backspace':
                event.preventDefault()
                this.deleteSelected()
                break
            
            // Arrow keys: rotate (default) or move (with Alt)
            case 'ArrowLeft':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(-5, 0, 0)
                else this.platform?.rotateSelected(0, 0, shift ? DEG5 : DEG90)
                this.syncAndUpdate()
                break
            case 'ArrowRight':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(5, 0, 0)
                else this.platform?.rotateSelected(0, 0, shift ? -DEG5 : -DEG90)
                this.syncAndUpdate()
                break
            case 'ArrowUp':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(0, 5, 0)
                else this.platform?.rotateSelected(shift ? DEG5 : DEG90, 0, 0)
                this.syncAndUpdate()
                break
            case 'ArrowDown':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(0, -5, 0)
                else this.platform?.rotateSelected(shift ? -DEG5 : -DEG90, 0, 0)
                this.syncAndUpdate()
                break
            
            // View shortcuts
            case 'Home': this.resetCamera(); break
            case 'f': case 'F': this.fitCameraToAll(); break
            case 't': case 'T': this.setViewTop(); break
            case 'w': case 'W':
                this.viewMode = this.viewMode === 'wireframe' ? 'solid' : 'wireframe'
                break
        }
    }
    
    // --- Context menu ---
    
    showContextMenu(event: MouseEvent) {
        this.contextMenu.x = event.clientX
        this.contextMenu.y = event.clientY
        this.contextMenu.show = true
    }
    
    // --- File operations ---
    
    openFilePicker() {
        const input = this.$refs.fileInput as HTMLInputElement
        input?.click()
    }
    
    handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement
        if (input.files) {
            for (let i = 0; i < input.files.length; i++) {
                this.loadModelFile(input.files[i])
            }
        }
        // Reset input so same file can be selected again
        input.value = ''
    }
    
    handleFileDrop(event: DragEvent) {
        this.isDragging = false
        if (event.dataTransfer?.files) {
            for (let i = 0; i < event.dataTransfer.files.length; i++) {
                this.loadModelFile(event.dataTransfer.files[i])
            }
        }
    }
    
    async loadModelFile(file: File) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        const allowedExts = ['.stl', '.3mf', '.obj']
        
        if (!allowedExts.includes(ext)) {
            this.$toast?.error?.(`Unsupported file type: ${ext}`)
            return
        }
        
        this.isProcessing = true
        this.processingMessage = `Loading ${file.name}...`
        
        try {
            const result: LoadResult = await loadMeshFile(file)
            
            if (!this.platform || !this.scene) return
            
            // Create widgets for each geometry in the file
            for (const { name, geometry } of result.geometries) {
                // Ensure normals
                if (!geometry.attributes.normal) {
                    geometry.computeVertexNormals()
                }
                
                const widget = new PrepareWidget(geometry, name || file.name)
                this.platform.add(widget, true)
                
                // Select the newly added widget
                this.platform.select(widget, result.geometries.length > 1)
            }
            
            // Apply current view mode
            this.onViewModeChange(this.viewMode)
            
            // Fit camera to show all
            this.fitCameraToAll()
            this.syncAndUpdate()
            
        } catch (error) {
            console.error('Failed to load model:', error)
            this.$toast?.error?.('Failed to load model')
        } finally {
            this.isProcessing = false
        }
    }
    
    // --- Platform operations ---
    
    clearPlatform() {
        this.platform?.removeAll()
        this.syncAndUpdate()
    }
    
    selectAll() {
        this.platform?.selectAll()
        this.syncAndUpdate()
    }
    
    deleteSelected() {
        this.platform?.removeSelected()
        this.syncAndUpdate()
    }
    
    deleteWidget(widget: PrepareWidget) {
        this.platform?.remove(widget)
        this.syncAndUpdate()
    }
    
    centerSelected() {
        this.platform?.centerSelected()
    }
    
    layFlatSelected() {
        if (!this.platform) return
        for (const w of this.platform.selected) {
            w.layFlat()
        }
    }
    
    duplicateSelected() {
        this.platform?.duplicateSelected()
        this.syncAndUpdate()
    }
    
    mirrorSelected() {
        this.platform?.mirrorSelected()
    }
    
    arrangeAll() {
        this.platform?.arrange()
    }
    
    // --- Widget list sidebar ---
    
    isWidgetSelected(widget: PrepareWidget): boolean {
        return this.platform?.isSelected(widget) || false
    }
    
    onWidgetListClick(widget: PrepareWidget, event: MouseEvent) {
        this.platform?.select(widget, event.shiftKey)
        this.fitCameraToSelection()
        this.syncAndUpdate()
    }
    
    onWidgetListHover(widget: PrepareWidget | null) {
        this.platform?.setHover(widget)
    }
    
    // --- Panel component event handlers ---
    
    onWidgetPanelSelect({ widget, shiftKey, ctrlKey }: { widget: PrepareWidget; shiftKey: boolean; ctrlKey: boolean }) {
        if (!this.platform) return
        if (ctrlKey) {
            // Toggle selection
            if (this.platform.isSelected(widget)) {
                this.platform.deselect(widget)
            } else {
                this.platform.select(widget, true)
            }
        } else {
            this.platform.select(widget, shiftKey)
        }
        this.fitCameraToSelection()
        this.syncAndUpdate()
    }
    
    handlePanelAction(action: string) {
        switch (action) {
            case 'selectAll': this.selectAll(); break
            case 'arrange': this.arrangeAll(); break
            case 'clear': this.clearPlatform(); break
            case 'centerSelected': this.centerSelected(); break
            case 'layFlat': this.layFlatSelected(); break
            case 'mirror': this.mirrorSelected(); break
        }
    }
    
    toggleWidgetVisibility(widget: PrepareWidget) {
        if (!widget.mesh) return
        const visible = widget.mesh.visible
        widget.mesh.visible = !visible
        this.syncAndUpdate()
    }
    
    toggleWidgetLock(widget: PrepareWidget) {
        // Toggle locked state (stored on widget)
        ;(widget as any).locked = !(widget as any).locked
        this.syncAndUpdate()
    }
    
    applyTransform({ type, value }: { type: string; value: { x: number; y: number; z: number } }) {
        if (!this.platform || !this.hasSelection) return
        
        for (const widget of this.platform.selected) {
            switch (type) {
                case 'position':
                    widget.move(value.x, value.y, value.z, true)
                    break
                case 'rotation':
                    // Reset and apply new rotation
                    widget.rotate(value.x - widget.track.rot.x, value.y - widget.track.rot.y, value.z - widget.track.rot.z)
                    break
                case 'scale':
                    widget.scale(value.x, value.y, value.z)
                    break
            }
        }
        
        this.platform.dropToFloor(this.platform.selected)
        this.syncAndUpdate()
    }
    
    resetTransform() {
        if (!this.platform || !this.hasSelection) return
        
        for (const widget of this.platform.selected) {
            // Reset scale
            widget.scale(1, 1, 1)
            // Center the widget
            widget.move(0, 0, 0, true)
        }
        
        this.platform.dropToFloor(this.platform.selected)
        this.centerSelected()
        this.syncAndUpdate()
    }
    
    // --- Toolbar transform methods ---
    
    updateTransformInputsFromSelection() {
        const defaultInputs = { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
        
        if (!this.platform || !this.hasSelection) {
            this.transformInputs = defaultInputs
            return
        }
        
        const widget = this.platform.selected[0]
        if (!widget || !widget.mesh || !widget.track) {
            this.transformInputs = defaultInputs
            return
        }
        
        const pos = widget.mesh.position
        const rot = widget.track.rot
        const scale = widget.track.scale
        
        if (!pos || !rot || !scale) {
            this.transformInputs = defaultInputs
            return
        }
        
        this.transformInputs.posX = Math.round(pos.x * 10) / 10
        this.transformInputs.posY = Math.round(pos.z * 10) / 10  // Z in Three.js is Y on platform
        this.transformInputs.posZ = Math.round(pos.y * 10) / 10  // Y in Three.js is Z height
        this.transformInputs.rotX = Math.round((rot.x * 180 / Math.PI) * 10) / 10
        this.transformInputs.rotY = Math.round((rot.y * 180 / Math.PI) * 10) / 10
        this.transformInputs.rotZ = Math.round((rot.z * 180 / Math.PI) * 10) / 10
        this.transformInputs.scaleX = Math.round(scale.x * 100) / 100
        this.transformInputs.scaleY = Math.round(scale.y * 100) / 100
        this.transformInputs.scaleZ = Math.round(scale.z * 100) / 100
    }
    
    applyPositionFromInputs() {
        if (!this.platform || !this.hasSelection) return
        
        for (const widget of this.platform.selected) {
            widget.move(
                this.transformInputs.posX,
                this.transformInputs.posY,
                this.transformInputs.posZ,
                true
            )
        }
        this.platform.dropToFloor(this.platform.selected)
        this.syncAndUpdate()
    }
    
    applyRotationFromInputs() {
        if (!this.platform || !this.hasSelection) return
        
        const toRad = Math.PI / 180
        for (const widget of this.platform.selected) {
            const currentRot = widget.track.rot
            widget.rotate(
                this.transformInputs.rotX * toRad - currentRot.x,
                this.transformInputs.rotY * toRad - currentRot.y,
                this.transformInputs.rotZ * toRad - currentRot.z
            )
        }
        this.platform.dropToFloor(this.platform.selected)
        this.syncAndUpdate()
    }
    
    applyScaleFromInputs(axis: string) {
        if (!this.platform || !this.hasSelection) return
        
        if (this.uniformScale) {
            // Apply same scale to all axes
            const scale = axis === 'x' ? this.transformInputs.scaleX : axis === 'y' ? this.transformInputs.scaleY : this.transformInputs.scaleZ
            this.transformInputs.scaleX = scale
            this.transformInputs.scaleY = scale
            this.transformInputs.scaleZ = scale
            
            for (const widget of this.platform.selected) {
                widget.scale(scale, scale, scale)
            }
        } else {
            for (const widget of this.platform.selected) {
                widget.scale(
                    this.transformInputs.scaleX,
                    this.transformInputs.scaleY,
                    this.transformInputs.scaleZ
                )
            }
        }
        this.platform.dropToFloor(this.platform.selected)
        this.syncAndUpdate()
    }
    
    rotateBy(degrees: number, axis: string) {
        if (!this.platform || !this.hasSelection) return
        
        const rad = degrees * Math.PI / 180
        for (const widget of this.platform.selected) {
            if (axis === 'x') widget.rotate(rad, 0, 0)
            else if (axis === 'y') widget.rotate(0, rad, 0)
            else if (axis === 'z') widget.rotate(0, 0, rad)
        }
        this.platform.dropToFloor(this.platform.selected)
        this.updateTransformInputsFromSelection()
        this.syncAndUpdate()
    }
    
    scaleBy(factor: number) {
        if (!this.platform || !this.hasSelection) return
        
        for (const widget of this.platform.selected) {
            widget.scale(factor, factor, factor)
        }
        this.platform.dropToFloor(this.platform.selected)
        this.updateTransformInputsFromSelection()
        this.syncAndUpdate()
    }
    
    mirrorAxis(axis: string) {
        if (!this.platform || !this.hasSelection) return
        
        for (const widget of this.platform.selected) {
            if (axis === 'x') widget.mirror('x')
            else if (axis === 'y') widget.mirror('y')
            else if (axis === 'z') widget.mirror('z')
        }
        this.syncAndUpdate()
        this.toolbarMenus.mirror = false
    }
    
    saveProfile() {
        // TODO: Show profile save dialog
        console.log('Save profile - to be implemented')
    }
    
    loadProfile() {
        // TODO: Show profile load dialog
        console.log('Load profile - to be implemented')
    }
    
    // --- Printer Profile Management ---
    
    selectPrinterProfile(profileId: string) {
        this.$store.dispatch('prepare/selectPrinter', profileId)
        this.showPrinterMenu = false
    }
    
    createNewPrinterProfile() {
        this.editingProfileId = null
        this.printerProfileForm = { 
            ...EMPTY_PRINTER_PROFILE,
            id: `custom-${Date.now()}`,
        }
        this.showPrinterMenu = false
        this.showPrinterProfileDialog = true
    }
    
    editPrinterProfile(profile: PrinterProfile) {
        this.editingProfileId = profile.id
        this.printerProfileForm = { 
            ...profile,
            buildVolume: { ...profile.buildVolume },
        }
        this.showPrinterMenu = false
        this.showPrinterProfileDialog = true
    }
    
    savePrinterProfile() {
        const profile: PrinterProfile = {
            ...this.printerProfileForm,
            buildVolume: { ...this.printerProfileForm.buildVolume },
        }
        if (!profile.name.trim()) {
            profile.name = 'Custom Printer'
        }
        
        if (this.editingProfileId) {
            this.$store.dispatch('prepare/updatePrinterProfile', profile)
        } else {
            this.$store.dispatch('prepare/addPrinterProfile', profile)
        }
        
        this.closePrinterProfileDialog()
    }
    
    deletePrinterProfile() {
        if (!this.editingProfileId) return
        this.$store.dispatch('prepare/deletePrinterProfile', this.editingProfileId)
        this.closePrinterProfileDialog()
    }
    
    closePrinterProfileDialog() {
        this.showPrinterProfileDialog = false
        this.editingProfileId = null
        this.printerProfileForm = { ...EMPTY_PRINTER_PROFILE }
    }
    
    rebuildBuildVolume() {
        if (!this.scene) return
        const profile = this.currentPrinterProfile
        
        // Update the build volume visualization
        this.updateBuildVolume()
        
        // Update platform config if platform exists
        if (this.platform) {
            this.platform.config = {
                bedWidth: profile.buildVolume.x,
                bedDepth: profile.buildVolume.y,
                bedHeight: profile.buildVolume.z,
                gap: 5,
            }
        }
        
        // Reposition camera to fit new build volume
        this.resetCamera()
    }

    formatWidgetDimensions(widget: PrepareWidget): string {
        const bb = widget.getBoundingBox()
        const size = new THREE.Vector3()
        bb.getSize(size)
        return `${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`
    }
    
    // --- Camera controls ---
    
    resetCamera() {
        if (!this.camera || !this.controls) return
        const profile = this.getPrinterProfile()
        const cx = profile.bed_size_x / 2
        const cz = profile.bed_size_y / 2
        const dist = Math.max(profile.bed_size_x, profile.bed_size_y) * 1.2
        
        this.tweenCamera(
            new THREE.Vector3(cx + dist, dist * 0.8, cz + dist),
            new THREE.Vector3(cx, 0, cz)
        )
    }
    
    setViewTop() {
        if (!this.camera || !this.controls) return
        const profile = this.getPrinterProfile()
        const cx = profile.bed_size_x / 2
        const cz = profile.bed_size_y / 2
        this.tweenCamera(
            new THREE.Vector3(cx, profile.bed_size_z * 2, cz + 0.01),
            new THREE.Vector3(cx, 0, cz)
        )
    }
    
    setViewFront() {
        if (!this.camera || !this.controls) return
        const profile = this.getPrinterProfile()
        const cx = profile.bed_size_x / 2
        this.tweenCamera(
            new THREE.Vector3(cx, profile.bed_size_z / 2, profile.bed_size_y * 2),
            new THREE.Vector3(cx, profile.bed_size_z / 2, 0)
        )
    }
    
    setViewRight() {
        if (!this.camera || !this.controls) return
        const profile = this.getPrinterProfile()
        const cz = profile.bed_size_y / 2
        this.tweenCamera(
            new THREE.Vector3(profile.bed_size_x * 2, profile.bed_size_z / 2, cz),
            new THREE.Vector3(0, profile.bed_size_z / 2, cz)
        )
    }
    
    fitCameraToAll() {
        if (!this.platform || !this.camera || !this.controls) return
        
        if (this.platform.widgetCount === 0) {
            this.resetCamera()
            return
        }
        
        const bounds = this.platform.getAllBounds()
        this.fitCameraToBounds(bounds)
    }
    
    fitCameraToSelection() {
        if (!this.platform || !this.camera || !this.controls) return
        const bounds = this.platform.getSelectionBounds()
        if (bounds) this.fitCameraToBounds(bounds)
    }
    
    fitCameraToBounds(bounds: THREE.Box3) {
        if (!this.camera || !this.controls) return
        
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        
        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = this.camera.fov * (Math.PI / 180)
        const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5
        
        this.tweenCamera(
            new THREE.Vector3(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7),
            center
        )
    }
    
    /**
     * Animated camera transition
     */
    private tweenCamera(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3) {
        if (!this.camera || !this.controls) return
        
        const startPos = this.camera.position.clone()
        const startTarget = this.controls.target.clone()
        const duration = 400 // ms
        const startTime = performance.now()
        
        const animate = () => {
            const elapsed = performance.now() - startTime
            const t = Math.min(elapsed / duration, 1)
            // Ease out cubic
            const ease = 1 - Math.pow(1 - t, 3)
            
            this.camera!.position.lerpVectors(startPos, targetPosition, ease)
            this.controls!.target.lerpVectors(startTarget, targetLookAt, ease)
            this.controls!.update()
            
            if (t < 1) {
                requestAnimationFrame(animate)
            }
        }
        
        requestAnimationFrame(animate)
    }
    
    // --- Export ---
    
    exportSelectedSTL() {
        if (!this.platform || this.platform.selectionCount === 0) return
        
        const selected = this.platform.selected
        // Combine all selected geometries
        const positions: number[] = []
        for (const w of selected) {
            const pos = w.mesh.geometry.attributes.position
            if (pos) {
                for (let i = 0; i < pos.count; i++) {
                    positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
                }
            }
        }
        
        const vertices = new Float32Array(positions)
        const buffer = encodeSTL(vertices)
        
        const blob = new Blob([buffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'export.stl'
        a.click()
        URL.revokeObjectURL(url)
    }
    
    // --- Slicing ---
    
    /** Last generated G-code for download/preview */
    private lastGcodeOutput = ''
    
    /**
     * Extract raw triangle vertices from all widgets on the platform.
     * Returns a single Float32Array with all triangles merged,
     * transformed to world space in slicer coordinates (X right, Y depth, Z up).
     */
    private extractVertices(): Float32Array | null {
        if (!this.platform || this.platform.widgets.length === 0) return null
        
        const allPositions: number[] = []
        
        for (const widget of this.platform.widgets) {
            const geo = widget.mesh.geometry as THREE.BufferGeometry
            const posAttr = geo.getAttribute('position')
            if (!posAttr) continue
            
            // Apply mesh world transform to get actual vertex positions
            const tempGeo = geo.clone()
            tempGeo.applyMatrix4(widget.mesh.matrixWorld)
            const pos = tempGeo.getAttribute('position')
            
            if (geo.index) {
                // Indexed geometry — expand to non-indexed
                const idx = geo.index
                for (let i = 0; i < idx.count; i++) {
                    const vi = idx.getX(i)
                    // Three.js: x=X, y=Z(height), z=Y(depth)
                    // Slicer wants: x=X, y=Y(depth), z=Z(height)
                    allPositions.push(pos.getX(vi), pos.getZ(vi), pos.getY(vi))
                }
            } else {
                // Non-indexed geometry
                for (let i = 0; i < pos.count; i++) {
                    allPositions.push(pos.getX(i), pos.getZ(i), pos.getY(i))
                }
            }
            
            tempGeo.dispose()
        }
        
        return new Float32Array(allPositions)
    }
    
    async startSlicing() {
        if (!this.hasWidgets) return
        
        this.isSlicing = true
        this.showSlicingDialog = true
        this.slicingProgress = 0
        this.slicingMessage = 'Preparing mesh data...'
        
        try {
            // Extract vertices from all widgets
            const vertices = this.extractVertices()
            if (!vertices || vertices.length === 0) {
                throw new Error('No mesh geometry found')
            }
            
            // Map settings
            const config = mapSettings(this.sliceParams, this.currentPrinterProfile)
            
            this.slicingMessage = 'Starting slicer engine...'
            
            // Run slicer in Web Worker
            const engine = getSlicerEngine()
            const output = await engine.slice(vertices, config, (progress) => {
                this.slicingProgress = progress.progress
                this.slicingMessage = progress.message
            })
            
            // Store the G-code
            this.lastGcodeOutput = output.gcode
            this.$store.commit('prepare/setLastGcode', output.gcode)
            
            // Show results
            this.sliceResult = {
                layer_count: output.result.layerCount,
                filament_used_m: output.result.filamentUsedM,
                filament_weight_g: output.result.filamentWeightG,
                estimated_time_formatted: output.result.estimatedTimeFormatted,
            }
            
            this.jobId = Date.now().toString(36)
            this.showSlicingDialog = false
            this.showResultDialog = true
            
        } catch (error: any) {
            console.error('Slicing failed:', error)
            this.slicingMessage = `Error: ${error.message}`
            // Keep dialog open briefly to show error
            await new Promise(resolve => setTimeout(resolve, 2000))
        } finally {
            this.isSlicing = false
            this.showSlicingDialog = false
        }
    }
    
    // --- Helpers ---
    
    getPrinterProfile() {
        const profile = this.currentPrinterProfile
        return {
            name: profile.name,
            bed_size_x: profile.buildVolume.x,
            bed_size_y: profile.buildVolume.y,
            bed_size_z: profile.buildVolume.z,
            nozzle_diameter: profile.nozzleDiameter,
            filament_diameter: profile.filamentDiameter,
        }
    }
    
    formatTime(minutes: number): string {
        const hours = Math.floor(minutes / 60)
        const mins = Math.round(minutes % 60)
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
    }
    
    formatNumber(num: number): string {
        return num.toLocaleString()
    }
    
    previewGcode() {
        this.showResultDialog = false
        this.$router.push({ path: '/preview' })
    }
    
    async downloadGcode() {
        if (!this.lastGcodeOutput) return
        
        // Generate filename from first widget name
        let filename = 'model'
        if (this.platform && this.platform.widgets.length > 0) {
            const name = this.platform.widgets[0].name
            if (name) {
                filename = name.replace(/\.[^.]+$/, '') // strip extension
            }
        }
        filename += `_${this.sliceParams.layer_height}mm.gcode`
        
        const blob = new Blob([this.lastGcodeOutput], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }
    
    async uploadGcodeToMoonraker() {
        if (!this.lastGcodeOutput) return
        
        let filename = 'model'
        if (this.platform && this.platform.widgets.length > 0) {
            const name = this.platform.widgets[0].name
            if (name) {
                filename = name.replace(/\.[^.]+$/, '')
            }
        }
        filename += `_${this.sliceParams.layer_height}mm.gcode`
        
        try {
            const blob = new Blob([this.lastGcodeOutput], { type: 'text/plain' })
            const formData = new FormData()
            formData.append('file', blob, filename)
            formData.append('root', 'gcodes')
            
            const token = localStorage.getItem('fleet_token')
            const headers: Record<string, string> = {}
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }
            
            const response = await axios.post('/api/files/upload', formData, {
                headers: {
                    ...headers,
                    'Content-Type': 'multipart/form-data',
                },
            })
            
            this.showResultDialog = false
            this.$toast?.success?.(`Uploaded ${filename}`)
        } catch (error: any) {
            console.error('Upload failed:', error)
            this.$toast?.error?.(`Upload failed: ${error.message}`)
        }
    }
}
</script>

<style scoped>
.prepare-page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
}

/* Full-screen 3D viewer */
.viewer-fullscreen {
    position: absolute;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
}

.viewer-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}

/* Left toolbar */
.left-toolbar {
    position: absolute;
    top: 60px;
    left: 12px;
    bottom: 60px;
    width: 48px;
    background: rgba(30, 30, 46, 0.95);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar-btn {
    margin: 2px 0;
}

.toolbar-btn.active {
    background: rgba(var(--v-primary-base), 0.2) !important;
}

.toolbar-btn:disabled {
    opacity: 0.4;
}

.toolbar-popout {
    background: rgba(30, 30, 46, 0.98) !important;
    backdrop-filter: blur(8px);
}

/* Floating panels */
.floating-panel {
    position: absolute;
    top: 60px;
    bottom: 60px;
    width: 300px;
    background: rgba(30, 30, 46, 0.95);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    z-index: 100;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.floating-panel-left {
    left: 72px;
}

.floating-panel-right {
    right: 12px;
}

.panel-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

/* Right panel toggle button */
.panel-toggle {
    position: absolute;
    top: 60px;
    z-index: 101;
    background: rgba(30, 30, 46, 0.95) !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-toggle-right {
    right: 12px;
}

/* Slide transitions for right panel */
.slide-right-enter-active,
.slide-right-leave-active {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-right-enter,
.slide-right-leave-to {
    transform: translateX(320px);
    opacity: 0;
}

/* Info bar and overlays */
.drop-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(30, 30, 46, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border: 3px dashed var(--v-primary-base);
    margin: 8px;
    border-radius: 8px;
}

.model-info-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.6);
    padding: 8px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    z-index: 5;
}

.empty-hint {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    opacity: 0.6;
}

:deep(.v-expansion-panel-header) {
    min-height: 40px;
    padding: 8px 16px;
}

:deep(.v-expansion-panel-content__wrap) {
    padding: 8px 16px 16px;
}

/* Top bar */
.top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 48px;
    background: rgba(30, 30, 46, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 101;
    display: flex;
    align-items: center;
    padding: 0 12px;
    backdrop-filter: blur(8px);
}

.top-bar-left {
    flex: 1;
    display: flex;
    align-items: center;
}

.top-bar-center {
    flex: 2;
    display: flex;
    align-items: center;
    justify-content: center;
}

.top-bar-right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

.printer-selector {
    text-transform: none !important;
    letter-spacing: normal !important;
}

.printer-menu-card {
    background: rgba(30, 30, 46, 0.98) !important;
    backdrop-filter: blur(8px);
    min-width: 300px;
}
</style>
