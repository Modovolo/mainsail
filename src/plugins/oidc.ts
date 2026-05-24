import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const oidcConfig = {
    authority: 'https://ghn.modovolo.com/realms/workspace',
    client_id: 'fleet',
    redirect_uri: window.location.origin + '/callback',
    silent_redirect_uri: window.location.origin + '/silent-renew',
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    automaticSilentRenew: true
}

export const userManager = new UserManager(oidcConfig)