import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSigninCallback, mockGetUser, mockClearStaleState } = vi.hoisted(() => ({
    mockSigninCallback: vi.fn(),
    mockGetUser: vi.fn(),
    mockClearStaleState: vi.fn(),
}))

vi.mock('@/plugins/oidc', () => ({
    userManager: {
        signinCallback: mockSigninCallback,
        getUser: mockGetUser,
        clearStaleState: mockClearStaleState,
    },
}))

import Callback from '@/pages/Callback.vue'

function getMountedHook() {
    const hooks = (Callback as any)?.options?.mounted
    const hook = Array.isArray(hooks) ? hooks[0] : hooks
    expect(typeof hook).toBe('function')
    return hook
}

function createVm() {
    return {
        $store: {
            dispatch: vi.fn(),
        },
        $router: {
            replace: vi.fn(),
        },
        $toast: {
            info: vi.fn(),
            error: vi.fn(),
        },
    }
}

describe('OIDC callback flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.history.replaceState({}, '', '/callback')
    })

    it('completes callback and logs in when state/code params are present', async () => {
        const vm: any = createVm()
        const hook = getMountedHook()
        const oidcUser = { access_token: 'token-123', expired: false }

        window.history.replaceState({}, '', '/callback?state=s1&code=c1')
        mockSigninCallback.mockResolvedValueOnce(oidcUser)

        await hook.call(vm)

        expect(mockSigninCallback).toHaveBeenCalledTimes(1)
        expect(vm.$store.dispatch).toHaveBeenCalledWith('auth/keycloakLogin', oidcUser)
        expect(vm.$router.replace).toHaveBeenCalledWith('/')
    })

    it('reuses an existing user session when callback params are missing', async () => {
        const vm: any = createVm()
        const hook = getMountedHook()
        const existingUser = { access_token: 'token-abc', expired: false }

        mockGetUser.mockResolvedValueOnce(existingUser)

        await hook.call(vm)

        expect(mockSigninCallback).not.toHaveBeenCalled()
        expect(vm.$store.dispatch).toHaveBeenCalledWith('auth/keycloakLogin', existingUser)
        expect(vm.$router.replace).toHaveBeenCalledWith('/')
    })

    it('redirects to login when callback params are missing and no session exists', async () => {
        const vm: any = createVm()
        const hook = getMountedHook()

        mockGetUser.mockResolvedValueOnce(null)

        await hook.call(vm)

        expect(vm.$store.dispatch).not.toHaveBeenCalled()
        expect(vm.$router.replace).toHaveBeenCalledWith('/login')
    })

    it('recovers from missing state by clearing stale state and using existing session', async () => {
        const vm: any = createVm()
        const hook = getMountedHook()
        const existingUser = { access_token: 'token-def', expired: false }

        window.history.replaceState({}, '', '/callback?state=s1&code=c1')
        mockSigninCallback.mockRejectedValueOnce(new Error('No matching state found in storage'))
        mockGetUser.mockResolvedValueOnce(existingUser)

        await hook.call(vm)

        expect(mockClearStaleState).toHaveBeenCalledTimes(1)
        expect(vm.$store.dispatch).toHaveBeenCalledWith('auth/keycloakLogin', existingUser)
        expect(vm.$router.replace).toHaveBeenCalledWith('/')
    })

    it('redirects to login with info toast when missing state cannot be recovered', async () => {
        const vm: any = createVm()
        const hook = getMountedHook()

        window.history.replaceState({}, '', '/callback?state=s1&code=c1')
        mockSigninCallback.mockRejectedValueOnce(new Error('No matching state found in storage'))
        mockGetUser.mockResolvedValueOnce(null)

        await hook.call(vm)

        expect(mockClearStaleState).toHaveBeenCalledTimes(1)
        expect(vm.$toast.info).toHaveBeenCalled()
        expect(vm.$router.replace).toHaveBeenCalledWith('/login')
    })
})
