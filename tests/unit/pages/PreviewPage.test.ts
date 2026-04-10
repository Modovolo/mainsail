import { describe, it, expect, vi, beforeEach } from 'vitest'
import PreviewPage from '@/pages/PreviewPage.vue'

vi.mock('three/examples/jsm/controls/OrbitControls', () => ({
    OrbitControls: vi.fn(),
}))

function createVm() {
    const vm: any = {
        $store: {
            commit: vi.fn(),
            state: {
                prepare: {},
            },
        },
        $route: {
            path: '/preview',
            name: 'preview',
        },
        controls: {
            removeEventListener: vi.fn(),
            dispose: vi.fn(),
        },
        renderer: {
            dispose: vi.fn(),
        },
        modelOutlineMesh: null,
        scene: null,
        onResize: vi.fn(),
        onControlsChange: vi.fn(),
        activeBuildToken: 0,
        removeModelOutline: vi.fn(),
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

    it('disposes renderer and controls on destroy', () => {
        const vm = createVm()

        runBeforeDestroy(vm)

        expect(vm.renderer.dispose).toHaveBeenCalled()
        expect(vm.controls.dispose).toHaveBeenCalled()
        expect(vm.removeModelOutline).toHaveBeenCalled()
    })

    it('increments build token to cancel in-flight builds', () => {
        const vm = createVm()
        vm.activeBuildToken = 5

        runBeforeDestroy(vm)

        expect(vm.activeBuildToken).toBe(6)
    })
})
