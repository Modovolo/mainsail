<template>
    <panel
        :icon="mdiAxisArrow"
        title="Transform"
        :collapsible="true"
        card-class="transform-panel">
        <template #buttons>
            <v-btn-toggle
                v-model="transformMode"
                mandatory
                dense
                class="mr-2">
                <v-btn small value="move" :title="$t ? $t('Move') : 'Move'">
                    <v-icon small>{{ mdiCursorMove }}</v-icon>
                </v-btn>
                <v-btn small value="rotate" :title="$t ? $t('Rotate') : 'Rotate'">
                    <v-icon small>{{ mdiRotate3dVariant }}</v-icon>
                </v-btn>
                <v-btn small value="scale" :title="$t ? $t('Scale') : 'Scale'">
                    <v-icon small>{{ mdiResize }}</v-icon>
                </v-btn>
            </v-btn-toggle>
        </template>

        <v-container class="pa-3">
            <!-- No selection state -->
            <div v-if="!hasSelection" class="text-center grey--text py-4">
                <v-icon color="grey" size="24">{{ mdiCursorDefaultClick }}</v-icon>
                <div class="text-caption mt-2">Select an object to transform</div>
            </div>

            <!-- Transform controls -->
            <template v-else>
                <!-- Move mode -->
                <div v-if="transformMode === 'move'" class="transform-inputs">
                    <v-row dense>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="position.x"
                                label="X"
                                type="number"
                                :step="moveStep"
                                suffix="mm"
                                outlined
                                dense
                                hide-details
                                @change="applyPosition" />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="position.y"
                                label="Y"
                                type="number"
                                :step="moveStep"
                                suffix="mm"
                                outlined
                                dense
                                hide-details
                                @change="applyPosition" />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="position.z"
                                label="Z"
                                type="number"
                                :step="moveStep"
                                suffix="mm"
                                outlined
                                dense
                                hide-details
                                @change="applyPosition" />
                        </v-col>
                    </v-row>
                    <div class="quick-actions mt-3">
                        <v-btn small outlined @click="$emit('action', 'centerSelected')">
                            <v-icon left small>{{ mdiAlignHorizontalCenter }}</v-icon>
                            Center
                        </v-btn>
                        <v-btn small outlined @click="$emit('action', 'layFlat')">
                            <v-icon left small>{{ mdiAlignVerticalBottom }}</v-icon>
                            Drop to Bed
                        </v-btn>
                    </div>
                </div>

                <!-- Rotate mode -->
                <div v-if="transformMode === 'rotate'" class="transform-inputs">
                    <v-row dense>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="rotation.x"
                                label="X"
                                type="number"
                                :step="rotateStep"
                                suffix="°"
                                outlined
                                dense
                                hide-details
                                @change="applyRotation" />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="rotation.y"
                                label="Y"
                                type="number"
                                :step="rotateStep"
                                suffix="°"
                                outlined
                                dense
                                hide-details
                                @change="applyRotation" />
                        </v-col>
                        <v-col cols="4">
                            <v-text-field
                                v-model.number="rotation.z"
                                label="Z"
                                type="number"
                                :step="rotateStep"
                                suffix="°"
                                outlined
                                dense
                                hide-details
                                @change="applyRotation" />
                        </v-col>
                    </v-row>
                    <div class="quick-actions mt-3">
                        <v-btn small outlined @click="rotateQuick('x', 90)">X +90°</v-btn>
                        <v-btn small outlined @click="rotateQuick('y', 90)">Y +90°</v-btn>
                        <v-btn small outlined @click="rotateQuick('z', 90)">Z +90°</v-btn>
                        <v-btn small outlined @click="$emit('action', 'layFlat')" class="mt-1">
                            <v-icon left small>{{ mdiAlignVerticalBottom }}</v-icon>
                            Lay Flat
                        </v-btn>
                    </div>
                </div>

                <!-- Scale mode -->
                <div v-if="transformMode === 'scale'" class="transform-inputs">
                    <v-row dense align="center">
                        <v-col cols="3">
                            <v-text-field
                                v-model.number="scale.x"
                                label="X"
                                type="number"
                                :step="scaleStep"
                                :disabled="uniformScale"
                                outlined
                                dense
                                hide-details
                                @change="applyScale" />
                        </v-col>
                        <v-col cols="3">
                            <v-text-field
                                v-model.number="scale.y"
                                label="Y"
                                type="number"
                                :step="scaleStep"
                                :disabled="uniformScale"
                                outlined
                                dense
                                hide-details
                                @change="applyScale" />
                        </v-col>
                        <v-col cols="3">
                            <v-text-field
                                v-model.number="scale.z"
                                label="Z"
                                type="number"
                                :step="scaleStep"
                                :disabled="uniformScale"
                                outlined
                                dense
                                hide-details
                                @change="applyScale" />
                        </v-col>
                        <v-col cols="3">
                            <v-btn
                                icon
                                small
                                :color="uniformScale ? 'primary' : ''"
                                @click="uniformScale = !uniformScale"
                                title="Uniform Scale">
                                <v-icon small>{{ uniformScale ? mdiLink : mdiLinkOff }}</v-icon>
                            </v-btn>
                        </v-col>
                    </v-row>
                    
                    <!-- Uniform scale slider -->
                    <v-slider
                        v-if="uniformScale"
                        v-model="uniformScaleValue"
                        label="Scale"
                        :min="10"
                        :max="500"
                        :step="1"
                        thumb-label="always"
                        class="mt-4"
                        @change="applyUniformScale">
                        <template #thumb-label="{ value }">{{ value }}%</template>
                    </v-slider>

                    <div class="quick-actions mt-3">
                        <v-btn small outlined @click="setScale(50)">50%</v-btn>
                        <v-btn small outlined @click="setScale(100)">100%</v-btn>
                        <v-btn small outlined @click="setScale(200)">200%</v-btn>
                        <v-btn small outlined color="primary" @click="$emit('action', 'mirror')">
                            <v-icon left small>{{ mdiFlipHorizontal }}</v-icon>
                            Mirror
                        </v-btn>
                    </div>
                </div>

                <!-- Dimensions display -->
                <v-divider class="my-3" />
                <div class="dimensions-display">
                    <div class="text-caption grey--text mb-1">Dimensions</div>
                    <v-row dense>
                        <v-col cols="4" class="text-center">
                            <div class="text-caption grey--text">Width</div>
                            <div class="text-body-2">{{ dimensions.w.toFixed(1) }} mm</div>
                        </v-col>
                        <v-col cols="4" class="text-center">
                            <div class="text-caption grey--text">Depth</div>
                            <div class="text-body-2">{{ dimensions.d.toFixed(1) }} mm</div>
                        </v-col>
                        <v-col cols="4" class="text-center">
                            <div class="text-caption grey--text">Height</div>
                            <div class="text-body-2">{{ dimensions.h.toFixed(1) }} mm</div>
                        </v-col>
                    </v-row>
                </div>

                <!-- Reset button -->
                <v-btn
                    block
                    small
                    outlined
                    class="mt-3"
                    @click="resetTransform">
                    <v-icon left small>{{ mdiRestart }}</v-icon>
                    Reset Transform
                </v-btn>
            </template>
        </v-container>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import {
    mdiAxisArrow,
    mdiCursorMove,
    mdiRotate3dVariant,
    mdiResize,
    mdiAlignHorizontalCenter,
    mdiAlignVerticalBottom,
    mdiLink,
    mdiLinkOff,
    mdiFlipHorizontal,
    mdiRestart,
    mdiCursorDefaultClick,
} from '@mdi/js'
import { PrepareWidget } from '@/util/mesh'

interface Vec3 {
    x: number
    y: number
    z: number
}

@Component({
    components: { Panel },
})
export default class TransformPanel extends Mixins(BaseMixin) {
    mdiAxisArrow = mdiAxisArrow
    mdiCursorMove = mdiCursorMove
    mdiRotate3dVariant = mdiRotate3dVariant
    mdiResize = mdiResize
    mdiAlignHorizontalCenter = mdiAlignHorizontalCenter
    mdiAlignVerticalBottom = mdiAlignVerticalBottom
    mdiLink = mdiLink
    mdiLinkOff = mdiLinkOff
    mdiFlipHorizontal = mdiFlipHorizontal
    mdiRestart = mdiRestart
    mdiCursorDefaultClick = mdiCursorDefaultClick

    @Prop({ type: Object, default: null }) declare readonly selectedWidget: PrepareWidget | null
    @Prop({ type: Boolean, default: false }) declare readonly hasSelection: boolean

    transformMode: 'move' | 'rotate' | 'scale' = 'move'
    uniformScale = true
    uniformScaleValue = 100

    // Step sizes
    moveStep = 1
    rotateStep = 5
    scaleStep = 0.1

    // Local transform values
    position: Vec3 = { x: 0, y: 0, z: 0 }
    rotation: Vec3 = { x: 0, y: 0, z: 0 }
    scale: Vec3 = { x: 1, y: 1, z: 1 }
    dimensions = { w: 0, h: 0, d: 0 }

    @Watch('selectedWidget', { immediate: true, deep: true })
    onWidgetChange(): void {
        if (this.selectedWidget) {
            const track = this.selectedWidget.track
            this.position = { ...track.pos }
            this.rotation = {
                x: this.radToDeg(track.rot.x),
                y: this.radToDeg(track.rot.y),
                z: this.radToDeg(track.rot.z),
            }
            this.scale = { ...track.scale }
            this.dimensions = { ...track.box }
            this.uniformScaleValue = Math.round(track.scale.x * 100)
        }
    }

    radToDeg(rad: number): number {
        return Math.round((rad * 180) / Math.PI)
    }

    degToRad(deg: number): number {
        return (deg * Math.PI) / 180
    }

    applyPosition(): void {
        this.$emit('transform', {
            type: 'position',
            value: { ...this.position },
        })
    }

    applyRotation(): void {
        this.$emit('transform', {
            type: 'rotation',
            value: {
                x: this.degToRad(this.rotation.x),
                y: this.degToRad(this.rotation.y),
                z: this.degToRad(this.rotation.z),
            },
        })
    }

    applyScale(): void {
        this.$emit('transform', {
            type: 'scale',
            value: { ...this.scale },
        })
    }

    applyUniformScale(): void {
        const factor = this.uniformScaleValue / 100
        this.scale = { x: factor, y: factor, z: factor }
        this.applyScale()
    }

    setScale(percent: number): void {
        this.uniformScaleValue = percent
        if (this.uniformScale) {
            this.applyUniformScale()
        }
    }

    rotateQuick(axis: 'x' | 'y' | 'z', degrees: number): void {
        this.rotation[axis] = (this.rotation[axis] + degrees) % 360
        this.applyRotation()
    }

    resetTransform(): void {
        this.position = { x: 0, y: 0, z: 0 }
        this.rotation = { x: 0, y: 0, z: 0 }
        this.scale = { x: 1, y: 1, z: 1 }
        this.uniformScaleValue = 100
        this.$emit('reset-transform')
    }
}
</script>

<style scoped>
.transform-inputs .v-text-field {
    font-size: 12px;
}

.quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.quick-actions .v-btn {
    flex: 0 0 auto;
}

.dimensions-display {
    background: rgba(128, 128, 128, 0.1);
    border-radius: 4px;
    padding: 8px;
}
</style>
