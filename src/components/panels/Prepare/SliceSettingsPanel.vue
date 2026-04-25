<template>
    <div class="slice-settings-content">
        <!-- Settings menu -->
        <div class="d-flex justify-space-between align-center mb-2">
            <v-btn small color="primary" text @click="$emit('save-settings')">
                <v-icon left small>{{ mdiContentSave }}</v-icon>
                Save
            </v-btn>
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
            <v-btn-toggle :value="storeQualityPreset" mandatory color="primary" class="d-flex" @change="setPreset">
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
                        :value="params.layer_height"
                        label="Layer Height"
                        type="number"
                        step="0.01"
                        min="0.05"
                        max="0.4"
                        suffix="mm"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('layer_height', Number($event))" />
                    <v-text-field
                        :value="params.first_layer_height"
                        label="First Layer Height"
                        type="number"
                        step="0.01"
                        min="0.1"
                        max="0.5"
                        suffix="mm"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('first_layer_height', Number($event))" />
                    <v-text-field
                        :value="params.line_width"
                        label="Line Width"
                        type="number"
                        step="0.01"
                        min="0"
                        max="2.0"
                        suffix="mm"
                        hint="0 = auto (nozzle × 1.1)"
                        persistent-hint
                        outlined
                        dense
                        @input="setParam('line_width', Number($event))" />
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
                        :value="params.wall_count"
                        label="Wall Count"
                        type="number"
                        step="1"
                        min="1"
                        max="10"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('wall_count', Number($event))" />
                    <v-text-field
                        :value="params.infill_density"
                        label="Infill Density"
                        type="number"
                        step="5"
                        min="0"
                        max="100"
                        suffix="%"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('infill_density', Number($event))" />
                    <v-select
                        :value="params.infill_pattern"
                        :items="infillPatterns"
                        label="Infill Pattern"
                        outlined
                        dense
                        hide-details
                        :menu-props="{ zIndex: 200 }"
                        class="mb-3"
                        @input="setParam('infill_pattern', $event)" />
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field
                                :value="params.top_layers"
                                label="Top Layers"
                                type="number"
                                step="1"
                                min="1"
                                max="10"
                                outlined
                                dense
                                hide-details
                                @input="setParam('top_layers', Number($event))" />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :value="params.bottom_layers"
                                label="Bottom Layers"
                                type="number"
                                step="1"
                                min="1"
                                max="10"
                                outlined
                                dense
                                hide-details
                                @input="setParam('bottom_layers', Number($event))" />
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
                        :value="params.print_speed"
                        label="Print Speed"
                        type="number"
                        step="5"
                        min="20"
                        max="200"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('print_speed', Number($event))" />
                    <v-text-field
                        :value="params.travel_speed"
                        label="Travel Speed"
                        type="number"
                        step="10"
                        min="50"
                        max="300"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setParam('travel_speed', Number($event))" />
                    <v-text-field
                        :value="params.first_layer_speed"
                        label="First Layer Speed"
                        type="number"
                        step="5"
                        min="10"
                        max="50"
                        suffix="mm/s"
                        outlined
                        dense
                        hide-details
                        @input="setParam('first_layer_speed', Number($event))" />
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
                    <div class="text-caption grey--text mb-1">Nozzle</div>
                    <v-btn-toggle
                        v-if="extruderCount > 1"
                        :value="activeNozzleIndex"
                        mandatory
                        dense
                        class="d-flex mb-3"
                        @change="setActiveNozzleIndex">
                        <v-btn
                            v-for="idx in extruderIndices"
                            :key="`nozzle-${idx}`"
                            :value="idx"
                            small
                            class="flex-grow-1">
                            E{{ idx + 1 }}
                        </v-btn>
                    </v-btn-toggle>
                    <v-text-field
                        :value="activeNozzleTemp"
                        :label="`Nozzle Temperature (E${activeNozzleIndex + 1})`"
                        type="number"
                        step="5"
                        min="170"
                        max="300"
                        suffix="°C"
                        outlined
                        dense
                        hide-details
                        class="mb-3"
                        @input="setActiveNozzleTemp(Number($event))" />

                    <template v-if="bedControllerCount > 0">
                        <div class="text-caption grey--text mb-1">Bed</div>
                        <v-btn-toggle
                            v-if="bedControllerCount > 1"
                            :value="activeBedControllerIndex"
                            mandatory
                            dense
                            class="d-flex mb-3"
                            @change="setActiveBedControllerIndex">
                            <v-btn
                                v-for="idx in bedControllerIndices"
                                :key="`bed-${idx}`"
                                :value="idx"
                                small
                                class="flex-grow-1">
                                {{ bedControllerLabel(idx) }}
                            </v-btn>
                        </v-btn-toggle>
                        <v-text-field
                            :value="activeBedControllerTemp"
                            :label="bedTempLabel"
                            type="number"
                            step="5"
                            min="0"
                            max="120"
                            suffix="°C"
                            outlined
                            dense
                            hide-details
                            @input="setActiveBedControllerTemp(Number($event))" />
                    </template>
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
                        :input-value="params.enable_support"
                        label="Enable Support"
                        dense
                        hide-details
                        class="mt-0 mb-3"
                        @change="setParam('enable_support', $event)" />
                    <template v-if="params.enable_support">
                        <v-text-field
                            :value="params.support_angle"
                            label="Overhang Threshold"
                            type="number"
                            step="5"
                            min="0"
                            max="90"
                            suffix="°"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('support_angle', Number($event))" />
                        <v-text-field
                            :value="params.support_density"
                            label="Support Density"
                            type="number"
                            step="5"
                            min="5"
                            max="50"
                            suffix="%"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('support_density', Number($event))" />
                        <v-select
                            :value="params.support_pattern"
                            :items="supportPatterns"
                            label="Support Pattern"
                            outlined
                            dense
                            hide-details
                            :menu-props="{ zIndex: 200 }"
                            @input="setParam('support_pattern', $event)" />
                    </template>
                </v-expansion-panel-content>
            </v-expansion-panel>

            <!-- Bed Adhesion -->
            <v-expansion-panel>
                <v-expansion-panel-header class="py-2">
                    <span class="d-flex align-center">
                        <v-icon left small>{{ mdiFootPrint }}</v-icon>
                        Bed Adhesion
                    </span>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <v-select
                        :value="params.adhesion_type"
                        :items="adhesionTypes"
                        label="Adhesion Type"
                        outlined
                        dense
                        hide-details
                        :menu-props="{ zIndex: 200 }"
                        class="mb-3"
                        @input="setParam('adhesion_type', $event)" />

                    <!-- Brim settings -->
                    <template v-if="params.adhesion_type === 'brim' || params.adhesion_type === 'combined'">
                        <v-text-field
                            :value="params.brim_width"
                            label="Brim Width"
                            type="number"
                            step="1"
                            min="1"
                            max="20"
                            suffix="mm"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('brim_width', Number($event))" />
                        <v-text-field
                            :value="params.brim_lines"
                            label="Brim Lines"
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('brim_lines', Number($event))" />
                    </template>

                    <!-- Mouse ear settings -->
                    <template v-if="params.adhesion_type === 'mouse_ears' || params.adhesion_type === 'combined'">
                        <v-text-field
                            :value="params.mouse_ear_diameter"
                            label="Mouse Ear Diameter"
                            type="number"
                            step="1"
                            min="3"
                            max="25"
                            suffix="mm"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('mouse_ear_diameter', Number($event))" />
                        <div class="text-caption grey--text mb-2">
                            Alt+click the model to place ears, or use Auto-Suggest
                        </div>
                        <v-btn
                            small
                            outlined
                            color="primary"
                            class="mb-3"
                            @click="$emit('auto-suggest-adhesion')">
                            Auto-Suggest Locations
                        </v-btn>
                        <div v-if="adhesionMarkerCount > 0" class="text-caption mb-2">
                            {{ adhesionMarkerCount }} marker{{ adhesionMarkerCount > 1 ? 's' : '' }} placed
                        </div>
                        <v-btn
                            v-if="adhesionMarkerCount > 0"
                            x-small
                            text
                            color="error"
                            class="mb-2"
                            @click="$emit('clear-adhesion-markers')">
                            Clear All Markers
                        </v-btn>
                    </template>

                    <!-- Raft pad settings -->
                    <template v-if="params.adhesion_type === 'raft_pads' || params.adhesion_type === 'combined'">
                        <v-text-field
                            :value="params.raft_pad_layers"
                            label="Raft Pad Layers"
                            type="number"
                            step="1"
                            min="1"
                            max="6"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('raft_pad_layers', Number($event))" />
                        <v-text-field
                            :value="params.raft_pad_gap"
                            label="Raft Gap"
                            type="number"
                            step="0.05"
                            min="0"
                            max="0.5"
                            suffix="mm"
                            outlined
                            dense
                            hide-details
                            class="mb-3"
                            @input="setParam('raft_pad_gap', Number($event))" />
                        <div class="text-caption grey--text mb-2">
                            Alt+click the model to place raft pads, or use Auto-Suggest
                        </div>
                        <v-btn
                            small
                            outlined
                            color="primary"
                            class="mb-3"
                            @click="$emit('auto-suggest-adhesion')">
                            Auto-Suggest Locations
                        </v-btn>
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
                        :input-value="params.enable_non_planar"
                        label="Non-Planar Slicing"
                        dense
                        hide-details
                        class="mt-0 mb-2"
                        @change="setParam('enable_non_planar', $event)" />
                    <div v-if="params.enable_non_planar" class="text-caption grey--text mb-3">
                        Curve toolpaths to follow surface contours
                    </div>
                    <v-text-field
                        v-if="params.enable_non_planar"
                        :value="params.max_slope_angle"
                        label="Max Slope Angle"
                        type="number"
                        step="5"
                        min="15"
                        max="75"
                        suffix="°"
                        outlined
                        dense
                        hide-details
                        class="mb-4"
                        @input="setParam('max_slope_angle', Number($event))" />

                    <v-divider class="my-3" />

                    <v-switch
                        :input-value="params.enable_idex"
                        label="IDEX Mode"
                        dense
                        hide-details
                        class="mt-0 mb-2"
                        @change="setParam('enable_idex', $event)" />
                    <div v-if="!params.enable_idex" class="text-caption grey--text mb-3">
                        Dual extruder printing modes
                    </div>
                    <v-select
                        v-if="params.enable_idex"
                        :value="params.idex_mode"
                        :items="idexModes"
                        label="IDEX Mode"
                        outlined
                        dense
                        hide-details
                        :menu-props="{ zIndex: 200 }"
                        @input="setParam('idex_mode', $event)" />
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
import type { SliceParams, PrinterProfile } from '@/store/prepare/types'
import {
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
    mdiFootPrint,
} from '@mdi/js'

@Component
export default class SliceSettingsPanel extends Mixins(BaseMixin) {
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
    mdiFootPrint = mdiFootPrint

    @Prop({ type: Boolean, default: false }) declare readonly canSlice: boolean
    @Prop({ type: Boolean, default: false }) declare readonly isSlicing: boolean

    openPanels: number[] = [0, 1]

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

    adhesionTypes = [
        { text: 'None', value: 'none' },
        { text: 'Brim', value: 'brim' },
        { text: 'Mouse Ears', value: 'mouse_ears' },
        { text: 'Raft Pads', value: 'raft_pads' },
        { text: 'Combined', value: 'combined' },
    ]

    get params(): SliceParams {
        return this.$store.state.prepare.sliceParams
    }

    get activePrinterProfile(): PrinterProfile | null {
        const prepareState = this.$store.state.prepare
        const profiles: PrinterProfile[] = prepareState?.printerProfiles ?? []
        const activeId: string | null = prepareState?.activePrinterId ?? null
        return profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null
    }

    get extruderCount(): number {
        const raw = Number(this.activePrinterProfile?.extruderCount ?? 1)
        if (!Number.isFinite(raw)) return 1
        return Math.max(1, Math.floor(raw))
    }

    get extruderIndices(): number[] {
        return Array.from({ length: this.extruderCount }, (_v, i) => i)
    }

    get bedControllerCount(): number {
        const profile = this.activePrinterProfile
        if (profile?.heatedBed === false) return 0

        const raw = Number(profile?.bedHeaterControllerCount ?? 1)
        if (!Number.isFinite(raw)) return 1
        return Math.max(1, Math.floor(raw))
    }

    get bedControllerIndices(): number[] {
        return Array.from({ length: this.bedControllerCount }, (_v, i) => i)
    }

    get activeNozzleIndex(): number {
        const raw = Number(this.params.active_nozzle_index ?? 0)
        const index = Number.isFinite(raw) ? Math.floor(raw) : 0
        return Math.min(Math.max(index, 0), this.extruderCount - 1)
    }

    get activeBedControllerIndex(): number {
        if (this.bedControllerCount <= 0) return 0
        const raw = Number(this.params.active_bed_controller_index ?? 0)
        const index = Number.isFinite(raw) ? Math.floor(raw) : 0
        return Math.min(Math.max(index, 0), this.bedControllerCount - 1)
    }

    get activeNozzleTemp(): number {
        return this.buildNozzleTemps()[this.activeNozzleIndex] ?? this.params.nozzle_temp
    }

    get activeBedControllerTemp(): number {
        if (this.bedControllerCount <= 0) return 0
        return this.buildBedControllerTemps()[this.activeBedControllerIndex] ?? this.params.bed_temp
    }

    get bedTempLabel(): string {
        if (this.bedControllerCount <= 1) return 'Bed Temperature'
        return `Bed Temperature (${this.bedControllerLabel(this.activeBedControllerIndex)})`
    }

    get storeQualityPreset(): string {
        return this.$store.state.prepare.qualityPreset
    }

    get adhesionMarkerCount(): number {
        return this.$store.state.prepare.adhesionMarkers?.length ?? 0
    }

    created() {
        this.ensureTemperatureStateConsistency()
    }

    @Watch('$store.state.prepare.activePrinterId')
    onActivePrinterChanged() {
        this.ensureTemperatureStateConsistency()
    }

    @Watch('$store.state.prepare.printerProfiles', { deep: true })
    onPrinterProfilesChanged() {
        this.ensureTemperatureStateConsistency()
    }

    setParam(key: keyof SliceParams, value: any): void {
        this.$store.commit('prepare/setSliceParams', { [key]: value })
    }

    setActiveNozzleIndex(index: number): void {
        const next = Number(index)
        if (!Number.isFinite(next)) return

        const clamped = Math.min(Math.max(Math.floor(next), 0), this.extruderCount - 1)
        const nozzleTemps = this.buildNozzleTemps()
        this.$store.commit('prepare/setSliceParams', {
            active_nozzle_index: clamped,
            nozzle_temp: nozzleTemps[clamped],
        })
    }

    setActiveNozzleTemp(value: number): void {
        if (!Number.isFinite(value)) return

        const temp = Math.max(0, Math.round(value))
        const nozzleTemps = this.buildNozzleTemps()
        nozzleTemps[this.activeNozzleIndex] = temp
        this.$store.commit('prepare/setSliceParams', {
            nozzle_temps: nozzleTemps,
            nozzle_temp: temp,
        })
    }

    setActiveBedControllerIndex(index: number): void {
        if (this.bedControllerCount <= 0) return

        const next = Number(index)
        if (!Number.isFinite(next)) return

        const clamped = Math.min(Math.max(Math.floor(next), 0), this.bedControllerCount - 1)
        const controllerTemps = this.buildBedControllerTemps()
        this.$store.commit('prepare/setSliceParams', {
            active_bed_controller_index: clamped,
            bed_temp: controllerTemps[clamped],
            bed_heater_temps: this.buildBedHeaterTempsRecord(controllerTemps),
        })
    }

    setActiveBedControllerTemp(value: number): void {
        if (this.bedControllerCount <= 0 || !Number.isFinite(value)) return

        const temp = Math.max(0, Math.round(value))
        const controllerTemps = this.buildBedControllerTemps()
        controllerTemps[this.activeBedControllerIndex] = temp

        this.$store.commit('prepare/setSliceParams', {
            bed_controller_temps: controllerTemps,
            bed_temp: temp,
            bed_heater_temps: this.buildBedHeaterTempsRecord(controllerTemps),
        })
    }

    bedControllerLabel(index: number): string {
        const zoneName = this.activePrinterProfile?.bedHeaterZones?.[index]?.name
        const normalized = typeof zoneName === 'string' ? zoneName.trim() : ''
        return normalized || `H${index + 1}`
    }

    private buildNozzleTemps(): number[] {
        const source = Array.isArray(this.params.nozzle_temps) ? this.params.nozzle_temps : []
        const fallback = Number.isFinite(this.params.nozzle_temp) ? this.params.nozzle_temp : 210

        const temps: number[] = []
        for (let i = 0; i < this.extruderCount; i++) {
            const raw = Number(source[i])
            temps.push(Number.isFinite(raw) && raw > 0 ? raw : fallback)
        }
        return temps
    }

    private buildBedControllerTemps(): number[] {
        if (this.bedControllerCount <= 0) return []

        const source = Array.isArray(this.params.bed_controller_temps) ? this.params.bed_controller_temps : []
        const fallback = Number.isFinite(this.params.bed_temp) ? this.params.bed_temp : 60

        const temps: number[] = []
        for (let i = 0; i < this.bedControllerCount; i++) {
            const raw = Number(source[i])
            temps.push(Number.isFinite(raw) && raw >= 0 ? raw : fallback)
        }
        return temps
    }

    private buildBedHeaterTempsRecord(controllerTemps: number[]): Record<string, number> {
        if (this.bedControllerCount <= 1) return {}

        const record: Record<string, number> = {}
        for (let i = 0; i < this.bedControllerCount; i++) {
            const zoneName = this.activePrinterProfile?.bedHeaterZones?.[i]?.name
            const normalized = typeof zoneName === 'string' ? zoneName.trim() : ''
            const key = normalized || `heater_bed_${i + 1}`
            record[key] = controllerTemps[i] ?? this.params.bed_temp
        }

        return record
    }

    private ensureTemperatureStateConsistency(): void {
        const nextNozzleTemps = this.buildNozzleTemps()
        const nextNozzleIndex = Math.min(Math.max(this.activeNozzleIndex, 0), this.extruderCount - 1)
        const nextNozzleTemp = nextNozzleTemps[nextNozzleIndex]

        const nextBedTemps = this.buildBedControllerTemps()
        const nextBedIndex = this.bedControllerCount > 0
            ? Math.min(Math.max(this.activeBedControllerIndex, 0), this.bedControllerCount - 1)
            : 0
        const nextBedTemp = this.bedControllerCount > 0 ? nextBedTemps[nextBedIndex] : this.params.bed_temp
        const nextBedHeaterTemps = this.buildBedHeaterTempsRecord(nextBedTemps)

        const patch: Partial<SliceParams> = {}

        if (!this.sameNumberArray(this.params.nozzle_temps, nextNozzleTemps)) {
            patch.nozzle_temps = nextNozzleTemps
        }
        if (this.params.active_nozzle_index !== nextNozzleIndex) {
            patch.active_nozzle_index = nextNozzleIndex
        }
        if (this.params.nozzle_temp !== nextNozzleTemp) {
            patch.nozzle_temp = nextNozzleTemp
        }

        if (!this.sameNumberArray(this.params.bed_controller_temps, nextBedTemps)) {
            patch.bed_controller_temps = nextBedTemps
        }
        if (this.params.active_bed_controller_index !== nextBedIndex) {
            patch.active_bed_controller_index = nextBedIndex
        }
        if (this.params.bed_temp !== nextBedTemp) {
            patch.bed_temp = nextBedTemp
        }
        if (!this.sameTempRecord(this.params.bed_heater_temps, nextBedHeaterTemps)) {
            patch.bed_heater_temps = nextBedHeaterTemps
        }

        if (Object.keys(patch).length > 0) {
            this.$store.commit('prepare/setSliceParams', patch)
        }
    }

    private sameNumberArray(value: unknown, expected: number[]): boolean {
        if (!Array.isArray(value)) return expected.length === 0
        if (value.length !== expected.length) return false
        return value.every((item, index) => Number(item) === expected[index])
    }

    private sameTempRecord(
        value: Record<string, number> | null | undefined,
        expected: Record<string, number>
    ): boolean {
        const source = value ?? {}
        const sourceKeys = Object.keys(source).sort()
        const expectedKeys = Object.keys(expected).sort()
        if (sourceKeys.length !== expectedKeys.length) return false

        for (let i = 0; i < sourceKeys.length; i++) {
            const key = sourceKeys[i]
            if (key !== expectedKeys[i]) return false
            if (Number(source[key]) !== Number(expected[key])) return false
        }

        return true
    }

    setPreset(preset: string): void {
        this.$store.commit('prepare/setQualityPreset', preset)
    }

    resetToDefaults(): void {
        this.$store.commit('prepare/setQualityPreset', 'normal')
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
