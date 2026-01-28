<template>
    <div class="prepare-page">
        <!-- Placeholder page for Prepare tab - content coming soon -->
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

@Component({
    components: {},
})
export default class PreparePage extends Mixins(BaseMixin) {}
</script>

<style scoped>
.prepare-page {
    height: 100%;
    width: 100%;
}
</style>
