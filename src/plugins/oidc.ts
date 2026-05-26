import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const oidcConfig = {
    authority: 'https://ghn.modovolo.com/realms/workspace',
    client_id: 'fleet',
    redirect_uri: window.location.origin + '/callback',
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    automaticSilentRenew: true,
    // Keycloak sets frame-ancestors 'self' in its CSP, blocking iframe-based
    // silent renew. Disable both iframe mechanisms; automaticSilentRenew will
    // use the refresh_token grant instead (works fine with PKCE code flow).
    monitorSession: false,
}

export const userManager = new UserManager(oidcConfig)