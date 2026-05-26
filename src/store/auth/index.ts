import { Module } from 'vuex'
import { AuthState } from './types'
import { RootState } from '../types'
import { actions } from './actions'
import { mutations } from './mutations'
import { getters } from './getters'

export const getDefaultState = (): AuthState => {
    return {
        token: null,
        user: null,
        isAuthenticated: false,
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
