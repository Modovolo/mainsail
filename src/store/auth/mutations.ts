import { MutationTree } from 'vuex'
import { AuthState, AuthUser } from './types'
import { getDefaultState } from './index'

export const mutations: MutationTree<AuthState> = {
    setToken(state, token: string | null) {
        state.token = token
    },

    setUser(state, user: AuthUser | null) {
        state.user = user
    },

    setAuthenticated(state, isAuthenticated: boolean) {
        state.isAuthenticated = isAuthenticated
    },

    setError(state, error: string | null) {
        state.error = error
    },

    clearAuth(state) {
        const d = getDefaultState()
        state.token = d.token
        state.user = d.user
        state.isAuthenticated = d.isAuthenticated
        state.error = d.error
    },
}
