import { MutationTree } from 'vuex'
import { AuthState, AuthUser } from './types'
import { getDefaultState } from './index'

export const mutations: MutationTree<AuthState> = {
    setToken(state, token: string | null) {
        state.token = token
    },

    setRefreshToken(state, refreshToken: string | null) {
        state.refreshToken = refreshToken
    },

    setUser(state, user: AuthUser | null) {
        state.user = user
    },

    setAuthenticated(state, isAuthenticated: boolean) {
        state.isAuthenticated = isAuthenticated
    },

    setLoading(state, loading: boolean) {
        state.loading = loading
    },

    setError(state, error: string | null) {
        state.error = error
    },

    clearAuth(state) {
        const defaultState = getDefaultState()
        state.token = defaultState.token
        state.refreshToken = defaultState.refreshToken
        state.user = defaultState.user
        state.isAuthenticated = defaultState.isAuthenticated
        state.error = defaultState.error
    },
}
