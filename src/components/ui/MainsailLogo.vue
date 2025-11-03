<template>
    <img src="/img/modovolo-logo-logomark-white.svg" alt="Modovolo Logo" style="max-height: 100%; max-width: 100%;" />
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '../mixins/base'

@Component
export default class MainsailLogo extends Mixins(BaseMixin) {}
</script>
