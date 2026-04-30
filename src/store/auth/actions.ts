import { ActionTree } from 'vuex'
import { AuthState } from './types'
import { RootState } from '../types'
import Vue from 'vue'
import axios from 'axios'

function normalizeToken(token: string | null | undefined): string {
    return (token ?? '').replace(/^Bearer\s+/i, '').trim()
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
    async keycloakLogin({ commit }, user: any) {
        const token = user.access_token

        commit('setToken', token)
        commit('setUser', {
            id: user.profile.sub,
            username: user.profile.preferred_username || user.profile.email,
            email: user.profile.email,
            role: 'admin', // Depending on your setup mapping, you could extract this from JWT
        })
        commit('setAuthenticated', true)

        localStorage.setItem('fleet_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        
        Vue.$toast.success('Login successful')
        return true
    },

    async login({ commit, dispatch }, credentials: { username: string; password: string }) {
        commit('setLoading', true)
        commit('setError', null)

        try {
            const response = await axios.post('/api/auth/login', credentials)
            const rawToken = response.data?.token
            const token = normalizeToken(rawToken)
            const { refreshToken, user } = response.data

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

        commit('clearAuth')
        localStorage.removeItem('fleet_token')
        delete axios.defaults.headers.common['Authorization']

        Vue.$toast.info('Logged out')
    },

    async refreshToken({ commit, state, dispatch }) {
        try {
            // Refresh token is sent automatically as HttpOnly cookie.
            // Also send legacy body for backward compat during rollout.
            const refreshToken = state.refreshToken || localStorage.getItem('fleet_refresh_token')
            const response = await axios.post('/api/auth/refresh', refreshToken ? { refreshToken } : {})
            const token = normalizeToken(response.data?.token)

            commit('setToken', token)
            localStorage.setItem('fleet_token', token)
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

            return true
        } catch (error: any) {
            const status = error.response?.status
            // Only force-logout when the server explicitly rejects the refresh
            // token (401/403). Transient network errors or 5xx responses should
            // NOT destroy the local session — the user can retry later.
            if (status === 401 || status === 403) {
                dispatch('logout')
            }
            return false
        }
    },

    async checkAuth({ commit, dispatch }) {
        const token = normalizeToken(localStorage.getItem('fleet_token'))
        
        if (!token) {
            return false
        }

        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

        try {
            const response = await axios.get('/api/auth/me')
            commit('setUser', response.data.user)
            commit('setToken', token)
            commit('setAuthenticated', true)
            return true
        } catch (error: any) {
            if (error.response?.status === 401) {
                // Try to refresh token — refreshToken handles logout
                // internally when the refresh token is genuinely expired.
                return await dispatch('refreshToken')
            }
            // For network errors or non-auth failures, don't destroy the
            // session. The user may simply be offline temporarily.
            return false
        }
    },

    async register({ commit }, userData: { username: string; password: string; email?: string }) {
        commit('setLoading', true)
        commit('setError', null)

        try {
            const response = await axios.post('/api/auth/register', userData)
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
