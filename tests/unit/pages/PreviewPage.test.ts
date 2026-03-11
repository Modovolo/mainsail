import { describe, it, expect, vi, beforeEach } from 'vitest'
import PreviewPage from '@/pages/PreviewPage.vue'
import { clearSharedPrepareViewerState } from '@/util/prepare/sharedViewer'

vi.mock('three/examples/jsm/controls/OrbitControls', () => ({
    OrbitControls: vi.fn(),
}))

vi.mock('@/util/prepare/sharedViewer', () => ({
    takeSharedPrepareViewerState: vi.fn(() => null),
    clearSharedPrepareViewerState: vi.fn(),
}))

function createVm(route: { path?: string; name?: string } = {}) {
    const vm: any = {
        $store: {
        commit: vi.fn(),
        state: {
            prepare: {},
        },
    },
        $route: {
        path: route.path ?? '/preview',
        name: route.name ?? 'preview',
    },
        controls: {
        removeEventListener: vi.fn(),
        dispose: vi.fn(),
    },
        renderer: {
        dispose: vi.fn(),
    },
        hiddenModelMeshes: [{ visible: false }, { visible: false }],
        onResize: vi.fn(),
        onControlsChange: vi.fn(),
        activeBuildToken: 0,
    }

    return vm
}

function runBeforeDestroy(vm: any) {
    const hooks = (PreviewPage as any)?.options?.beforeDestroy
    const hook = Array.isArray(hooks) ? hooks[0] : hooks
    expect(typeof hook).toBe('function')
    hook.call(vm)
}

describe('PreviewPage state teardown', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('does not reset prepare store when destroying on /prepare', () => {
        const vm = createVm({ path: '/prepare', name: 'prepare' })

        runBeforeDestroy(vm)

        expect(clearSharedPrepareViewerState).toHaveBeenCalledTimes(1)
        expect(vm.$store.commit).not.toHaveBeenCalledWith('prepare/reset')
    })

    it('resets prepare store when destroying away from /prepare', () => {
        const vm = createVm({ path: '/monitoring', name: 'monitoring' })

        runBeforeDestroy(vm)

        expect(clearSharedPrepareViewerState).toHaveBeenCalledTimes(1)
        expect(vm.$store.commit).toHaveBeenCalledWith('prepare/reset')
    })
})
