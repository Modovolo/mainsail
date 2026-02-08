<template>
    <panel
        :icon="mdiCubeOutline"
        :title="`Objects (${widgetCount})`"
        :collapsible="true"
        card-class="object-list-panel">
        <template #buttons>
            <v-menu left offset-y>
                <template #activator="{ on, attrs }">
                    <v-btn icon tile v-bind="attrs" v-on="on">
                        <v-icon>{{ mdiDotsVertical }}</v-icon>
                    </v-btn>
                </template>
                <v-list dense>
                    <v-list-item @click="$emit('action', 'selectAll')">
                        <v-list-item-icon><v-icon small>{{ mdiSelectAll }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Select All</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="$emit('action', 'arrange')">
                        <v-list-item-icon><v-icon small>{{ mdiViewGrid }}</v-icon></v-list-item-icon>
                        <v-list-item-title>Auto Arrange</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="$emit('action', 'clear')">
                        <v-list-item-icon><v-icon small color="error">{{ mdiDeleteSweep }}</v-icon></v-list-item-icon>
                        <v-list-item-title class="error--text">Clear All</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>

        <v-list dense class="object-list py-0">
            <draggable
                v-model="localWidgets"
                handle=".drag-handle"
                :animation="200"
                @end="onDragEnd">
                <transition-group type="transition" name="flip-list">
                    <v-list-item
                        v-for="widget in localWidgets"
                        :key="widget.id"
                        :class="{ 'widget-selected': selectedIds.includes(widget.id) }"
                        @click="onWidgetClick(widget, $event)"
                        @mouseenter="$emit('hover', widget)"
                        @mouseleave="$emit('hover', null)">
                        <v-list-item-icon class="drag-handle mr-1" style="cursor: grab;">
                            <v-icon x-small>{{ mdiDrag }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-icon class="mr-2">
                            <v-icon small :color="selectedIds.includes(widget.id) ? 'primary' : ''">
                                {{ mdiCube }}
                            </v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title class="text-caption">
                                {{ widget.name }}
                            </v-list-item-title>
                            <v-list-item-subtitle class="text-caption">
                                {{ formatDimensions(widget) }}
                            </v-list-item-subtitle>
                        </v-list-item-content>
                        <v-list-item-action class="my-0">
                            <div class="d-flex">
                                <v-btn icon x-small @click.stop="toggleVisibility(widget)">
                                    <v-icon x-small>{{ widget.visible !== false ? mdiEye : mdiEyeOff }}</v-icon>
                                </v-btn>
                                <v-btn icon x-small @click.stop="toggleLock(widget)">
                                    <v-icon x-small>{{ widget.locked ? mdiLock : mdiLockOpenVariant }}</v-icon>
                                </v-btn>
                                <v-btn icon x-small @click.stop="$emit('delete', widget)">
                                    <v-icon x-small>{{ mdiClose }}</v-icon>
                                </v-btn>
                            </div>
                        </v-list-item-action>
                    </v-list-item>
                </transition-group>
            </draggable>
        </v-list>

        <!-- Empty state -->
        <div v-if="widgetCount === 0" class="text-center pa-4 grey--text">
            <v-icon size="32" color="grey">{{ mdiCubeOutline }}</v-icon>
            <div class="text-caption mt-2">No objects on platform</div>
        </div>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import Panel from '@/components/ui/Panel.vue'
import draggable from 'vuedraggable'
import {
    mdiCube,
    mdiCubeOutline,
    mdiClose,
    mdiDotsVertical,
    mdiSelectAll,
    mdiViewGrid,
    mdiDeleteSweep,
    mdiDrag,
    mdiEye,
    mdiEyeOff,
    mdiLock,
    mdiLockOpenVariant,
} from '@mdi/js'
import { PrepareWidget } from '@/util/mesh'

@Component({
    components: { Panel, draggable },
})
export default class ObjectListPanel extends Mixins(BaseMixin) {
    mdiCube = mdiCube
    mdiCubeOutline = mdiCubeOutline
    mdiClose = mdiClose
    mdiDotsVertical = mdiDotsVertical
    mdiSelectAll = mdiSelectAll
    mdiViewGrid = mdiViewGrid
    mdiDeleteSweep = mdiDeleteSweep
    mdiDrag = mdiDrag
    mdiEye = mdiEye
    mdiEyeOff = mdiEyeOff
    mdiLock = mdiLock
    mdiLockOpenVariant = mdiLockOpenVariant

    @Prop({ type: Array, default: () => [] }) declare readonly widgets: PrepareWidget[]
    @Prop({ type: Array, default: () => [] }) declare readonly selectedIds: string[]

    localWidgets: PrepareWidget[] = []

    get widgetCount(): number {
        return this.widgets.length
    }

    @Watch('widgets', { immediate: true, deep: true })
    onWidgetsChange(): void {
        this.localWidgets = [...this.widgets]
    }

    formatDimensions(widget: PrepareWidget): string {
        if (!widget.bounds) return ''
        const box = widget.bounds
        const w = (box.max.x - box.min.x).toFixed(1)
        const h = (box.max.y - box.min.y).toFixed(1)
        const d = (box.max.z - box.min.z).toFixed(1)
        return `${w} × ${h} × ${d} mm`
    }

    onWidgetClick(widget: PrepareWidget, event: MouseEvent): void {
        this.$emit('select', { widget, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey || event.metaKey })
    }

    onDragEnd(): void {
        this.$emit('reorder', this.localWidgets)
    }

    toggleVisibility(widget: PrepareWidget): void {
        this.$emit('toggle-visibility', widget)
    }

    toggleLock(widget: PrepareWidget): void {
        this.$emit('toggle-lock', widget)
    }
}
</script>

<style scoped>
.object-list .v-list-item {
    min-height: 40px;
    border-left: 3px solid transparent;
    transition: border-color 0.2s, background-color 0.2s;
}

.object-list .v-list-item:hover {
    background-color: rgba(var(--v-primary-base), 0.05);
}

.object-list .v-list-item.widget-selected {
    border-left-color: var(--v-primary-base);
    background-color: rgba(var(--v-primary-base), 0.1);
}

.flip-list-move {
    transition: transform 0.3s;
}

.drag-handle:active {
    cursor: grabbing;
}
</style>
