describe('Prepare Page Routing', () => {
    beforeEach(() => {
        cy.clearLocalStorage()
    })

    it('redirects unauthenticated users to login when opening /prepare', () => {
        cy.visit('/prepare')

        cy.location('pathname').should('eq', '/login')
        cy.location('search').should('contain', 'redirect=')
        cy.location('search').then((search) => {
            const redirect = new URLSearchParams(search).get('redirect') || ''
            const decoded = decodeURIComponent(redirect)

            expect(decoded).to.satisfy((value: string) => {
                return value === '/prepare' || value.startsWith('/slicing?mode=prepare')
            })
        })

        cy.contains('Login with Keycloak').should('be.visible')
    })
})
