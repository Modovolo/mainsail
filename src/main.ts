import 'regenerator-runtime' // async polyfill used by the gcodeviewer
import 'resize-observer-polyfill' // polyfill needed by the responsive class detection
import Vue from 'vue'
import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import i18n, { setAndLoadLocale } from '@/plugins/i18n'
import store from '@/store'
import router from '@/plugins/router'
import { WebSocketPlugin } from '@/plugins/webSocketClient'
// vue-observe-visibility
import { ObserveVisibility } from 'vue-observe-visibility'
//vue-meta
import VueMeta from 'vue-meta'
//vue-load-image
import VueLoadImage from 'vue-load-image'
//vue-toast-notifications
import VueToast from 'vue-toast-notification'
import 'vue-toast-notification/dist/theme-sugar.css'
//overlayerscrollbars-vue
import { OverlayScrollbarsPlugin } from 'overlayscrollbars-vue'
import 'overlayscrollbars/css/OverlayScrollbars.css'
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
// Directives
import './directives/longpress'
import './directives/responsive-class'

// Echarts
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'

// import ECharts modules manually to reduce bundle size
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { DatasetComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
// vue-resize
import 'vue-resize/dist/vue-resize.css'
// @ts-ignore
import VueResize from 'vue-resize'
import { defaultMode } from './store/variables'

Vue.config.productionTip = false

Vue.directive('observe-visibility', ObserveVisibility)

Vue.use(VueMeta)

Vue.component('VueLoadImage', VueLoadImage)

Vue.use(VueToast, {
    duration: 3000,
})

const isSafari = navigator.userAgent.includes('Safari') && navigator.userAgent.search('Chrome') === -1
const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints > 0 && navigator.maxTouchPoints !== 256)
Vue.use(OverlayScrollbarsPlugin, {
    className: 'os-theme-light',
    scrollbars: {
        visibility: 'auto',
        autoHide: isSafari && isTouch ? 'scroll' : 'move',
    },
})

use([SVGRenderer, LineChart, BarChart, LegendComponent, PieChart, DatasetComponent, GridComponent, TooltipComponent])
Vue.component('EChart', ECharts)

Vue.use(VueResize)

function normalizeToken(token: string | null | undefined): string {
    return (token ?? '').replace(/^Bearer\s+/i, '').trim()
}

function setupAxiosAuthInterceptors() {
    let refreshPromise: Promise<boolean> | null = null

    axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const currentToken = normalizeToken(
            (store.getters['auth/token'] as string | null | undefined) ?? localStorage.getItem('fleet_token')
        )

        if (currentToken) {
            config.headers = config.headers ?? {}
            if (!config.headers.Authorization) {
                config.headers.Authorization = `Bearer ${currentToken}`
            }
        }

        return config
    })

    axios.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
            const status = error.response?.status
            const url = originalRequest?.url ?? ''

            if (
                !originalRequest ||
                status !== 401 ||
                originalRequest._retry ||
                url.includes('/api/auth/login') ||
                url.includes('/api/auth/register') ||
                url.includes('/api/auth/refresh') ||
                url.includes('/api/auth/logout')
            ) {
                return Promise.reject(error)
            }

            originalRequest._retry = true

            if (!refreshPromise) {
                refreshPromise = store
                    .dispatch('auth/refreshToken')
                    .then((result) => Boolean(result))
                    .catch(() => false)
                    .finally(() => {
                        refreshPromise = null
                    })
            }

            const refreshed = await refreshPromise
            if (!refreshed) {
                return Promise.reject(error)
            }

            const nextToken = normalizeToken(
                (store.getters['auth/token'] as string | null | undefined) ?? localStorage.getItem('fleet_token')
            )

            if (nextToken) {
                originalRequest.headers = originalRequest.headers ?? {}
                originalRequest.headers.Authorization = `Bearer ${nextToken}`
            }

            return axios(originalRequest)
        }
    )
}

setupAxiosAuthInterceptors()

const initLoad = async () => {
    try {
        // get base url. by default, it is '/'
        const base = import.meta.env.BASE_URL ?? '/'

        //load config.json
        const res = await fetch(`${base}config.json`)
        const file = (await res.json()) as Record<string, unknown>

        window.console.debug('Loaded config.json')

        await store.dispatch('importConfigJson', file)
        const locale = (file.defaultLocale ?? 'en') as string
        await setAndLoadLocale(locale)

        // For fleet mode, skip remote printer initialization (printers come from fleet-manager API)
        // For other non-moonraker modes, initialize from localStorage
        if (store.state.instancesDB === 'fleet') {
            store.commit('socket/setConnected')
            await store.dispatch('socket/removeInitComponent', 'server')
            // Clear any stale printer data from localStorage
            localStorage.removeItem('printers')
            // Reset remote printers store to prevent stale connections
            await store.dispatch('gui/remoteprinters/reset')
            // Don't load printers - they come from fleet-manager API
        } else if (store.state.instancesDB !== 'moonraker') {
            store.commit('socket/setConnected')
            await store.dispatch('socket/removeInitComponent', 'server')
            await store.dispatch('gui/remoteprinters/initFromLocalstorage')
        }

        // Handle mode outside store init and before vue mount for consistency in dialog
        const mode = file.defaultMode ?? defaultMode
        vuetify.framework.theme.dark = mode !== 'light'
    } catch (e) {
        window.console.error('Failed to load config.json')
        window.console.error(e)
    }

    const url = store.getters['socket/getWebsocketUrl']
    Vue.use(WebSocketPlugin, { url, store })
    // In fleet mode, socket connection is deferred until a printer is selected
    // In moonraker mode, connect immediately
    if (store?.state?.instancesDB === 'moonraker') Vue.$socket.connect()
}

initLoad().then(() =>
    new Vue({
        vuetify,
        router,
        store,
        i18n,
        render: (h) => h(App),
    }).$mount('#app')
)
