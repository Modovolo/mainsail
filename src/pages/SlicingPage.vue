<template>
    <div class="slicing-page">
        <prepare-page v-show="currentMode === 'prepare'" />
        <preview-page v-if="previewMounted" v-show="currentMode === 'preview'" />
    </div>
</template>

<script lang="ts">
import Vue from 'vue'
import PreparePage from './PreparePage.vue'
import PreviewPage from './PreviewPage.vue'

type SlicingMode = 'prepare' | 'preview'

export default Vue.extend({
    components: {
        PreparePage,
        PreviewPage,
    },

    data() {
        return {
            previewMounted: false,
        }
    },

    computed: {
        currentMode(): SlicingMode {
            const mode = String(this.$route.query.mode || 'prepare').toLowerCase()
            return mode === 'preview' ? 'preview' : 'prepare'
        },
    },

    watch: {
        '$route.query.mode': {
            immediate: true,
            handler() {
                this.syncModeState()
            },
        },
    },

    methods: {
        syncModeState() {
            if (this.currentMode === 'preview') {
                this.previewMounted = true
            }

            this.$nextTick(() => {
                window.dispatchEvent(new Event('resize'))
            })
        },
    },
})
</script>

<style scoped>
.slicing-page {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 100%;
}
</style>
