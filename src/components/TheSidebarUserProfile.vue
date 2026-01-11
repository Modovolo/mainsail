<template>
    <div class="sidebar-user-profile">
        <v-divider class="mb-2" />
        
        <v-list-item class="user-info-item" :class="{ 'px-2': isIconsOnly }">
            <v-list-item-avatar :size="isIconsOnly ? 32 : 40" class="mr-3">
                <v-avatar :size="isIconsOnly ? 32 : 40" :color="isLoggedIn ? 'primary' : 'grey'">
                    <v-icon :size="isIconsOnly ? 18 : 24" dark>
                        {{ isLoggedIn ? 'mdi-account' : 'mdi-account-outline' }}
                    </v-icon>
                </v-avatar>
            </v-list-item-avatar>
            
            <v-list-item-content v-if="!isIconsOnly">
                <v-list-item-title class="text-body-2 font-weight-medium">
                    {{ displayName }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                    {{ displayEmail }}
                </v-list-item-subtitle>
            </v-list-item-content>
        </v-list-item>

        <v-list-item 
            v-if="!isIconsOnly"
            class="auth-button-item px-3 pb-2"
        >
            <v-btn
                v-if="isLoggedIn"
                block
                small
                outlined
                color="error"
                @click="handleLogout"
                :loading="loggingOut"
            >
                <v-icon small left>mdi-logout</v-icon>
                Sign Out
            </v-btn>
            <v-btn
                v-else
                block
                small
                color="primary"
                @click="goToLogin"
            >
                <v-icon small left>mdi-login</v-icon>
                Sign In
            </v-btn>
        </v-list-item>

        <!-- Icons only mode: just show logout/login icon -->
        <v-list-item v-else class="px-2 pb-2 justify-center">
            <v-btn
                v-if="isLoggedIn"
                icon
                small
                color="error"
                @click="handleLogout"
                :loading="loggingOut"
            >
                <v-icon small>mdi-logout</v-icon>
            </v-btn>
            <v-btn
                v-else
                icon
                small
                color="primary"
                @click="goToLogin"
            >
                <v-icon small>mdi-login</v-icon>
            </v-btn>
        </v-list-item>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'

interface UserInfo {
    username: string
    email: string
    id: string
    role?: string
}

@Component
export default class TheSidebarUserProfile extends Mixins(BaseMixin) {
    loggingOut = false
    userInfo: UserInfo | null = null

    get isLoggedIn(): boolean {
        // Check Vuex auth state or localStorage
        return this.$store.getters['auth/isAuthenticated'] || (!!localStorage.getItem('fleet_token') && this.userInfo !== null)
    }

    get isIconsOnly(): boolean {
        return this.$store.state.gui.uiSettings.navigationStyle === 'iconsOnly'
    }

    get displayName(): string {
        // Try Vuex store first, then local userInfo
        const storeUser = this.$store.state.auth?.user
        if (storeUser?.username) {
            return storeUser.username
        }
        if (this.userInfo?.username) {
            return this.userInfo.username
        }
        return 'Guest User'
    }

    get displayEmail(): string {
        // Try Vuex store first, then local userInfo
        const storeUser = this.$store.state.auth?.user
        if (storeUser?.email) {
            return storeUser.email
        }
        if (this.userInfo?.email) {
            return this.userInfo.email
        }
        return 'Not signed in'
    }

    async mounted(): Promise<void> {
        await this.loadUserInfo()
    }

    @Watch('$store.state.auth.authenticated')
    onAuthStateChanged(newVal: boolean): void {
        if (newVal) {
            this.loadUserInfo()
        } else {
            this.userInfo = null
        }
    }

    goToLogin(): void {
        this.$router.push('/login')
    }

    async loadUserInfo(): Promise<void> {
        // Check if already in Vuex store
        if (this.$store.state.auth?.user) {
            this.userInfo = {
                username: this.$store.state.auth.user.username,
                email: this.$store.state.auth.user.email || '',
                id: this.$store.state.auth.user.id,
                role: this.$store.state.auth.user.role,
            }
            return
        }

        const token = localStorage.getItem('fleet_token')
        if (!token) {
            this.userInfo = null
            return
        }

        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                this.userInfo = {
                    username: data.user.username,
                    email: data.user.email || '',
                    id: data.user.id,
                    role: data.user.role,
                }
                
                // Update Vuex store
                this.$store.commit('auth/setUser', data.user)
                this.$store.commit('auth/setAuthenticated', true)
            } else if (response.status === 401) {
                // Try refresh
                await this.tryRefreshToken()
            } else {
                this.userInfo = null
            }
        } catch (error) {
            console.error('Failed to load user info:', error)
            this.userInfo = null
        }
    }

    async tryRefreshToken(): Promise<void> {
        const refreshToken = localStorage.getItem('fleet_refresh_token')
        if (!refreshToken) {
            this.clearAuth()
            return
        }

        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            })

            if (response.ok) {
                const data = await response.json()
                localStorage.setItem('fleet_token', data.token)
                if (data.refreshToken) {
                    localStorage.setItem('fleet_refresh_token', data.refreshToken)
                }
                
                // Update Vuex store
                this.$store.commit('auth/setToken', data.token)
                if (data.refreshToken) {
                    this.$store.commit('auth/setRefreshToken', data.refreshToken)
                }
                
                // Retry loading user info
                await this.loadUserInfo()
            } else {
                this.clearAuth()
            }
        } catch (error) {
            console.error('Failed to refresh token:', error)
            this.clearAuth()
        }
    }

    clearAuth(): void {
        localStorage.removeItem('fleet_token')
        localStorage.removeItem('fleet_refresh_token')
        this.$store.commit('auth/clearAuth')
        this.userInfo = null
    }

    async handleLogout(): Promise<void> {
        this.loggingOut = true
        try {
            const token = localStorage.getItem('fleet_token')
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
            }
        } catch (error) {
            console.error('Logout error:', error)
        } finally {
            this.clearAuth()
            this.loggingOut = false
            this.$router.push('/login')
        }
    }
}
</script>

<style scoped>
.sidebar-user-profile {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 8px 8px 0 0;
    margin: 0 8px;
}

.user-info-item {
    min-height: 48px;
}

.auth-button-item {
    min-height: 40px;
}
</style>
