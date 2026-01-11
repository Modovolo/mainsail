<template>
    <v-app>
        <v-main class="login-background">
            <v-container fluid fill-height>
                <v-row align="center" justify="center">
                    <v-col cols="12" sm="8" md="5" lg="4" xl="3">
                        <v-card class="elevation-12 login-card" :loading="loading">
                            <v-toolbar color="primary" dark flat>
                                <v-toolbar-title class="d-flex align-center justify-center" style="width: 100%">
                                    <img
                                        src="/img/modovolo-logo-logomark-white.svg"
                                        alt="Modovolo"
                                        height="32"
                                        class="mr-3"
                                    />
                                    <span>Modovolo Fleet</span>
                                </v-toolbar-title>
                            </v-toolbar>

                            <v-card-text class="pa-6 text-center">
                                <v-tabs v-model="tab" centered class="mb-6">
                                    <v-tab>Login</v-tab>
                                    <v-tab>Register</v-tab>
                                </v-tabs>

                                <v-tabs-items v-model="tab">
                                    <!-- Login Tab -->
                                    <v-tab-item>
                                        <v-form
                                            ref="loginForm"
                                            v-model="loginValid"
                                            @submit.prevent="handleLogin"
                                        >
                                            <v-text-field
                                                v-model="loginData.username"
                                                :rules="usernameRules"
                                                label="Username"
                                                prepend-icon="mdi-account"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="username"
                                            />

                                            <v-text-field
                                                v-model="loginData.password"
                                                :rules="passwordRules"
                                                :type="showPassword ? 'text' : 'password'"
                                                label="Password"
                                                prepend-icon="mdi-lock"
                                                :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                                                @click:append="showPassword = !showPassword"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="current-password"
                                            />

                                            <v-checkbox
                                                v-model="rememberMe"
                                                label="Remember me"
                                                class="mt-0 mb-4"
                                                hide-details
                                            />

                                            <v-btn
                                                type="submit"
                                                color="primary"
                                                block
                                                large
                                                :disabled="!loginValid || loading"
                                                :loading="loading"
                                            >
                                                Sign In
                                            </v-btn>
                                        </v-form>
                                    </v-tab-item>

                                    <!-- Register Tab -->
                                    <v-tab-item>
                                        <v-form
                                            ref="registerForm"
                                            v-model="registerValid"
                                            @submit.prevent="handleRegister"
                                        >
                                            <v-text-field
                                                v-model="registerData.username"
                                                :rules="usernameRules"
                                                label="Username"
                                                prepend-icon="mdi-account"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="username"
                                            />

                                            <v-text-field
                                                v-model="registerData.email"
                                                :rules="emailRules"
                                                label="Email (optional)"
                                                prepend-icon="mdi-email"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="email"
                                            />

                                            <v-text-field
                                                v-model="registerData.password"
                                                :rules="passwordRules"
                                                :type="showPassword ? 'text' : 'password'"
                                                label="Password"
                                                prepend-icon="mdi-lock"
                                                :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                                                @click:append="showPassword = !showPassword"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="new-password"
                                            />

                                            <v-text-field
                                                v-model="registerData.confirmPassword"
                                                :rules="confirmPasswordRules"
                                                :type="showPassword ? 'text' : 'password'"
                                                label="Confirm Password"
                                                prepend-icon="mdi-lock-check"
                                                outlined
                                                dense
                                                class="mb-3"
                                                autocomplete="new-password"
                                            />

                                            <v-btn
                                                type="submit"
                                                color="primary"
                                                block
                                                large
                                                :disabled="!registerValid || loading"
                                                :loading="loading"
                                            >
                                                Create Account
                                            </v-btn>
                                        </v-form>
                                    </v-tab-item>
                                </v-tabs-items>

                                <v-alert
                                    v-if="error"
                                    type="error"
                                    dense
                                    class="mt-4"
                                    dismissible
                                    @input="clearError"
                                >
                                    {{ error }}
                                </v-alert>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-container>
        </v-main>
    </v-app>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

@Component
export default class Login extends Mixins(BaseMixin) {
    tab = 0
    showPassword = false
    rememberMe = false

    loginValid = false
    registerValid = false

    loginData = {
        username: '',
        password: '',
    }

    registerData = {
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
    }

    usernameRules = [
        (v: string) => !!v || 'Username is required',
        (v: string) => (v && v.length >= 3) || 'Username must be at least 3 characters',
        (v: string) => /^[a-zA-Z0-9_-]+$/.test(v) || 'Username can only contain letters, numbers, dashes and underscores',
    ]

    passwordRules = [
        (v: string) => !!v || 'Password is required',
        (v: string) => (v && v.length >= 8) || 'Password must be at least 8 characters',
    ]

    emailRules = [
        (v: string) => !v || /.+@.+\..+/.test(v) || 'Invalid email format',
    ]

    get confirmPasswordRules() {
        return [
            (v: string) => !!v || 'Please confirm your password',
            (v: string) => v === this.registerData.password || 'Passwords do not match',
        ]
    }

    get loading(): boolean {
        return this.$store.getters['auth/isLoading']
    }

    get error(): string | null {
        return this.$store.getters['auth/authError']
    }

    async handleLogin() {
        const success = await this.$store.dispatch('auth/login', this.loginData)
        if (success) {
            const redirect = this.$route.query.redirect as string || '/'
            this.$router.push(redirect)
        }
    }

    async handleRegister() {
        const success = await this.$store.dispatch('auth/register', {
            username: this.registerData.username,
            password: this.registerData.password,
            email: this.registerData.email || undefined,
        })
        if (success) {
            this.tab = 0 // Switch to login tab
            this.loginData.username = this.registerData.username
            this.registerData = {
                username: '',
                email: '',
                password: '',
                confirmPassword: '',
            }
        }
    }

    clearError() {
        this.$store.commit('auth/setError', null)
    }

    mounted() {
        // Check if already authenticated
        if (this.$store.getters['auth/isAuthenticated']) {
            this.$router.push('/')
        }
    }
}
</script>

<style scoped>
.login-background {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    min-height: 100vh;
}

.login-card {
    background: rgba(30, 30, 30, 0.95) !important;
    border-radius: 12px !important;
}

.v-toolbar {
    border-radius: 12px 12px 0 0 !important;
}
</style>
