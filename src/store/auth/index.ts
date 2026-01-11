import { Module } from 'vuex'
import { AuthState } from './types'
import { RootState } from '../types'
import { actions } from './actions'
import { mutations } from './mutations'
import { getters } from './getters'

export const getDefaultState = (): AuthState => {
    return {
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: null,
    }
}

const state = getDefaultState()

export const auth: Module<AuthState, RootState> = {
    namespaced: true,
    state,
    actions,
    mutations,
    getters,
}
