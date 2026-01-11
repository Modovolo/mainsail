import { GetterTree } from 'vuex'
import { AuthState } from './types'
import { RootState } from '../types'

export const getters: GetterTree<AuthState, RootState> = {
    isAuthenticated: (state): boolean => {
        return state.isAuthenticated && !!state.token
    },

    currentUser: (state) => {
        return state.user
    },

    username: (state): string => {
        return state.user?.username || ''
    },

    userRole: (state): string => {
        return state.user?.role || 'user'
    },

    isAdmin: (state): boolean => {
        return state.user?.role === 'admin'
    },

    authError: (state): string | null => {
        return state.error
    },

    isLoading: (state): boolean => {
        return state.loading
    },

    token: (state): string | null => {
        return state.token
    },
}
