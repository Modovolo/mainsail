export interface AuthUser {
    id: string
    username: string
    email?: string
    role: 'admin' | 'user' | 'viewer'
    createdAt?: string
    lastLogin?: string
}

export interface AuthState {
    token: string | null
    refreshToken: string | null
    user: AuthUser | null
    isAuthenticated: boolean
    loading: boolean
    error: string | null
}
