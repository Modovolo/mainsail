import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const oidcConfig = {
    authority: 'https://ghn.modovolo.com/realms/workspace',
    client_id: 'flight-data-platform', // Reuse the same Keycloak client for now as tested in flight-data-platform
    redirect_uri: window.location.origin + '/callback',
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    automaticSilentRenew: true
}

export const userManager = new UserManager(oidcConfig)