describe('Dashboard', () => {
    beforeEach(() => {
        cy.clearLocalStorage()
    })

    it('redirects unauthenticated users to login', () => {
        cy.visit('/')

        cy.location('pathname').should('eq', '/login')
        cy.location('search').should('contain', 'redirect=%2F')
        cy.contains('Login with Keycloak').should('be.visible')
    })
})
