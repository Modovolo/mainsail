<template>
    <div class="monitoring-page">
        <!-- Placeholder page for Monitoring tab - content coming soon -->
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

@Component({
    components: {},
})
export default class MonitoringPage extends Mixins(BaseMixin) {}
</script>

<style scoped>
.monitoring-page {
    height: 100%;
    width: 100%;
}
</style>
