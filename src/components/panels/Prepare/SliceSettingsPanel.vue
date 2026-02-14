<template>
    <div class="slice-settings-content">
        <!-- Settings menu -->
        <div class="d-flex justify-end mb-2">
            <v-menu left offset-y>
                <template #activator="{ on, attrs }">
                    <v-btn icon small v-bind="attrs" v-on="on">
                        <v-icon small>{{ mdiDotsVertical }}</v-icon>
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item @click="$emit('save-profile')">
                        <v-list-item-icon><v-icon small>{{ mdiContentSave }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Save as Profile</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="$emit('load-profile')">
                        <v-list-item-icon><v-icon small>{{ mdiFolderOpen }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Load Profile</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="resetToDefaults">
                        <v-list-item-icon><v-icon small>{{ mdiRestart }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Reset to Defaults</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </div>

        <!-- Quality Presets -->
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

        <v-expansion-panels v-model="openPanels" multiple flat accordion>
            <!-- Layer Settings -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiLayers }}</v-icon>
                        Layer Settings
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-text-field
                        v-model.number="params.layer_height"
                        label="Layer Height"
                        type="number"
                        step="0.01"
                        min="0.05"
                        max="0.4"
                        suffix="mm"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-text-field
                        v-model.number="params.first_layer_height"
                        label="First Layer Height"
                        type="number"
                        step="0.01"
                        min="0.1"
                        max="0.5"
                        suffix="mm"
                        outlined
                        dense
                        hide-details />
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Walls & Infill -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiGridLarge }}</v-icon>
                        Walls &amp; Infill
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-text-field
                        v-model.number="params.wall_count"
                        label="Wall Count"
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-text-field
                        v-model.number="params.infill_density"
                        label="Infill Density"
                        type="number"
                        step="5"
                        min="0"
                        max="100"
                        suffix="%"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-select
                        v-model="params.infill_pattern"
                        :items="infillPatterns"
                        label="Infill Pattern"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field
                                v-model.number="params.top_layers"
                                label="Top Layers"
                                type="number"
                                step="1"
                                min="1"
                                max="10"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                v-model.number="params.bottom_layers"
                                label="Bottom Layers"
                                type="number"
                                step="1"
                                min="1"
                                max="10"
                                outlined
                                dense
                                hide-details />
                        </v-col>
                    </v-row>
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Speed Settings -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiSpeedometer }}</v-icon>
                        Speed
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-text-field
                        v-model.number="params.print_speed"
                        label="Print Speed"
                        type="number"
                        step="5"
                        min="20"
                        max="200"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-text-field
                        v-model.number="params.travel_speed"
                        label="Travel Speed"
                        type="number"
                        step="10"
                        min="50"
                        max="300"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-text-field
                        v-model.number="params.first_layer_speed"
                        label="First Layer Speed"
                        type="number"
                        step="5"
                        min="10"
                        max="50"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details />
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Temperature -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiThermometer }}</v-icon>
                        Temperature
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-text-field
                        v-model.number="params.nozzle_temp"
                        label="Nozzle Temperature"
                        type="number"
                        step="5"
                        min="170"
                        max="300"
                        suffix="°C"
                        outlined
                        dense
                        hide-details
                        class="mb-3" />
                    <v-text-field
                        v-model.number="params.bed_temp"
                        label="Bed Temperature"
                        type="number"
                        step="5"
                        min="0"
                        max="120"
                        suffix="°C"
                        outlined
                        dense
                        hide-details />
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Support Settings -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiPillar }}</v-icon>
                        Support
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-switch
                        v-model="params.enable_support"
                        label="Enable Support"
                        dense
                        hide-details
                        class="mt-0 mb-3" />
                    <template v-if="params.enable_support">
                        <v-text-field
                            v-model.number="params.support_density"
                            label="Support Density"
                            type="number"
                            step="5"
                            min="5"
                            max="50"
                            suffix="%"
                            outlined
                            dense
                            hide-details
                            class="mb-3" />
                        <v-select
                            v-model="params.support_pattern"
                            :items="supportPatterns"
                            label="Support Pattern"
                            outlined
                            dense
                            hide-details />
                    </template>
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Advanced / Research -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiFlask }}</v-icon>
                        Advanced
                        <v-chip x-small color="warning" class="ml-2">BETA</v-chip>
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-switch
                        v-model="params.enable_non_planar"
                        label="Non-Planar Slicing"
                        dense
                        hide-details
                        class="mt-0 mb-2" />
                    <div v-if="params.enable_non_planar" class="text-caption grey--text mb-3">
                        Curve toolpaths to follow surface contours
                    </div>
                    <v-text-field
                        v-if="params.enable_non_planar"
                        v-model.number="params.max_slope_angle"
                        label="Max Slope Angle"
                        type="number"
                        step="5"
                        min="15"
                        max="75"
                        suffix="°"
                        outlined
                        dense
                        hide-details
                        class="mb-4" />

                    <v-divider class="my-3" />

                    <v-switch
                        v-model="params.enable_idex"
                        label="IDEX Mode"
                        dense
                        hide-details
                        class="mt-0 mb-2" />
                    <div v-if="!params.enable_idex" class="text-caption grey--text mb-3">
                        Dual extruder printing modes
                    </div>
                    <v-select
                        v-if="params.enable_idex"
                        v-model="params.idex_mode"
                        :items="idexModes"
                        label="IDEX Mode"
                        outlined
                        dense
                        hide-details />
                </v-expansion-panel-content>
            </v-expansion-panel>
        </v-expansion-panels>

        <!-- Slice Button -->
        <div class="slice-actions mt-4">
            <v-btn
                block
                x-large
                color="primary"
                :disabled="!canSlice"
                :loading="isSlicing"
                @click="$emit('slice')">
                <v-icon left>{{ mdiPrinter3dNozzle }}</v-icon>
                Slice Model
            </v-btn>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    mdiTune,
    mdiDotsVertical,
    mdiContentSave,
    mdiFolderOpen,
    mdiRestart,
    mdiLayers,
    mdiGridLarge,
    mdiSpeedometer,
    mdiThermometer,
    mdiPillar,
    mdiFlask,
    mdiPrinter3dNozzle,
} from '@mdi/js'

export interface SliceParams {
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

const DEFAULT_PARAMS: SliceParams = {
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

const QUALITY_PRESETS: Record<string, Partial<SliceParams>> = {
    draft: { layer_height: 0.3, first_layer_height: 0.35, wall_count: 2, infill_density: 10, print_speed: 80 },
    normal: { layer_height: 0.2, first_layer_height: 0.3, wall_count: 3, infill_density: 20, print_speed: 60 },
    fine: { layer_height: 0.12, first_layer_height: 0.2, wall_count: 4, infill_density: 25, print_speed: 45 },
    ultra: { layer_height: 0.08, first_layer_height: 0.15, wall_count: 5, infill_density: 30, print_speed: 30 },
}

@Component
export default class SliceSettingsPanel extends Mixins(BaseMixin) {
    mdiTune = mdiTune
    mdiDotsVertical = mdiDotsVertical
    mdiContentSave = mdiContentSave
    mdiFolderOpen = mdiFolderOpen
    mdiRestart = mdiRestart
    mdiLayers = mdiLayers
    mdiGridLarge = mdiGridLarge
    mdiSpeedometer = mdiSpeedometer
    mdiThermometer = mdiThermometer
    mdiPillar = mdiPillar
    mdiFlask = mdiFlask
    mdiPrinter3dNozzle = mdiPrinter3dNozzle

    @Prop({ type: Boolean, default: false }) declare readonly canSlice: boolean
    @Prop({ type: Boolean, default: false }) declare readonly isSlicing: boolean
    @Prop({ type: Object, default: () => ({ ...DEFAULT_PARAMS }) }) declare readonly value: SliceParams

    qualityPreset = 'normal'
    openPanels: number[] = [0, 1]

    params: SliceParams = { ...DEFAULT_PARAMS }

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

    private isUpdatingFromProp = false

    @Watch('value', { immediate: true, deep: true })
    onValueChange(): void {
        this.isUpdatingFromProp = true
        this.params = { ...this.value }
        this.$nextTick(() => {
            this.isUpdatingFromProp = false
        })
    }

    @Watch('params', { deep: true })
    onParamsChange(): void {
        if (!this.isUpdatingFromProp) {
            this.$emit('input', { ...this.params })
        }
    }

    @Watch('qualityPreset')
    onPresetChange(): void {
        const preset = QUALITY_PRESETS[this.qualityPreset]
        if (preset) {
            Object.assign(this.params, preset)
        }
    }

    resetToDefaults(): void {
        this.params = { ...DEFAULT_PARAMS }
        this.qualityPreset = 'normal'
    }
}
</script>

<style scoped>
.slice-settings-content {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.v-expansion-panel-header {
    min-height: 40px !important;
    padding: 8px 16px;
}

.v-expansion-panel-content ::v-deep .v-expansion-panel-content__wrap {
    padding: 0 16px 16px;
}

.slice-actions {
    margin-top: auto;
    padding-top: 16px;
}
</style>
