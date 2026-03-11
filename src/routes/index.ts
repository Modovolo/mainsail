import Dashboard from '../pages/Dashboard.vue'
import FleetDashboard from '../pages/FleetDashboard.vue'
import Webcam from '../pages/Webcam.vue'
import Farm from '../pages/Farm.vue'
import Console from '../pages/Console.vue'
import Files from '../pages/Files.vue'
import History from '../pages/History.vue'
import Timelapse from '../pages/Timelapse.vue'
import Machine from '../pages/Machine.vue'
import Login from '../pages/Login.vue'
import MyPrinters from '../pages/MyPrinters.vue'
import CentralFiles from '../pages/CentralFiles.vue'
import ConfigSync from '../pages/ConfigSync.vue'
import PrintQueue from '../pages/PrintQueue.vue'
import Settings from '../pages/Settings.vue'
import SlicingPage from '../pages/SlicingPage.vue'
import MonitoringPage from '../pages/MonitoringPage.vue'
import { AsyncComponent, Component } from 'vue'

import {
    mdiChartAreaspline,
    mdiMonitorDashboard,
    mdiViewDashboard,
    mdiWebcam,
    mdiConsoleLine,
    mdiGrid,
    mdiFileDocumentMultipleOutline,
    mdiFolderNetwork,
    mdiPlaylistPlay,
    mdiCog,
    mdiCogSync,
    mdiVideo3d,
    mdiHistory,
    mdiTimelapse,
    mdiWrench,
    mdiLogin,
    mdiPrinter3d,
    mdiPrinter3dNozzle,
} from '@mdi/js'

const routes: AppRoute[] = [
    {
        name: 'login',
        title: 'Login',
        path: '/login',
        icon: mdiLogin,
        component: Login,
        alwaysShow: true,
        showInNavi: false,
        meta: { requiresAuth: false, isPublic: true },
    },
    {
        name: 'slicing',
        title: 'Slicing',
        path: '/slicing',
        icon: mdiPrinter3dNozzle,
        component: SlicingPage,
        alwaysShow: true,
        showInNavi: true,
        position: 15,
        meta: { requiresAuth: true },
    },
    {
        title: null,
        path: '/preview',
        redirect: '/slicing?mode=preview',
        component: null,
        alwaysShow: false,
        showInNavi: false,
        meta: { requiresAuth: true },
    },
    {
        title: null,
        path: '/prepare',
        redirect: '/slicing?mode=prepare',
        component: null,
        alwaysShow: false,
        showInNavi: false,
        meta: { requiresAuth: true },
    },
    {
        name: 'monitoring',
        title: 'Monitoring',
        path: '/monitoring',
        icon: mdiMonitorDashboard,
        component: MonitoringPage,
        alwaysShow: true,
        showInNavi: false,
        meta: { requiresAuth: true },
    },
    {
        name: 'fleet-dashboard',
        title: 'Fleet Dashboard',
        path: '/',
        icon: mdiViewDashboard,
        component: FleetDashboard,
        alwaysShow: true,
        showInNavi: true,
        position: 1,
        meta: { requiresAuth: true },
    },
    {
        name: 'my-printers',
        title: 'My Printers',
        path: '/my-printers',
        icon: mdiPrinter3d,
        component: MyPrinters,
        alwaysShow: true,
        showInNavi: false,
        position: 5,
        meta: { requiresAuth: true },
    },
    {
        name: 'register-printer',
        title: 'Register Printer',
        path: '/register-printer',
        icon: mdiPrinter3dNozzle,
        component: () => import('../pages/RegisterPrinter.vue'),
        alwaysShow: true,
        showInNavi: true,
        position: 6,
        meta: { requiresAuth: true },
    },
    {
        name: 'settings',
        title: 'Settings',
        path: '/settings',
        icon: mdiCog,
        component: Settings,
        alwaysShow: true,
        showInNavi: false,
        position: 7,
        meta: { requiresAuth: true },
    },
    {
        name: 'central-files',
        title: 'Central File Repository',
        path: '/central-files',
        icon: mdiFolderNetwork,
        component: CentralFiles,
        alwaysShow: true,
        showInNavi: true,
        position: 8,
        meta: { requiresAuth: true },
    },
    {
        name: 'print-queue',
        title: 'Print Queue',
        path: '/print-queue',
        icon: mdiPlaylistPlay,
        component: PrintQueue,
        alwaysShow: true,
        showInNavi: true,
        position: 9,
        meta: { requiresAuth: true },
    },
    {
        name: 'config-sync',
        title: 'Config Sync',
        path: '/config-sync',
        icon: mdiCogSync,
        component: ConfigSync,
        alwaysShow: true,
        showInNavi: true,
        position: 9.5,
        meta: { requiresAuth: true },
    },
    {
        name: 'dashboard',
        title: 'Printer Dashboard',
        path: '/printer/:id?',
        icon: mdiMonitorDashboard,
        component: Dashboard,
        alwaysShow: false,
        showInNavi: false,
        position: 10,
        meta: { requiresAuth: true },
    },
    {
        name: 'farm',
        title: 'All Printers',
        path: '/allPrinters',
        icon: mdiPrinter3d,
        component: Farm,
        alwaysShow: true,
        showInNavi: true,
        position: 10,
        meta: { requiresAuth: true },
    },
    {
        name: 'webcam',
        title: 'Webcam',
        path: '/cam',
        icon: mdiWebcam,
        component: Webcam,
        alwaysShow: true,
        showInNavi: true,
        position: 20,
        fullscreen: true,
        meta: { requiresAuth: true },
    },
    {
        name: 'console',
        title: 'Console',
        path: '/console',
        icon: mdiConsoleLine,
        component: Console,
        alwaysShow: true,
        showInNavi: true,
        klipperIsConnected: true,
        position: 30,
        meta: { requiresAuth: true },
    },
    {
        name: 'heightmap',
        title: 'Heightmap',
        path: '/heightmap',
        icon: mdiGrid,
        component: () => import('../pages/Heightmap.vue'),
        alwaysShow: false,
        showInNavi: true,
        klipperComponent: 'bed_mesh',
        position: 40,
        meta: { requiresAuth: true },
    },
    {
        name: 'gcodefiles',
        title: 'G-Code Files',
        path: '/files',
        icon: mdiFileDocumentMultipleOutline,
        component: Files,
        alwaysShow: true,
        showInNavi: true,
        position: 50,
        fullscreen: true,
        meta: { requiresAuth: true },
    },
    {
        name: 'gcodeviewer',
        title: 'G-Code Viewer',
        path: '/viewer',
        icon: mdiVideo3d,
        component: () => import('../pages/Viewer.vue'),
        alwaysShow: true,
        showInNavi: true,
        position: 60,
        fullscreen: true,
        meta: { requiresAuth: true },
    },
    {
        name: 'history',
        title: 'History',
        path: '/history',
        icon: mdiHistory,
        component: History,
        alwaysShow: true,
        showInNavi: true,
        moonrakerComponent: 'history',
        position: 70,
        meta: { requiresAuth: true },
    },
    {
        name: 'charts',
        title: 'Charts',
        path: '/charts',
        icon: mdiChartAreaspline,
        component: History,
        alwaysShow: true,
        showInNavi: true,
        moonrakerComponent: 'history',
        position: 71,
        meta: { requiresAuth: true },
    },
    {
        name: 'timelapse',
        title: 'Timelapse',
        path: '/timelapse',
        icon: mdiTimelapse,
        component: Timelapse,
        alwaysShow: true,
        showInNavi: true,
        moonrakerComponent: 'timelapse',
        position: 80,
        meta: { requiresAuth: true },
    },
    {
        name: 'machine',
        title: 'Machine',
        path: '/config',
        icon: mdiWrench,
        component: Machine,
        alwaysShow: true,
        showInNavi: true,
        position: 90,
        meta: { requiresAuth: true },
    },
    {
        title: null,
        component: null,
        alwaysShow: false,
        showInNavi: false,
        path: '/settings/machine',
        redirect: '/config',
    },
]

export default routes

export interface AppRoute {
    name?: string
    title: string | null
    path: string
    redirect?: string
    icon?: string
    component: Component | AsyncComponent | null
    alwaysShow: boolean
    showInNavi: boolean
    registeredDirectory?: string
    moonrakerComponent?: string
    klipperComponent?: string
    klipperIsConnected?: boolean
    children?: AppRoute[]
    position?: number
    fullscreen?: boolean
    meta?: {
        requiresAuth?: boolean
        isPublic?: boolean
        roles?: string[]
    }
}
