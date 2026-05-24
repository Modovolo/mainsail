<template>
    <div />
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { userManager } from '../plugins/oidc'

@Component({
    name: 'OidcSilentRenew',
})
export default class OidcSilentRenew extends Vue {
    async mounted() {
        try {
            await userManager.signinSilentCallback()
        } catch (error) {
            // This page is loaded in an iframe for silent renew.
            // Logging helps diagnose token renewal issues without impacting UX.
            console.error('OIDC silent renew callback error:', error)
        }
    }
}
</script>
