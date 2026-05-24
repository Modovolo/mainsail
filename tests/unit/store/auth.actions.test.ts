import { beforeEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'

const { mockGetUser, mockSigninSilent, mockRemoveUser } = vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockSigninSilent: vi.fn(),
    mockRemoveUser: vi.fn(),
}))

vi.mock('@/plugins/oidc', () => ({
    userManager: {
        getUser: mockGetUser,
        signinSilent: mockSigninSilent,
        removeUser: mockRemoveUser,
    },
}))

vi.mock('axios', () => {
    const axios = {
        get: vi.fn(),
        post: vi.fn(),
        defaults: {
            headers: {
                common: {} as Record<string, string>,
            },
        },
    }

    return {
        default: axios,
    }
})

import axios from 'axios'
import { actions } from '@/store/auth/actions'

function toBase64Url(value: string): string {
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createJwtWithExp(exp: number): string {
    const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = toBase64Url(JSON.stringify({ exp }))
    return `${header}.${payload}.sig`
}

function createError(status: number) {
    return {
        response: {
            status,
        },
    }
}

describe('auth actions login reliability', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        ;(axios as any).defaults.headers.common = {}
        ;(Vue as any).$toast = {
            success: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
        }
    })

    it('keycloakLogin falls back to OIDC profile when backend user lookup times out', async () => {
        const commit = vi.fn()
        const dispatch = vi.fn()
        const oidcUser: any = {
            access_token: 'Bearer token-123',
            profile: {
                sub: 'user-1',
                preferred_username: 'joe',
                email: 'joe@example.com',
            },
            expired: false,
        }

        ;(axios as any).get.mockRejectedValueOnce(new Error('timeout'))

        const ok = await actions.keycloakLogin({ commit, dispatch } as any, oidcUser)

        expect(ok).toBe(true)
        expect((axios as any).get).toHaveBeenCalledWith('/api/auth/me', { timeout: 5000 })
        expect(commit).toHaveBeenCalledWith('setToken', 'token-123')
        expect(commit).toHaveBeenCalledWith('setAuthenticated', true)
        expect(commit).toHaveBeenCalledWith(
            'setUser',
            expect.objectContaining({
                id: 'user-1',
                username: 'joe',
                email: 'joe@example.com',
            })
        )
        expect(localStorage.getItem('fleet_token')).toBe('token-123')
    })

    it('keycloakLogin refreshes when provided an already expired JWT', async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockResolvedValue(true)
        const staleJwt = createJwtWithExp(Math.floor(Date.now() / 1000) - 300)
        const refreshedUser: any = {
            access_token: 'token-fresh',
            expired: false,
            profile: {
                sub: 'user-fresh',
                preferred_username: 'fresh',
                email: 'fresh@example.com',
            },
        }

        mockGetUser.mockResolvedValueOnce(refreshedUser)
        ;(axios as any).get.mockResolvedValueOnce({
            data: {
                user: {
                    id: 'user-fresh',
                    username: 'fresh',
                },
            },
        })

        const ok = await actions.keycloakLogin(
            { commit, dispatch } as any,
            {
                access_token: staleJwt,
                expired: false,
                profile: {
                    sub: 'user-stale',
                    preferred_username: 'stale',
                },
            }
        )

        expect(ok).toBe(true)
        expect(dispatch).toHaveBeenCalledWith('refreshToken')
        expect(commit).toHaveBeenCalledWith('setToken', 'token-fresh')
        expect(localStorage.getItem('fleet_token')).toBe('token-fresh')
    })

    it('checkAuth returns false instead of throwing when backend still returns 401 after refresh', async () => {
        const commit = vi.fn()
        const dispatch = vi.fn().mockResolvedValue(true)
        const oidcUser: any = {
            access_token: 'token-abc',
            expired: false,
            profile: {
                sub: 'user-2',
                preferred_username: 'sam',
                email: 'sam@example.com',
            },
        }

        mockGetUser.mockResolvedValue(oidcUser)
        ;(axios as any).get
            .mockRejectedValueOnce(createError(401))
            .mockRejectedValueOnce(createError(401))

        const result = await actions.checkAuth({ commit, dispatch } as any)

        expect(result).toBe(false)
        expect(dispatch).toHaveBeenCalledWith('refreshToken')
        expect((axios as any).get).toHaveBeenNthCalledWith(1, '/api/auth/me')
        expect((axios as any).get).toHaveBeenNthCalledWith(2, '/api/auth/me', { timeout: 5000 })
    })
})
