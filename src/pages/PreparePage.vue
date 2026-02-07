<template>
    <div class="prepare-page" @contextmenu.prevent="showContextMenu">
        <!-- Top Menu Bar -->
        <v-toolbar dense flat class="toolbar-menu">
            <v-menu offset-y>
                <template #activator="{ on, attrs }">
                    <v-btn text small v-bind="attrs" v-on="on">
                        <v-icon left small>{{ icons.mdiFile }}</v-icon>
                        File
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item @click="openFilePicker">
                        <v-list-item-icon><v-icon>{{ icons.mdiImport }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Import Model...</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">Ctrl+I</v-list-item-action>
                    </v-list-item>
                    <v-list-item :disabled="!hasWidgets" @click="clearPlatform">
                        <v-list-item-icon><v-icon>{{ icons.mdiClose }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Clear Platform</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item :disabled="!hasSelection" @click="exportSelectedSTL">
                        <v-list-item-icon><v-icon>{{ icons.mdiExport }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Export STL...</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>

            <v-menu offset-y>
                <template #activator="{ on, attrs }">
                    <v-btn text small v-bind="attrs" v-on="on">
                        <v-icon left small>{{ icons.mdiEye }}</v-icon>
                        View
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item @click="resetCamera">
                        <v-list-item-icon><v-icon>{{ icons.mdiCameraFlip }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Reset Camera</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">Home</v-list-item-action>
                    </v-list-item>
                    <v-list-item @click="fitCameraToAll">
                        <v-list-item-icon><v-icon>{{ icons.mdiCropFree }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Fit All</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">F</v-list-item-action>
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="setViewTop">
                        <v-list-item-icon><v-icon>{{ icons.mdiArrowUpBold }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Top View</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">T</v-list-item-action>
                    </v-list-item>
                    <v-list-item @click="setViewFront">
                        <v-list-item-icon><v-icon>{{ icons.mdiArrowDownBold }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Front View</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="setViewRight">
                        <v-list-item-icon><v-icon>{{ icons.mdiArrowRightBold }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Right View</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="viewMode = 'solid'">
                        <v-list-item-icon><v-icon>{{ icons.mdiCube }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Solid</v-list-item-title>
                        <v-list-item-action><v-icon v-if="viewMode === 'solid'" small color="primary">{{ icons.mdiCheck }}</v-icon></v-list-item-action>
                    </v-list-item>
                    <v-list-item @click="viewMode = 'wireframe'">
                        <v-list-item-icon><v-icon>{{ icons.mdiVectorSquare }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Wireframe</v-list-item-title>
                        <v-list-item-action><v-icon v-if="viewMode === 'wireframe'" small color="primary">{{ icons.mdiCheck }}</v-icon></v-list-item-action>
                    </v-list-item>
                    <v-list-item @click="viewMode = 'xray'">
                        <v-list-item-icon><v-icon>{{ icons.mdiRadioactive }}</v-icon></v-list-item-icon>
                        <v-list-item-title>X-Ray</v-list-item-title>
                        <v-list-item-action><v-icon v-if="viewMode === 'xray'" small color="primary">{{ icons.mdiCheck }}</v-icon></v-list-item-action>
                    </v-list-item>
                </v-list>
            </v-menu>

            <v-menu offset-y>
                <template #activator="{ on, attrs }">
                    <v-btn text small v-bind="attrs" v-on="on">
                        <v-icon left small>{{ icons.mdiCubeOutline }}</v-icon>
                        Model
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item :disabled="!hasSelection" @click="centerSelected">
                        <v-list-item-icon><v-icon>{{ icons.mdiAlignHorizontalCenter }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Center on Platform</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="!hasSelection" @click="layFlatSelected">
                        <v-list-item-icon><v-icon>{{ icons.mdiAlignVerticalBottom }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Lay Flat</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item :disabled="!hasSelection" @click="duplicateSelected">
                        <v-list-item-icon><v-icon>{{ icons.mdiContentDuplicate }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Duplicate</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">D</v-list-item-action>
                    </v-list-item>
                    <v-list-item :disabled="!hasSelection" @click="mirrorSelected">
                        <v-list-item-icon><v-icon>{{ icons.mdiFlipHorizontal }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Mirror</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">M</v-list-item-action>
                    </v-list-item>
                    <v-list-item :disabled="!hasSelection" @click="deleteSelected">
                        <v-list-item-icon><v-icon>{{ icons.mdiDelete }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Delete</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">Del</v-list-item-action>
                    </v-list-item>
                    <v-divider />
                    <v-list-item :disabled="!hasWidgets" @click="arrangeAll">
                        <v-list-item-icon><v-icon>{{ icons.mdiViewGrid }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Auto Arrange</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">A</v-list-item-action>
                    </v-list-item>
                    <v-list-item @click="selectAll">
                        <v-list-item-icon><v-icon>{{ icons.mdiSelectAll }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Select All</v-list-item-title>
                        <v-list-item-action class="text-caption grey--text">Ctrl+A</v-list-item-action>
                    </v-list-item>
                </v-list>
            </v-menu>

            <v-spacer />

            <!-- Printer profile selector in toolbar -->
            <v-select
                v-model="selectedPrinter"
                :items="printerProfiles"
                item-text="name"
                item-value="id"
                dense
                hide-details
                outlined
                class="printer-select"
                style="max-width: 250px" />
        </v-toolbar>

        <!-- Hidden file input (multiple) -->
        <input
            ref="fileInput"
            type="file"
            accept=".stl,.3mf,.obj"
            multiple
            style="display: none"
            @change="handleFileSelect" />

        <v-row no-gutters class="main-content">
            <!-- Left Panel: Widget List -->
            <v-col v-if="hasWidgets" cols="2" class="widget-list-column">
                <v-card flat tile class="fill-height overflow-y-auto widget-list-panel">
                    <v-card-title class="py-2 text-subtitle-2">
                        <v-icon left small>{{ icons.mdiCubeOutline }}</v-icon>
                        Objects ({{ widgetCount }})
                    </v-card-title>
                    <v-list dense>
                        <v-list-item
                            v-for="widget in widgets"
                            :key="widget.id"
                            :class="{ 'widget-selected': isWidgetSelected(widget) }"
                            @click="onWidgetListClick(widget, $event)"
                            @mouseenter="onWidgetListHover(widget)"
                            @mouseleave="onWidgetListHover(null)">
                            <v-list-item-icon>
                                <v-icon small :color="isWidgetSelected(widget) ? 'primary' : ''">
                                    {{ icons.mdiCube }}
                                </v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title class="text-caption">
                                    {{ widget.name }}
                                </v-list-item-title>
                                <v-list-item-subtitle class="text-caption">
                                    {{ formatWidgetDimensions(widget) }}
                                </v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action>
                                <v-btn icon x-small @click.stop="deleteWidget(widget)">
                                    <v-icon x-small>{{ icons.mdiClose }}</v-icon>
                                </v-btn>
                            </v-list-item-action>
                        </v-list-item>
                    </v-list>
                </v-card>
            </v-col>

            <!-- Center Panel: 3D Preview -->
            <v-col :cols="viewerCols" class="preview-column">
                <div class="viewer-wrapper">
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

                    <!-- Selection info bar (bottom of viewer) -->
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

                    <!-- Platform info bar (when no selection) -->
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

                    <!-- Empty state hint -->
                    <div v-if="!hasWidgets && !isProcessing" class="empty-hint">
                        <v-icon size="48" color="grey darken-1">{{ icons.mdiCube }}</v-icon>
                        <div class="text-body-1 grey--text mt-2">Drag &amp; drop or use File → Import</div>
                        <div class="text-caption grey--text mt-1">Supports STL, 3MF, OBJ</div>
                    </div>
                </div>
            </v-col>
            
            <!-- Right Panel: Slicing Settings -->
            <v-col cols="3" class="settings-column">
                <v-card class="fill-height overflow-y-auto settings-panel" flat tile>
                    <v-card-title class="py-2">
                        <v-icon left>{{ icons.mdiTune }}</v-icon>
                        Slice Settings
                    </v-card-title>
                    
                    <v-card-text>
                        <!-- Quick Presets -->
                        <div class="mb-4">
                            <div class="text-subtitle-2 mb-2">Quality Preset</div>
                            <v-btn-toggle v-model="qualityPreset" mandatory color="primary" class="d-flex">
                                <v-btn small value="draft" class="flex-grow-1">Draft</v-btn>
                                <v-btn small value="normal" class="flex-grow-1">Normal</v-btn>
                                <v-btn small value="fine" class="flex-grow-1">Fine</v-btn>
                                <v-btn small value="ultra" class="flex-grow-1">Ultra</v-btn>
                            </v-btn-toggle>
                        </div>
                        
                        <v-divider class="mb-4" />
                        
                        <v-expansion-panels v-model="openPanels" multiple flat>
                            <!-- Layer Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiLayers }}</v-icon>
                                    Layer Settings
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider v-model="sliceParams.layer_height" label="Layer Height"
                                        :min="0.05" :max="0.4" :step="0.01"
                                        thumb-label="always" :thumb-size="24" suffix="mm" />
                                    <v-slider v-model="sliceParams.first_layer_height" label="First Layer"
                                        :min="0.1" :max="0.5" :step="0.01"
                                        thumb-label="always" :thumb-size="24" suffix="mm" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Walls & Infill -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiGridLarge }}</v-icon>
                                    Walls &amp; Infill
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider v-model="sliceParams.wall_count" label="Wall Count"
                                        :min="1" :max="10" :step="1" thumb-label />
                                    <v-slider v-model="sliceParams.infill_density" label="Infill Density"
                                        :min="0" :max="100" :step="5" thumb-label suffix="%" />
                                    <v-select v-model="sliceParams.infill_pattern" :items="infillPatterns"
                                        label="Infill Pattern" outlined dense />
                                    <v-slider v-model="sliceParams.top_layers" label="Top Layers"
                                        :min="1" :max="10" :step="1" thumb-label />
                                    <v-slider v-model="sliceParams.bottom_layers" label="Bottom Layers"
                                        :min="1" :max="10" :step="1" thumb-label />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Speed Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiSpeedometer }}</v-icon>
                                    Speed
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider v-model="sliceParams.print_speed" label="Print Speed"
                                        :min="20" :max="200" :step="5" thumb-label suffix="mm/s" />
                                    <v-slider v-model="sliceParams.travel_speed" label="Travel Speed"
                                        :min="50" :max="300" :step="10" thumb-label suffix="mm/s" />
                                    <v-slider v-model="sliceParams.first_layer_speed" label="First Layer Speed"
                                        :min="10" :max="50" :step="5" thumb-label suffix="mm/s" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Temperature -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiThermometer }}</v-icon>
                                    Temperature
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-slider v-model="sliceParams.nozzle_temp" label="Nozzle Temp"
                                        :min="170" :max="300" :step="5" thumb-label suffix="°C" />
                                    <v-slider v-model="sliceParams.bed_temp" label="Bed Temp"
                                        :min="0" :max="120" :step="5" thumb-label suffix="°C" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Support Settings -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiPillar }}</v-icon>
                                    Support
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-switch v-model="sliceParams.enable_support" label="Enable Support" dense />
                                    <template v-if="sliceParams.enable_support">
                                        <v-slider v-model="sliceParams.support_density" label="Support Density"
                                            :min="5" :max="50" :step="5" thumb-label suffix="%" />
                                        <v-select v-model="sliceParams.support_pattern" :items="supportPatterns"
                                            label="Support Pattern" outlined dense />
                                    </template>
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                            
                            <!-- Advanced / Research -->
                            <v-expansion-panel>
                                <v-expansion-panel-header>
                                    <v-icon left small>{{ icons.mdiFlask }}</v-icon>
                                    Advanced (Research)
                                    <v-chip x-small color="warning" class="ml-2">BETA</v-chip>
                                </v-expansion-panel-header>
                                <v-expansion-panel-content>
                                    <v-switch v-model="sliceParams.enable_non_planar"
                                        label="Non-Planar Slicing" dense
                                        hint="Curve toolpaths to follow surface" persistent-hint />
                                    <v-slider v-if="sliceParams.enable_non_planar"
                                        v-model="sliceParams.max_slope_angle" label="Max Slope Angle"
                                        :min="15" :max="75" :step="5" thumb-label suffix="°" class="mt-4" />
                                    <v-divider class="my-3" />
                                    <v-switch v-model="sliceParams.enable_idex"
                                        label="IDEX Mode" dense
                                        hint="Dual extruder printing" persistent-hint />
                                    <v-select v-if="sliceParams.enable_idex"
                                        v-model="sliceParams.idex_mode" :items="idexModes"
                                        label="IDEX Mode" outlined dense class="mt-4" />
                                </v-expansion-panel-content>
                            </v-expansion-panel>
                        </v-expansion-panels>
                    </v-card-text>
                    
                    <!-- Slice Button -->
                    <v-card-actions class="slice-actions pa-4">
                        <v-btn block x-large color="primary"
                            :disabled="!hasWidgets || isSlicing"
                            :loading="isSlicing"
                            @click="startSlicing">
                            <v-icon left>{{ icons.mdiPrinter3dNozzle }}</v-icon>
                            Slice Model
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>
        
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
                    <v-btn color="success" @click="downloadGcode">
                        <v-icon left>{{ icons.mdiDownload }}</v-icon>
                        Download G-code
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

const DEG90 = Math.PI / 2
const DEG5 = Math.PI / 36

@Component({
    components: {},
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
    }
    
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
    selectedPrinter = 'generic'
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
    
    printerProfiles = [
        { id: 'generic', name: 'Generic Printer (220×220×250)' },
        { id: 'prusa-mk4', name: 'Prusa MK4 (250×210×220)' },
        { id: 'voron-2.4', name: 'Voron 2.4 (350×350×350)' },
        { id: 'bambu-x1', name: 'Bambu X1 Carbon (256×256×256)' },
    ]
    
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
    
    // --- Lifecycle ---
    
    mounted() {
        this.initThreeJS()
        window.addEventListener('resize', this.onWindowResize)
        window.addEventListener('keydown', this.handleKeyDown)
    }
    
    beforeDestroy() {
        window.removeEventListener('resize', this.onWindowResize)
        window.removeEventListener('keydown', this.handleKeyDown)
        this.disposeThreeJS()
    }
    
    // --- Watchers ---
    
    @Watch('selectedPrinter')
    onPrinterChange() {
        this.updateBuildVolume()
        if (this.platform) {
            const profile = this.getPrinterProfile()
            this.platform.config = {
                bedWidth: profile.bed_size_x,
                bedDepth: profile.bed_size_y,
                bedHeight: profile.bed_size_z,
                gap: 5,
            }
        }
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
    
    // --- Three.js setup ---
    
    initThreeJS() {
        const container = this.$refs.viewerContainer as HTMLElement
        if (!container) return
        
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
                    this.$forceUpdate()
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
                    this.$forceUpdate()
                }
            } else {
                this.platform.deselect()
                this.$forceUpdate()
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
                this.$forceUpdate()
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
                this.$forceUpdate()
                break
            case 'ArrowRight':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(5, 0, 0)
                else this.platform?.rotateSelected(0, 0, shift ? -DEG5 : -DEG90)
                this.$forceUpdate()
                break
            case 'ArrowUp':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(0, 5, 0)
                else this.platform?.rotateSelected(shift ? DEG5 : DEG90, 0, 0)
                this.$forceUpdate()
                break
            case 'ArrowDown':
                event.preventDefault()
                if (alt) this.platform?.moveSelected(0, -5, 0)
                else this.platform?.rotateSelected(shift ? -DEG5 : -DEG90, 0, 0)
                this.$forceUpdate()
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
            this.$forceUpdate()
            
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
        this.$forceUpdate()
    }
    
    selectAll() {
        this.platform?.selectAll()
        this.$forceUpdate()
    }
    
    deleteSelected() {
        this.platform?.removeSelected()
        this.$forceUpdate()
    }
    
    deleteWidget(widget: PrepareWidget) {
        this.platform?.remove(widget)
        this.$forceUpdate()
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
        this.$forceUpdate()
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
        this.$forceUpdate()
    }
    
    onWidgetListHover(widget: PrepareWidget | null) {
        this.platform?.setHover(widget)
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
    
    async startSlicing() {
        if (!this.hasWidgets) return
        
        this.isSlicing = true
        this.showSlicingDialog = true
        this.slicingProgress = 0
        this.slicingMessage = 'Starting slicing process...'
        
        try {
            await this.simulateLocalSlicing()
        } catch (error) {
            console.error('Slicing failed:', error)
            this.$toast?.error?.('Slicing failed')
        } finally {
            this.isSlicing = false
            this.showSlicingDialog = false
        }
    }
    
    async simulateLocalSlicing() {
        for (let progress = 0; progress <= 100; progress += 5) {
            this.slicingProgress = progress
            if (progress < 20) this.slicingMessage = 'Analyzing mesh...'
            else if (progress < 60) this.slicingMessage = `Generating layer slices (${Math.round(progress * 2)}%)...`
            else if (progress < 90) this.slicingMessage = 'Generating toolpaths...'
            else this.slicingMessage = 'Creating G-code...'
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Estimate from total bounds
        const bounds = this.platform?.getAllBounds()
        if (!bounds) return
        const size = bounds.getSize(new THREE.Vector3())
        const volume = size.x * size.y * size.z / 1000
        
        this.sliceResult = {
            layer_count: Math.round(size.y / this.sliceParams.layer_height),
            filament_used_m: Math.round(volume * 0.05 * 100) / 100,
            filament_weight_g: Math.round(volume * 0.06 * 10) / 10,
            estimated_time_formatted: this.formatTime(volume * 2),
        }
        
        this.showSlicingDialog = false
        this.showResultDialog = true
    }
    
    // --- Helpers ---
    
    getPrinterProfile() {
        const profiles: Record<string, any> = {
            'generic': { name: 'Generic', bed_size_x: 220, bed_size_y: 220, bed_size_z: 250, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'prusa-mk4': { name: 'Prusa MK4', bed_size_x: 250, bed_size_y: 210, bed_size_z: 220, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'voron-2.4': { name: 'Voron 2.4', bed_size_x: 350, bed_size_y: 350, bed_size_z: 350, nozzle_diameter: 0.4, filament_diameter: 1.75 },
            'bambu-x1': { name: 'Bambu X1', bed_size_x: 256, bed_size_y: 256, bed_size_z: 256, nozzle_diameter: 0.4, filament_diameter: 1.75 },
        }
        return profiles[this.selectedPrinter] || profiles['generic']
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
        this.$router.push({ path: '/preview', query: { jobId: this.jobId } })
    }
    
    async downloadGcode() {
        const gcode = this.generateDemoGcode()
        const blob = new Blob([gcode], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'model.gcode'
        a.click()
        URL.revokeObjectURL(url)
    }
    
    generateDemoGcode(): string {
        return `; Generated by Mainsail Slicer
; Layer height: ${this.sliceParams.layer_height}mm
;
G28 ; Home
M104 S${this.sliceParams.nozzle_temp}
M140 S${this.sliceParams.bed_temp}
M109 S${this.sliceParams.nozzle_temp}
M190 S${this.sliceParams.bed_temp}
G1 Z5 F3000
; Ready to print
M104 S0
M140 S0
M84
; End
`
    }
}
</script>

<style scoped>
.prepare-page {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
}

.toolbar-menu {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
}

.main-content {
    flex: 1;
    overflow: hidden;
}

.preview-column {
    height: 100%;
}

.settings-column {
    height: 100%;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.widget-list-column {
    height: 100%;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.widget-list-panel {
    background: transparent !important;
}

.widget-selected {
    background: rgba(33, 150, 243, 0.15) !important;
    border-left: 3px solid var(--v-primary-base);
}

.settings-panel {
    background: transparent !important;
}

.viewer-wrapper {
    position: relative;
    height: 100%;
    width: 100%;
}

.viewer-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}

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

.printer-select {
    font-size: 13px;
}

.printer-select :deep(.v-input__slot) {
    min-height: 32px !important;
}

.slice-actions {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.v-expansion-panel-header) {
    min-height: 40px;
    padding: 8px 16px;
}

:deep(.v-expansion-panel-content__wrap) {
    padding: 8px 16px 16px;
}
</style>
