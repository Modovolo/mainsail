export interface AuthUser {
    id: string
    username: string
    email?: string
    role: 'admin' | 'designer' | 'user' | 'viewer'
    createdAt?: string
    lastLogin?: string
}

export interface AuthState {
    token: string | null
    user: AuthUser | null
    isAuthenticated: boolean
    error: string | null
}
