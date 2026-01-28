<template>
    <div class="preview-page">
        <!-- Placeholder page for Preview tab - content coming soon -->
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

@Component({
    components: {},
})
export default class PreviewPage extends Mixins(BaseMixin) {}
</script>

<style scoped>
.preview-page {
    height: 100%;
    width: 100%;
}
</style>
