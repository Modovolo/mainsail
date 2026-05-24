import { ActionTree } from 'vuex'
import { AuthState, AuthUser } from './types'
import { RootState } from '../types'
import Vue from 'vue'
import axios from 'axios'
import { User as OidcUser } from 'oidc-client-ts'

import { userManager } from '@/plugins/oidc'

function normalizeToken(token: string | null | undefined): string {
    return (token ?? '').replace(/^Bearer\s+/i, '').trim()
}

function isTokenExpiredOrNearExpiry(token: string, skewSeconds = 60): boolean {
    try {
        const payload = token.split('.')[1]
        if (!payload) {
            return false
        }

        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
        const claims = JSON.parse(atob(padded)) as { exp?: number }

        if (typeof claims.exp !== 'number') {
            return false
        }

        return claims.exp <= Math.floor(Date.now() / 1000) + skewSeconds
    } catch {
        return false
    }
}

function mapOidcUser(user: OidcUser): AuthUser {
    const profile = (user?.profile ?? {}) as Record<string, unknown>
    const username =
        (profile.preferred_username as string) ||
        (profile.email as string) ||
        (profile.sub as string) ||
        'unknown'

    return {
        id: (profile.sub as string) || username,
        username,
        email: profile.email as string | undefined,
        role: 'user',
    }
}

async function fetchBackendUser(): Promise<AuthUser | null> {
    try {
        const response = await axios.get('/api/auth/me', {
            timeout: 5000,
        })
        return response.data?.user ?? null
    } catch {
        return null
    }
}

// Map backend error messages to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
    // Registration errors
    'Username already exists': 'This username is already registered. Please log in or use a different username.',
    'Username and password required': 'Please provide both username and password.',
    'Username must be at least 3 characters': 'Username must be at least 3 characters long.',
    'Password must be at least 8 characters': 'Password must be at least 8 characters long.',
    'Failed to create user': 'Unable to create account. Please try again later.',
    
    // Login errors
    'Invalid credentials': 'Invalid username or password. Please try again.',
    'User not found': 'No account found with this username.',
    'Invalid username or password': 'Invalid username or password. Please try again.',
    'Account is disabled': 'Your account has been disabled. Please contact support.',
    
    // Token errors
    'Invalid token': 'Your session has expired. Please log in again.',
    'Token expired': 'Your session has expired. Please log in again.',
    'Refresh token expired': 'Your session has expired. Please log in again.',
    
    // Password errors
    'Current password is incorrect': 'The current password you entered is incorrect.',
    'New password must be different': 'Your new password must be different from the current one.',
    
    // Network/Server errors
    'Network Error': 'Unable to connect to the server. Please check your internet connection.',
    'Request failed with status code 500': 'Server error. Please try again later.',
    'Request failed with status code 503': 'Service temporarily unavailable. Please try again later.',
}

function getUserFriendlyError(error: any): string {
    // Check if we have a specific error message from the backend
    const backendMessage = error.response?.data?.error || error.response?.data?.message
    
    if (backendMessage && ERROR_MESSAGES[backendMessage]) {
        return ERROR_MESSAGES[backendMessage]
    }
    
    // Check for HTTP status codes
    if (error.response?.status === 409) {
        return 'This username is already registered. Please log in or use a different username.'
    }
    
    if (error.response?.status === 401) {
        return 'Invalid username or password. Please try again.'
    }
    
    if (error.response?.status === 403) {
        return 'Access denied. You do not have permission to perform this action.'
    }
    
    if (error.response?.status === 404) {
        return 'Resource not found. Please check your request.'
    }
    
    if (error.response?.status >= 500) {
        return 'Server error. Please try again later.'
    }
    
    // Check for network errors
    if (error.message === 'Network Error' || !error.response) {
        return 'Unable to connect to the server. Please check your internet connection.'
    }
    
    // Fallback to backend message or generic error
    return backendMessage || error.message || 'An unexpected error occurred. Please try again.'
}

export const actions: ActionTree<AuthState, RootState> = {
    async keycloakLogin({ commit, dispatch }, user: any) {
        let oidcUser = user as OidcUser
        let token = normalizeToken(oidcUser?.access_token)

        if (!token || oidcUser?.expired || isTokenExpiredOrNearExpiry(token)) {
            const refreshed = await dispatch('refreshToken')
            if (!refreshed) {
                commit('setError', 'Authentication failed. Session expired. Please log in again.')
                return false
            }

            oidcUser = (await userManager.getUser()) as OidcUser
            token = normalizeToken(oidcUser?.access_token)
        }

        if (!token) {
            commit('setError', 'Authentication failed. Missing access token.')
            return false
        }

        commit('setToken', token)
        localStorage.setItem('fleet_token', token)
        localStorage.removeItem('fleet_refresh_token')
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

        const oidcProfileUser = mapOidcUser(oidcUser)
        commit('setUser', oidcProfileUser)
        commit('setAuthenticated', true)
        commit('setError', null)

        void fetchBackendUser().then((backendUser) => {
            if (backendUser) {
                commit('setUser', backendUser)
            }
        })
        
        Vue.$toast.success('Login successful')
        return true
    },

    async login({ commit }, credentials: { username: string; password: string }) {
        commit('setLoading', true)
        commit('setError', null)

        try {
            const response = await axios.post('/api/auth/login', credentials)
            const rawToken = response.data?.token
            const token = normalizeToken(rawToken)
            const { user } = response.data

            commit('setToken', token)
            commit('setUser', user)
            commit('setAuthenticated', true)

            // Store access token in localStorage (refresh token is in HttpOnly cookie)
            localStorage.setItem('fleet_token', token)

            // Set axios default header
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

            Vue.$toast.success('Login successful')
            return true
        } catch (error: any) {
            const message = getUserFriendlyError(error)
            commit('setError', message)
            Vue.$toast.error(message)
            return false
        } finally {
            commit('setLoading', false)
        }
    },

    async logout({ commit }) {
        try {
            await axios.post('/api/auth/logout')
        } catch (error) {
            // Ignore logout errors
        }

        try {
            await userManager.removeUser()
        } catch (error) {
            // Ignore OIDC cleanup errors
        }

        commit('clearAuth')
        localStorage.removeItem('fleet_token')
        localStorage.removeItem('fleet_refresh_token')
        delete axios.defaults.headers.common['Authorization']

        Vue.$toast.info('Logged out')
    },

    async refreshToken({ commit }) {
        try {
            let oidcUser = await userManager.getUser()
            if (!oidcUser || oidcUser.expired) {
                oidcUser = await userManager.signinSilent()
            }

            const token = normalizeToken(oidcUser?.access_token)
            if (!token) {
                return false
            }

            commit('setToken', token)
            localStorage.setItem('fleet_token', token)
            localStorage.removeItem('fleet_refresh_token')
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

            return true
        } catch (error) {
            console.warn('OIDC token refresh failed:', error)
            return false
        }
    },

    async checkAuth({ commit, dispatch }) {
        let oidcUser = await userManager.getUser()
        if (!oidcUser) {
            localStorage.removeItem('fleet_token')
            delete axios.defaults.headers.common['Authorization']
            return false
        }

        if (oidcUser.expired) {
            const refreshed = await dispatch('refreshToken')
            if (!refreshed) {
                return false
            }
            oidcUser = await userManager.getUser()
            if (!oidcUser) {
                return false
            }
        }

        let token = normalizeToken(oidcUser.access_token)
        if (!token) {
            return false
        }

        if (isTokenExpiredOrNearExpiry(token)) {
            const refreshed = await dispatch('refreshToken')
            if (!refreshed) {
                return false
            }

            const refreshedUser = await userManager.getUser()
            token = normalizeToken(refreshedUser?.access_token)
            if (!token) {
                return false
            }
            oidcUser = refreshedUser
        }

        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

        const applyAuthenticatedState = (user: AuthUser) => {
            commit('setUser', user)
            commit('setToken', token)
            commit('setAuthenticated', true)
            commit('setError', null)
        }

        try {
            const response = await axios.get('/api/auth/me')
            applyAuthenticatedState(response.data.user)
            return true
        } catch (error: any) {
            if (error.response?.status === 401) {
                const refreshed = await dispatch('refreshToken')
                if (!refreshed) {
                    return false
                }

                const refreshedUser = await userManager.getUser()
                token = normalizeToken(refreshedUser?.access_token)
                if (!token) {
                    return false
                }

                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

                try {
                    const retryResponse = await axios.get('/api/auth/me', {
                        timeout: 5000,
                    })
                    applyAuthenticatedState(retryResponse.data.user)
                    return true
                } catch {
                    return false
                }
            }

            // If fleet-manager is temporarily unavailable, keep the user
            // authenticated using OIDC identity and retry API calls later.
            applyAuthenticatedState(mapOidcUser(oidcUser))
            return true
        }
    },

    async register({ commit }, userData: { username: string; password: string; email?: string }) {
        commit('setLoading', true)
        commit('setError', null)

        try {
            await axios.post('/api/auth/register', userData)
            Vue.$toast.success('Registration successful. Please login.')
            return true
        } catch (error: any) {
            const message = getUserFriendlyError(error)
            commit('setError', message)
            Vue.$toast.error(message)
            return false
        } finally {
            commit('setLoading', false)
        }
    },

    async changePassword({ commit }, data: { currentPassword: string; newPassword: string }) {
        commit('setLoading', true)

        try {
            await axios.post('/api/auth/change-password', data)
            Vue.$toast.success('Password changed successfully')
            return true
        } catch (error: any) {
            const message = getUserFriendlyError(error)
            Vue.$toast.error(message)
            return false
        } finally {
            commit('setLoading', false)
        }
    },
}
