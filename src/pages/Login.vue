<template>
    <div class="login-wrapper text-center mt-12">
        <v-card class="mx-auto" max-width="400">
            <v-card-title>Login</v-card-title>
            <v-card-text>
                <p>Authentication is managed by Keycloak.</p>
                <v-btn color="primary" @click="handleLogin">Login with Keycloak</v-btn>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { userManager } from '../plugins/oidc'

@Component({
    name: 'Login'
})
export default class Login extends Vue {
    handleLogin() {
        userManager.signinRedirect()
    }
}
</script>

<style scoped>
.login-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}
</style>
