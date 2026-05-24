<template>
    <v-container fill-height class="d-flex align-center justify-center">
        <v-card class="pa-5 text-center elevation-12" max-width="400">
            <v-progress-circular
                indeterminate
                color="primary"
                size="64"
                class="mb-4"
            ></v-progress-circular>
            <h2 class="text-h6 font-weight-medium">Completing login...</h2>
            <p class="text-body-2 text--secondary mt-2">
                Please wait while we log you into the workspace.
            </p>
        </v-card>
    </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { userManager } from '../plugins/oidc'

@Component({
    name: 'OidcCallback'
})
export default class OidcCallback extends Vue {
    async mounted() {
        try {
            const user = await userManager.signinCallback()

            // Persist Keycloak token and hydrate fleet user profile.
            await this.$store.dispatch('auth/keycloakLogin', user)

            // Redirect back to home or desired URL
            this.$router.push('/')
        } catch (e) {
            console.error('OIDC Callback Error:', e)
            this.$toast.error('Authentication check failed. Try logging in again.')
            this.$router.push('/login')
        }
    }
}
</script>

<style scoped>
.v-progress-circular {
    margin: 20px auto;
}
</style>