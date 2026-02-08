<template>
    <div class="slice-preview-panel">
        <panel
            :icon="mdiLayersTriple"
            title="Slice Preview"
            :collapsible="true"
            card-class="slice-preview-panel">
            <template #buttons>
                <v-btn-toggle v-model="viewMode" mandatory dense class="mr-2">
                    <v-btn small value="layers">
                        <v-icon small>{{ mdiLayers }}</v-icon>
                    </v-btn>
                    <v-btn small value="3d">
                        <v-icon small>{{ mdiCube }}</v-icon>
                    </v-btn>
                </v-btn-toggle>
                <v-btn icon tile @click="resetView">
                    <v-icon>{{ mdiCameraRetake }}</v-icon>
                </v-btn>
            </template>

            <!-- No result state -->
            <div v-if="!result" class="no-result text-center pa-8">
                <v-icon size="48" color="grey">{{ mdiPrinter3dNozzle }}</v-icon>
                <div class="text-body-2 grey--text mt-3">No slice result</div>
                <div class="text-caption grey--text">Slice a model to see the preview</div>
            </div>

            <!-- Slice result display -->
            <template v-else>
                <!-- Stats summary -->
                <div class="stats-bar pa-3">
                    <v-row dense>
                        <v-col cols="3" class="text-center">
                            <div class="text-h6">{{ result.layer_count }}</div>
                            <div class="text-caption grey--text">Layers</div>
                        </v-col>
                        <v-col cols="3" class="text-center">
                            <div class="text-h6">{{ result.estimated_time_formatted }}</div>
                            <div class="text-caption grey--text">Time</div>
                        </v-col>
                        <v-col cols="3" class="text-center">
                            <div class="text-h6">{{ result.filament_used_m }}m</div>
                            <div class="text-caption grey--text">Filament</div>
                        </v-col>
                        <v-col cols="3" class="text-center">
                            <div class="text-h6">{{ result.filament_weight_g }}g</div>
                            <div class="text-caption grey--text">Weight</div>
                        </v-col>
                    </v-row>
                </div>

                <v-divider />

                <!-- Layer navigator -->
                <div v-if="viewMode === 'layers'" class="layer-navigator pa-3">
                    <v-slider
                        v-model="currentLayer"
                        :min="1"
                        :max="result.layer_count"
                        :label="`Layer ${currentLayer}`"
                        thumb-label="always"
                        hide-details
                        class="mb-2">
                        <template #thumb-label>{{ currentLayer }}</template>
                    </v-slider>

                    <div class="layer-controls d-flex align-center justify-center">
                        <v-btn icon small @click="currentLayer = 1">
                            <v-icon small>{{ mdiSkipPrevious }}</v-icon>
                        </v-btn>
                        <v-btn icon small @click="prevLayer">
                            <v-icon small>{{ mdiChevronLeft }}</v-icon>
                        </v-btn>
                        <v-btn icon small :color="isPlaying ? 'primary' : ''" @click="togglePlay">
                            <v-icon small>{{ isPlaying ? mdiPause : mdiPlay }}</v-icon>
                        </v-btn>
                        <v-btn icon small @click="nextLayer">
                            <v-icon small>{{ mdiChevronRight }}</v-icon>
                        </v-btn>
                        <v-btn icon small @click="currentLayer = result.layer_count">
                            <v-icon small>{{ mdiSkipNext }}</v-icon>
                        </v-btn>

                        <v-btn-toggle v-model="playSpeed" mandatory dense class="ml-4">
                            <v-btn x-small value="1">1x</v-btn>
                            <v-btn x-small value="2">2x</v-btn>
                            <v-btn x-small value="5">5x</v-btn>
                        </v-btn-toggle>
                    </div>

                    <!-- Layer visualization placeholder -->
                    <div ref="layerCanvas" class="layer-canvas mt-3">
                        <div class="placeholder-text grey--text text-center">
                            Layer {{ currentLayer }} / {{ result.layer_count }}
                        </div>
                    </div>
                </div>

                <!-- 3D View (uses existing gcodeviewer) -->
                <div v-if="viewMode === '3d'" class="viewer-3d pa-3">
                    <div v-if="gcodeUrl" ref="viewerContainer" class="gcode-viewer-container">
                        <!-- GCode viewer will be mounted here -->
                    </div>
                    <div v-else class="text-center grey--text pa-8">
                        <v-icon color="grey">{{ mdiAlertCircleOutline }}</v-icon>
                        <div class="text-caption mt-2">G-code not available for preview</div>
                    </div>
                </div>

                <!-- Actions -->
                <v-divider />
                <v-card-actions class="pa-3">
                    <v-btn outlined @click="$emit('preview-fullscreen')">
                        <v-icon left small>{{ mdiFullscreen }}</v-icon>
                        Full Preview
                    </v-btn>
                    <v-spacer />
                    <v-btn color="primary" @click="$emit('download')">
                        <v-icon left small>{{ mdiDownload }}</v-icon>
                        Download
                    </v-btn>
                    <v-btn color="success" @click="$emit('send-to-printer')">
                        <v-icon left small>{{ mdiPrinter3d }}</v-icon>
                        Print
                    </v-btn>
                </v-card-actions>
            </template>
        </panel>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import {
    mdiLayersTriple,
    mdiLayers,
    mdiCube,
    mdiCameraRetake,
    mdiPrinter3dNozzle,
    mdiSkipPrevious,
    mdiSkipNext,
    mdiChevronLeft,
    mdiChevronRight,
    mdiPlay,
    mdiPause,
    mdiFullscreen,
    mdiDownload,
    mdiPrinter3d,
    mdiAlertCircleOutline,
} from '@mdi/js'
import { SliceResult } from '@/store/prepare/types'

@Component({
    components: { Panel },
})
export default class SlicePreviewPanel extends Mixins(BaseMixin) {
    mdiLayersTriple = mdiLayersTriple
    mdiLayers = mdiLayers
    mdiCube = mdiCube
    mdiCameraRetake = mdiCameraRetake
    mdiPrinter3dNozzle = mdiPrinter3dNozzle
    mdiSkipPrevious = mdiSkipPrevious
    mdiSkipNext = mdiSkipNext
    mdiChevronLeft = mdiChevronLeft
    mdiChevronRight = mdiChevronRight
    mdiPlay = mdiPlay
    mdiPause = mdiPause
    mdiFullscreen = mdiFullscreen
    mdiDownload = mdiDownload
    mdiPrinter3d = mdiPrinter3d
    mdiAlertCircleOutline = mdiAlertCircleOutline

    @Prop({ type: Object, default: null }) declare readonly result: SliceResult | null
    @Prop({ type: String, default: '' }) declare readonly gcodeUrl: string

    viewMode: 'layers' | '3d' = 'layers'
    currentLayer = 1
    isPlaying = false
    playSpeed = '1'
    playInterval: number | null = null

    @Watch('result', { immediate: true })
    onResultChange(): void {
        if (this.result) {
            this.currentLayer = this.result.layer_count
        }
    }

    @Watch('isPlaying')
    onPlayingChange(): void {
        if (this.isPlaying) {
            this.startPlayback()
        } else {
            this.stopPlayback()
        }
    }

    prevLayer(): void {
        if (this.currentLayer > 1) {
            this.currentLayer--
        }
    }

    nextLayer(): void {
        if (this.result && this.currentLayer < this.result.layer_count) {
            this.currentLayer++
        }
    }

    togglePlay(): void {
        this.isPlaying = !this.isPlaying
    }

    startPlayback(): void {
        const speed = parseInt(this.playSpeed)
        const interval = Math.max(50, 200 / speed)

        this.playInterval = window.setInterval(() => {
            if (this.result && this.currentLayer < this.result.layer_count) {
                this.currentLayer++
            } else {
                this.isPlaying = false
            }
        }, interval)
    }

    stopPlayback(): void {
        if (this.playInterval) {
            clearInterval(this.playInterval)
            this.playInterval = null
        }
    }

    resetView(): void {
        if (this.result) {
            this.currentLayer = 1
        }
    }

    beforeDestroy(): void {
        this.stopPlayback()
    }
}
</script>

<style scoped>
.stats-bar {
    background: rgba(255, 255, 255, 0.03);
}

.layer-canvas {
    height: 200px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.gcode-viewer-container {
    height: 300px;
    position: relative;
}

.placeholder-text {
    font-size: 14px;
}
</style>
