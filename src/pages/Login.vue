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

                                        <div class="d-flex justify-space-between mt-4">
                                            <v-btn text small color="primary" @click="showForgotUsername = true">
                                                Forgot Username?
                                            </v-btn>
                                            <v-btn text small color="primary" @click="showForgotPassword = true">
                                                Forgot Password?
                                            </v-btn>
                                        </div>
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

            <!-- Forgot Username Dialog -->
            <v-dialog v-model="showForgotUsername" max-width="400">
                <v-card>
                    <v-card-title class="primary white--text">
                        <v-icon class="mr-2" color="white">mdi-account-question</v-icon>
                        Forgot Username
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <p class="text-body-2 mb-4">
                            Enter your email address and we'll look up your username.
                        </p>
                        <v-text-field
                            v-model="forgotUsernameEmail"
                            label="Email Address"
                            prepend-icon="mdi-email"
                            outlined
                            dense
                            type="email"
                            :rules="[(v) => !!v || 'Email is required', (v) => /.+@.+\..+/.test(v) || 'Invalid email']"
                        />
                        <v-alert v-if="forgotUsernameResult" :type="forgotUsernameResult.username ? 'success' : 'info'" dense class="mt-2">
                            <span v-if="forgotUsernameResult.username">
                                Your username is: <strong>{{ forgotUsernameResult.username }}</strong>
                            </span>
                            <span v-else>
                                No account found with this email address.
                            </span>
                        </v-alert>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text @click="closeForgotUsername">Close</v-btn>
                        <v-btn
                            color="primary"
                            :loading="forgotUsernameLoading"
                            :disabled="!forgotUsernameEmail || forgotUsernameLoading"
                            @click="lookupUsername"
                        >
                            Look Up
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>

            <!-- Forgot Password Dialog -->
            <v-dialog v-model="showForgotPassword" max-width="450">
                <v-card>
                    <v-card-title class="primary white--text">
                        <v-icon class="mr-2" color="white">mdi-lock-reset</v-icon>
                        Reset Password
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <!-- Step 1: Request Reset Token -->
                        <div v-if="resetPasswordStep === 1">
                            <p class="text-body-2 mb-4">
                                Enter your username or email to receive a password reset token.
                            </p>
                            <v-text-field
                                v-model="resetPasswordIdentifier"
                                label="Username or Email"
                                prepend-icon="mdi-account"
                                outlined
                                dense
                                :rules="[(v) => !!v || 'Username or email is required']"
                            />
                        </div>

                        <!-- Step 2: Enter Token and New Password -->
                        <div v-else-if="resetPasswordStep === 2">
                            <v-alert type="success" dense class="mb-4">
                                A reset token has been generated. Enter it below with your new password.
                            </v-alert>
                            <v-text-field
                                v-model="resetToken"
                                label="Reset Token"
                                prepend-icon="mdi-key"
                                outlined
                                dense
                                class="mb-3"
                                :rules="[(v) => !!v || 'Reset token is required']"
                            />
                            <v-text-field
                                v-model="newPassword"
                                :type="showNewPassword ? 'text' : 'password'"
                                label="New Password"
                                prepend-icon="mdi-lock"
                                :append-icon="showNewPassword ? 'mdi-eye' : 'mdi-eye-off'"
                                @click:append="showNewPassword = !showNewPassword"
                                outlined
                                dense
                                class="mb-3"
                                :rules="[(v) => !!v || 'Password is required', (v) => (v && v.length >= 8) || 'Password must be at least 8 characters']"
                            />
                            <v-text-field
                                v-model="confirmNewPassword"
                                :type="showNewPassword ? 'text' : 'password'"
                                label="Confirm New Password"
                                prepend-icon="mdi-lock-check"
                                outlined
                                dense
                                :rules="[(v) => !!v || 'Please confirm password', (v) => v === newPassword || 'Passwords do not match']"
                            />
                        </div>

                        <!-- Step 3: Success -->
                        <div v-else-if="resetPasswordStep === 3">
                            <v-alert type="success" dense>
                                Your password has been reset successfully. You can now sign in with your new password.
                            </v-alert>
                        </div>

                        <v-alert v-if="resetPasswordError" type="error" dense class="mt-2">
                            {{ resetPasswordError }}
                        </v-alert>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text @click="closeForgotPassword">
                            {{ resetPasswordStep === 3 ? 'Done' : 'Cancel' }}
                        </v-btn>
                        <v-btn
                            v-if="resetPasswordStep === 1"
                            color="primary"
                            :loading="resetPasswordLoading"
                            :disabled="!resetPasswordIdentifier"
                            @click="requestPasswordReset"
                        >
                            Request Reset
                        </v-btn>
                        <v-btn
                            v-else-if="resetPasswordStep === 2"
                            color="primary"
                            :loading="resetPasswordLoading"
                            :disabled="!resetToken || !newPassword || newPassword !== confirmNewPassword || newPassword.length < 8"
                            @click="resetPassword"
                        >
                            Reset Password
                        </v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
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

    // Forgot username
    showForgotUsername = false
    forgotUsernameEmail = ''
    forgotUsernameLoading = false
    forgotUsernameResult: { username: string | null } | null = null

    // Forgot password
    showForgotPassword = false
    resetPasswordStep = 1  // 1: request token, 2: enter token + new password, 3: success
    resetPasswordIdentifier = ''
    resetToken = ''
    newPassword = ''
    confirmNewPassword = ''
    showNewPassword = false
    resetPasswordLoading = false
    resetPasswordError = ''

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

    // Forgot Username Methods
    async lookupUsername() {
        this.forgotUsernameLoading = true
        this.forgotUsernameResult = null
        try {
            const response = await fetch('/api/auth/forgot-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this.forgotUsernameEmail }),
            })
            const data = await response.json()
            if (response.ok) {
                this.forgotUsernameResult = { username: data.username }
            } else {
                this.forgotUsernameResult = { username: null }
            }
        } catch (err) {
            this.forgotUsernameResult = { username: null }
        } finally {
            this.forgotUsernameLoading = false
        }
    }

    closeForgotUsername() {
        this.showForgotUsername = false
        this.forgotUsernameEmail = ''
        this.forgotUsernameResult = null
    }

    // Forgot Password Methods
    async requestPasswordReset() {
        this.resetPasswordLoading = true
        this.resetPasswordError = ''
        try {
            const response = await fetch('/api/auth/request-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: this.resetPasswordIdentifier }),
            })
            const data = await response.json()
            if (response.ok) {
                this.resetPasswordStep = 2  // Move to token entry step
            } else {
                this.resetPasswordError = data.error || 'Failed to request password reset'
            }
        } catch (err) {
            this.resetPasswordError = 'Network error. Please try again.'
        } finally {
            this.resetPasswordLoading = false
        }
    }

    async resetPassword() {
        if (this.newPassword !== this.confirmNewPassword) {
            this.resetPasswordError = 'Passwords do not match'
            return
        }
        this.resetPasswordLoading = true
        this.resetPasswordError = ''
        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: this.resetToken,
                    new_password: this.newPassword,
                }),
            })
            const data = await response.json()
            if (response.ok) {
                this.resetPasswordStep = 3  // Success step
            } else {
                this.resetPasswordError = data.error || 'Failed to reset password'
            }
        } catch (err) {
            this.resetPasswordError = 'Network error. Please try again.'
        } finally {
            this.resetPasswordLoading = false
        }
    }

    closeForgotPassword() {
        this.showForgotPassword = false
        this.resetPasswordStep = 1
        this.resetPasswordIdentifier = ''
        this.resetToken = ''
        this.newPassword = ''
        this.confirmNewPassword = ''
        this.resetPasswordError = ''
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
