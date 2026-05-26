import { GetterTree } from 'vuex'
import { AuthState } from './types'
import { RootState } from '../types'

export const getters: GetterTree<AuthState, RootState> = {
    isAuthenticated: (state): boolean => state.isAuthenticated && !!state.token,

    currentUser: (state) => state.user,

    username: (state): string => state.user?.username || '',

    userRole: (state): string => state.user?.role || 'user',

    isAdmin: (state): boolean => state.user?.role === 'admin',

    authError: (state): string | null => state.error,

    token: (state): string | null => state.token,
}
