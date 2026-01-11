import VueRouter from 'vue-router'
import Vue from 'vue'
import routes from '@/routes'
import store from '@/store'

Vue.use(VueRouter)
const router = new VueRouter({
    base: import.meta.env.BASE_URL,
    mode: 'history',
    routes,
})

// Navigation guard for authentication
router.beforeEach(async (to, from, next) => {
    const requiresAuth = to.matched.some(record => record.meta?.requiresAuth !== false)
    const isPublic = to.matched.some(record => record.meta?.isPublic === true)
    const isAuthenticated = store.getters['auth/isAuthenticated']

    // If route is public (like login), allow access
    if (isPublic) {
        // If already authenticated and trying to access login, redirect to dashboard
        if (to.path === '/login' && isAuthenticated) {
            return next('/')
        }
        return next()
    }

    // If authentication is required
    if (requiresAuth) {
        // Check if we have a stored token and validate it
        if (!isAuthenticated) {
            const hasToken = localStorage.getItem('fleet_token')
            if (hasToken) {
                // Try to validate the existing token
                const valid = await store.dispatch('auth/checkAuth')
                if (valid) {
                    return next()
                }
            }
            // Redirect to login with return URL
            return next({
                path: '/login',
                query: { redirect: to.fullPath }
            })
        }
    }

    next()
})

export default router
