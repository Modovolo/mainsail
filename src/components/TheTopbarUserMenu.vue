<template>
    <div class="topbar-user-menu d-flex align-center">
        <v-menu offset-y left nudge-bottom="5" :close-on-content-click="false">
            <template #activator="{ on, attrs }">
                <v-btn 
                    text 
                    small 
                    class="user-menu-btn px-2"
                    v-bind="attrs" 
                    v-on="on"
                >
                    <v-avatar size="28" :color="isLoggedIn ? 'primary' : 'grey'" class="mr-2">
                        <v-icon size="18" dark>
                            {{ isLoggedIn ? 'mdi-account' : 'mdi-account-outline' }}
                        </v-icon>
                    </v-avatar>
                    <span class="text-body-2 d-none d-md-inline text-truncate" style="max-width: 120px;">
                        {{ displayName }}
                    </span>
                    <v-icon small class="ml-1">mdi-chevron-down</v-icon>
                </v-btn>
            </template>
            
            <v-card min-width="220">
                <v-list dense>
                    <v-list-item class="py-2">
                        <v-list-item-avatar size="40">
                            <v-avatar size="40" :color="isLoggedIn ? 'primary' : 'grey'">
                                <v-icon size="24" dark>
                                    {{ isLoggedIn ? 'mdi-account' : 'mdi-account-outline' }}
                                </v-icon>
                            </v-avatar>
                        </v-list-item-avatar>
                        <v-list-item-content>
                            <v-list-item-title class="font-weight-medium">
                                {{ displayName }}
                            </v-list-item-title>
                            <v-list-item-subtitle>
                                {{ displayEmail }}
                            </v-list-item-subtitle>
                        </v-list-item-content>
                    </v-list-item>
                    
                    <v-divider />
                    
                    <v-list-item v-if="isLoggedIn" @click="goToSettings">
                        <v-list-item-icon>
                            <v-icon>mdi-cog</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>User Settings</v-list-item-title>
                        </v-list-item-content>
                    </v-list-item>
                    
                    <v-divider v-if="isLoggedIn" />
                    
                    <v-list-item v-if="isLoggedIn" @click="handleLogout">
                        <v-list-item-icon>
                            <v-icon color="error">mdi-logout</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title class="error--text">Sign Out</v-list-item-title>
                        </v-list-item-content>
                    </v-list-item>
                    
                    <v-list-item v-else @click="goToLogin">
                        <v-list-item-icon>
                            <v-icon color="primary">mdi-login</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title class="primary--text">Sign In</v-list-item-title>
                        </v-list-item-content>
                    </v-list-item>
                </v-list>
            </v-card>
        </v-menu>
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
class TheTopbarUserMenu extends Mixins(BaseMixin) {
    loggingOut = false
    userInfo: UserInfo | null = null

    get isLoggedIn(): boolean {
        return this.$store.getters['auth/isAuthenticated'] || (!!localStorage.getItem('fleet_token') && this.userInfo !== null)
    }

    get displayName(): string {
        const storeUser = this.$store.state.auth?.user
        if (storeUser?.username) {
            return storeUser.username
        }
        if (this.userInfo?.username) {
            return this.userInfo.username
        }
        return 'Guest'
    }

    get displayEmail(): string {
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

    goToSettings(): void {
        this.$router.push('/settings')
    }

    async loadUserInfo(): Promise<void> {
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
                
                this.$store.commit('auth/setUser', data.user)
                this.$store.commit('auth/setAuthenticated', true)
            } else if (response.status === 401) {
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
                
                this.$store.commit('auth/setToken', data.token)
                if (data.refreshToken) {
                    this.$store.commit('auth/setRefreshToken', data.refreshToken)
                }
                
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

export default TheTopbarUserMenu
</script>

<style scoped>
.topbar-user-menu {
    height: 100%;
}

.user-menu-btn {
    text-transform: none;
    letter-spacing: normal;
}
</style>
