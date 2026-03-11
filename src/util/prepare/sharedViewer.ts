import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { Platform } from '@/util/mesh'

export interface SharedPrepareViewerState {
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    platform: Platform | null
}

let sharedState: SharedPrepareViewerState | null = null

export function setSharedPrepareViewerState(state: SharedPrepareViewerState): void {
    sharedState = state
}

export function getSharedPrepareViewerState(): SharedPrepareViewerState | null {
    return sharedState
}

export function takeSharedPrepareViewerState(): SharedPrepareViewerState | null {
    const state = sharedState
    sharedState = null
    return state
}

export function clearSharedPrepareViewerState(): void {
    sharedState = null
}
