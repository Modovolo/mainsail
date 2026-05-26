import { ActionTree } from 'vuex'
import { AuthState, AuthUser } from './types'
import { RootState } from '../types'
import Vue from 'vue'
import axios from 'axios'
import { User as OidcUser } from 'oidc-client-ts'

import { userManager } from '@/plugins/oidc'

function oidcUserToAuthUser(user: OidcUser): AuthUser {
    const p = (user?.profile ?? {}) as Record<string, unknown>
    const username =
        (p.preferred_username as string) ||
        (p.email as string) ||
        (p.sub as string) ||
        'unknown'
    return {
        id: (p.sub as string) || username,
        username,
        email: p.email as string | undefined,
        role: 'user',
    }
}

export const actions: ActionTree<AuthState, RootState> = {
    /**
     * Called after signinCallback() completes in Callback.vue.
     * The userLoaded event (wired in main.ts) has already synced fleet_token
     * and Vuex state, so this action just shows the success toast.
     */
    async keycloakLogin({ commit }, user: OidcUser) {
        const token = user?.access_token
        if (!token) {
            commit('setError', 'Authentication failed: missing access token.')
            return false
        }

        commit('setToken', token)
        commit('setUser', oidcUserToAuthUser(user))
        commit('setAuthenticated', true)
        commit('setError', null)

        localStorage.setItem('fleet_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

        Vue.$toast.success('Login successful')
        return true
    },

    /**
     * Called by the router guard on protected-route navigation.
     * Reads the OIDC session; silently refreshes if the token is expired.
     */
    async checkAuth({ commit }) {
        let oidcUser = await userManager.getUser()

        if (!oidcUser || oidcUser.expired) {
            try {
                oidcUser = await userManager.signinSilent()
            } catch {
                commit('clearAuth')
                localStorage.removeItem('fleet_token')
                delete axios.defaults.headers.common['Authorization']
                return false
            }
        }

        if (!oidcUser?.access_token) {
            return false
        }

        const token = oidcUser.access_token
        commit('setToken', token)
        commit('setUser', oidcUserToAuthUser(oidcUser))
        commit('setAuthenticated', true)
        commit('setError', null)

        localStorage.setItem('fleet_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

        return true
    },

    /**
     * Silent token refresh via Keycloak. Used by the axios 401 interceptor
     * and components that need a fresh token on demand.
     */
    async refreshToken({ commit }) {
        try {
            const oidcUser = await userManager.signinSilent()
            if (!oidcUser?.access_token) {
                return false
            }

            const token = oidcUser.access_token
            commit('setToken', token)
            localStorage.setItem('fleet_token', token)
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
            return true
        } catch {
            return false
        }
    },

    /**
     * Clears local auth state and removes the Keycloak session.
     * For a full SSO logout (invalidates all Keycloak sessions), use
     * userManager.signoutRedirect() — this is intentionally kept as a
     * local-only logout to avoid a hard page redirect.
     */
    async logout({ commit }) {
        commit('clearAuth')
        localStorage.removeItem('fleet_token')
        delete axios.defaults.headers.common['Authorization']

        try {
            await userManager.removeUser()
        } catch {
            // OIDC cleanup is best-effort
        }

        Vue.$toast.info('Logged out')
    },
}
