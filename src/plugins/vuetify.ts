import Vue from 'vue'
import Vuetify from 'vuetify'
import { Touch, Ripple } from 'vuetify/lib/directives'

Vue.use(Vuetify, {
    directives: { Touch, Ripple },
})

export default new Vuetify({
    theme: {
        dark: true,
        themes: {
            dark: {
                primary: '#0000FF',    // Electric blue
                secondary: '#FF9800',  // Orange (matches ConfigSync orange actions)
                accent: '#0000FF',     // Electric blue
                error: '#F44336',
                warning: '#FF9800',
                info: '#0000FF',
                success: '#8BC34A',
                background: '#000000', // Black
            },
        },
        options: { customProperties: true },
    },
    icons: {
        iconfont: 'mdiSvg',
    },
    breakpoint: {
        mobileBreakpoint: 768,
    },
})
