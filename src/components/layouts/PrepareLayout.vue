<template>
    <div class="prepare-layout" :class="{ 'left-collapsed': leftCollapsed, 'right-collapsed': rightCollapsed }">
        <!-- Left Panel Toggle (when collapsed) -->
        <v-btn
            v-if="leftCollapsed && hasWidgets"
            fab
            x-small
            class="panel-toggle left-toggle"
            @click="leftCollapsed = false">
            <v-icon small>{{ mdiChevronRight }}</v-icon>
        </v-btn>

        <!-- Left Panel: Object List + Transform -->
        <transition name="slide-left">
            <div v-show="!leftCollapsed && hasWidgets" class="left-panel">
                <div class="panel-header d-flex align-center justify-space-between px-2 py-1">
                    <span class="text-caption font-weight-medium">OBJECTS</span>
                    <v-btn icon x-small @click="leftCollapsed = true">
                        <v-icon x-small>{{ mdiChevronLeft }}</v-icon>
                    </v-btn>
                </div>
                <div class="panel-content">
                    <slot name="left-panel" />
                </div>
            </div>
        </transition>

        <!-- Center: 3D Viewer -->
        <div class="center-panel">
            <slot name="viewer" />
        </div>

        <!-- Right Panel Toggle (when collapsed) -->
        <v-btn
            v-if="rightCollapsed"
            fab
            x-small
            class="panel-toggle right-toggle"
            @click="rightCollapsed = false">
            <v-icon small>{{ mdiChevronLeft }}</v-icon>
        </v-btn>

        <!-- Right Panel: Slice Settings -->
        <transition name="slide-right">
            <div v-show="!rightCollapsed" class="right-panel">
                <div class="panel-header d-flex align-center justify-space-between px-2 py-1">
                    <span class="text-caption font-weight-medium">SETTINGS</span>
                    <v-btn icon x-small @click="rightCollapsed = true">
                        <v-icon x-small>{{ mdiChevronRight }}</v-icon>
                    </v-btn>
                </div>
                <div class="panel-content">
                    <slot name="right-panel" />
                </div>
            </div>
        </transition>

        <!-- Bottom Bar: Status / Info -->
        <div v-if="$slots['bottom-bar']" class="bottom-bar">
            <slot name="bottom-bar" />
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'

@Component
export default class PrepareLayout extends Mixins(BaseMixin) {
    mdiChevronLeft = mdiChevronLeft
    mdiChevronRight = mdiChevronRight

    @Prop({ type: Boolean, default: false }) declare readonly hasWidgets: boolean

    leftCollapsed = false
    rightCollapsed = false

    get isMobile(): boolean {
        return this.$vuetify.breakpoint.mobile
    }

    mounted(): void {
        // Auto-collapse panels on mobile
        if (this.isMobile) {
            this.leftCollapsed = true
            this.rightCollapsed = true
        }
    }
}
</script>

<style scoped>
.prepare-layout {
    display: grid;
    grid-template-columns: 280px 1fr 320px;
    grid-template-rows: 1fr auto;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.prepare-layout.left-collapsed {
    grid-template-columns: 0 1fr 320px;
}

.prepare-layout.right-collapsed {
    grid-template-columns: 280px 1fr 0;
}

.prepare-layout.left-collapsed.right-collapsed {
    grid-template-columns: 0 1fr 0;
}

/* Panels */
.left-panel,
.right-panel {
    display: flex;
    flex-direction: column;
    background: var(--v-background-base, #1e1e1e);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
    z-index: 2;
}

.right-panel {
    border-right: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header {
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    min-height: 32px;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

/* Center viewer */
.center-panel {
    position: relative;
    overflow: hidden;
    min-width: 0;
}

/* Bottom bar */
.bottom-bar {
    grid-column: 1 / -1;
    background: var(--v-background-base, #1e1e1e);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    z-index: 3;
}

/* Toggle buttons */
.panel-toggle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    background: var(--v-background-base, #1e1e1e) !important;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.left-toggle {
    left: 8px;
}

.right-toggle {
    right: 8px;
}

/* Transitions */
.slide-left-enter-active,
.slide-left-leave-active {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-left-enter,
.slide-left-leave-to {
    transform: translateX(-100%);
    opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-right-enter,
.slide-right-leave-to {
    transform: translateX(100%);
    opacity: 0;
}

/* Responsive */
@media (max-width: 960px) {
    .prepare-layout {
        grid-template-columns: 0 1fr 0;
    }

    .left-panel,
    .right-panel {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 280px;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }

    .left-panel {
        left: 0;
    }

    .right-panel {
        right: 0;
        width: 300px;
    }

    .prepare-layout:not(.left-collapsed) .left-panel,
    .prepare-layout:not(.right-collapsed) .right-panel {
        transform: translateX(0);
    }
}
</style>
