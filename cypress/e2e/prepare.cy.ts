/**
 * Prepare Page E2E Tests
 * 
 * End-to-end tests for model upload, slicing, and GCode preview workflows
 */

describe('Prepare Page', () => {
    beforeEach(() => {
        // Visit prepare page
        cy.visit('/prepare')
        // Wait for page to load
        cy.get('[data-testid="prepare-page"]', { timeout: 10000 }).should('exist')
    })

    describe('Model Upload', () => {
        it('should display upload button', () => {
            cy.get('[data-testid="import-model-btn"]').should('be.visible')
        })

        it('should accept STL file upload via button', () => {
            // Create a minimal STL file content
            const stlContent = createBinarySTL()
            const file = new File([stlContent], 'test-cube.stl', {
                type: 'application/octet-stream'
            })

            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'test-cube.stl' },
                { force: true }
            )

            // Wait for model to load
            cy.get('[data-testid="widget-list"]')
                .find('[data-testid="widget-item"]')
                .should('have.length.at.least', 1)
        })

        it('should accept drag and drop file upload', () => {
            const stlContent = createBinarySTL()

            cy.get('[data-testid="viewer-container"]').selectFile(
                { contents: stlContent, fileName: 'dropped-model.stl' },
                { action: 'drag-drop', force: true }
            )

            cy.get('[data-testid="widget-list"]')
                .find('[data-testid="widget-item"]')
                .should('have.length.at.least', 1)
        })

        it('should show error for unsupported file type', () => {
            const invalidFile = new Blob(['invalid content'], { type: 'text/plain' })

            cy.get('input[type="file"]').selectFile(
                { contents: invalidFile, fileName: 'invalid.xyz' },
                { force: true }
            )

            // Should show error toast
            cy.get('.v-toast').should('contain', 'Unsupported')
        })

        it('should display model info after upload', () => {
            const stlContent = createBinarySTL()

            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'info-test.stl' },
                { force: true }
            )

            // Model info bar should appear
            cy.get('[data-testid="model-info-bar"]', { timeout: 5000 })
                .should('be.visible')
                .and('contain', 'Triangle')
        })

        it('should handle multiple file upload', () => {
            const stl1 = createBinarySTL()
            const stl2 = createBinarySTL()

            cy.get('input[type="file"]').selectFile([
                { contents: stl1, fileName: 'model1.stl' },
                { contents: stl2, fileName: 'model2.stl' },
            ], { force: true })

            cy.get('[data-testid="widget-list"]')
                .find('[data-testid="widget-item"]')
                .should('have.length', 2)
        })
    })

    describe('Model Selection', () => {
        beforeEach(() => {
            // Upload a model first
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'select-test.stl' },
                { force: true }
            )
            cy.get('[data-testid="widget-item"]').should('exist')
        })

        it('should select model on click', () => {
            cy.get('[data-testid="widget-item"]').first().click()

            cy.get('[data-testid="widget-item"]')
                .first()
                .should('have.class', 'selected')
        })

        it('should show transform inputs when model selected', () => {
            cy.get('[data-testid="widget-item"]').first().click()

            cy.get('[data-testid="transform-inputs"]').should('be.visible')
        })

        it('should enable delete button when model selected', () => {
            cy.get('[data-testid="delete-btn"]').should('be.disabled')

            cy.get('[data-testid="widget-item"]').first().click()

            cy.get('[data-testid="delete-btn"]').should('not.be.disabled')
        })
    })

    describe('Model Transforms', () => {
        beforeEach(() => {
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'transform-test.stl' },
                { force: true }
            )
            cy.get('[data-testid="widget-item"]').first().click()
        })

        it('should move model via position inputs', () => {
            cy.get('[data-testid="pos-x-input"]')
                .clear()
                .type('100')
                .blur()

            // Position should be updated
            cy.get('[data-testid="pos-x-input"]')
                .should('have.value', '100')
        })

        it('should rotate model via rotation inputs', () => {
            cy.get('[data-testid="rot-z-input"]')
                .clear()
                .type('45')
                .blur()

            cy.get('[data-testid="rot-z-input"]')
                .should('have.value', '45')
        })

        it('should scale model via scale inputs', () => {
            cy.get('[data-testid="scale-x-input"]')
                .clear()
                .type('2')
                .blur()

            cy.get('[data-testid="scale-x-input"]')
                .should('have.value', '2')
        })

        it('should mirror model when mirror button clicked', () => {
            cy.get('[data-testid="mirror-btn"]').click()

            // Model should be mirrored (visual check would require canvas inspection)
            cy.get('[data-testid="widget-item"]').should('exist')
        })

        it('should center model on platform', () => {
            cy.get('[data-testid="center-btn"]').click()

            // Position should be updated to center
            // Exact values depend on bed size
            cy.get('[data-testid="pos-x-input"]')
                .invoke('val')
                .then(val => {
                    expect(Number(val)).to.be.greaterThan(0)
                })
        })
    })

    describe('Slicing', () => {
        beforeEach(() => {
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'slice-test.stl' },
                { force: true }
            )
            cy.get('[data-testid="widget-item"]').should('exist')
        })

        it('should enable slice button when model is loaded', () => {
            cy.get('[data-testid="slice-btn"]').should('not.be.disabled')
        })

        it('should show slice settings panel', () => {
            cy.get('[data-testid="slice-settings-toggle"]').click()

            cy.get('[data-testid="slice-settings-panel"]')
                .should('be.visible')
                .and('contain', 'Layer Height')
        })

        it('should allow changing layer height', () => {
            cy.get('[data-testid="slice-settings-toggle"]').click()

            cy.get('[data-testid="layer-height-input"]')
                .clear()
                .type('0.15')

            cy.get('[data-testid="layer-height-input"]')
                .should('have.value', '0.15')
        })

        it('should show slicing progress dialog', () => {
            cy.get('[data-testid="slice-btn"]').click()

            cy.get('[data-testid="slicing-dialog"]', { timeout: 2000 })
                .should('be.visible')
                .and('contain', 'Slicing')
        })

        it('should show slice results after completion', () => {
            cy.get('[data-testid="slice-btn"]').click()

            // Wait for slicing to complete
            cy.get('[data-testid="slice-result-dialog"]', { timeout: 60000 })
                .should('be.visible')
                .and('contain', 'Layer')
                .and('contain', 'Filament')
        })

        it('should allow downloading GCode after slicing', () => {
            cy.get('[data-testid="slice-btn"]').click()

            cy.get('[data-testid="slice-result-dialog"]', { timeout: 60000 })
                .should('be.visible')

            cy.get('[data-testid="download-gcode-btn"]')
                .should('be.visible')
                .and('not.be.disabled')
        })
    })

    describe('GCode Preview', () => {
        beforeEach(() => {
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'preview-test.stl' },
                { force: true }
            )
            cy.get('[data-testid="widget-item"]').should('exist')
            
            // Slice the model
            cy.get('[data-testid="slice-btn"]').click()
            cy.get('[data-testid="slice-result-dialog"]', { timeout: 60000 })
                .should('be.visible')
        })

        it('should navigate to preview page on preview click', () => {
            cy.get('[data-testid="preview-gcode-btn"]').click()

            cy.url().should('include', '/preview')
        })

        it('should display GCode viewer', () => {
            cy.get('[data-testid="preview-gcode-btn"]').click()

            cy.get('[data-testid="gcode-viewer"]', { timeout: 5000 })
                .should('be.visible')
        })

        it('should show layer slider', () => {
            cy.get('[data-testid="preview-gcode-btn"]').click()

            cy.get('[data-testid="layer-slider"]', { timeout: 5000 })
                .should('be.visible')
        })
    })

    describe('Platform Operations', () => {
        it('should clear platform', () => {
            // Upload model
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'clear-test.stl' },
                { force: true }
            )
            cy.get('[data-testid="widget-item"]').should('exist')

            // Clear
            cy.get('[data-testid="clear-platform-btn"]').click()

            cy.get('[data-testid="widget-item"]').should('not.exist')
        })

        it('should select all models', () => {
            // Upload multiple models
            const stl1 = createBinarySTL()
            const stl2 = createBinarySTL()
            cy.get('input[type="file"]').selectFile([
                { contents: stl1, fileName: 'all1.stl' },
                { contents: stl2, fileName: 'all2.stl' },
            ], { force: true })

            cy.get('[data-testid="widget-item"]').should('have.length', 2)

            // Select all
            cy.get('[data-testid="select-all-btn"]').click()

            cy.get('[data-testid="widget-item"].selected').should('have.length', 2)
        })

        it('should arrange models', () => {
            // Upload multiple models
            const stl1 = createBinarySTL()
            const stl2 = createBinarySTL()
            cy.get('input[type="file"]').selectFile([
                { contents: stl1, fileName: 'arrange1.stl' },
                { contents: stl2, fileName: 'arrange2.stl' },
            ], { force: true })

            cy.get('[data-testid="widget-item"]').should('have.length', 2)

            // Arrange
            cy.get('[data-testid="arrange-btn"]').click()

            // Models should still exist after arranging
            cy.get('[data-testid="widget-item"]').should('have.length', 2)
        })

        it('should duplicate selected model', () => {
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'dup-test.stl' },
                { force: true }
            )
            
            cy.get('[data-testid="widget-item"]').first().click()
            cy.get('[data-testid="duplicate-btn"]').click()

            cy.get('[data-testid="widget-item"]').should('have.length', 2)
        })

        it('should delete selected model', () => {
            const stlContent = createBinarySTL()
            cy.get('input[type="file"]').selectFile(
                { contents: stlContent, fileName: 'del-test.stl' },
                { force: true }
            )
            
            cy.get('[data-testid="widget-item"]').first().click()
            cy.get('[data-testid="delete-btn"]').click()

            cy.get('[data-testid="widget-item"]').should('not.exist')
        })
    })

    describe('View Controls', () => {
        it('should change view mode to wireframe', () => {
            cy.get('[data-testid="view-mode-select"]').click()
            cy.get('[data-testid="view-mode-wireframe"]').click()

            cy.get('[data-testid="view-mode-select"]')
                .should('contain', 'Wireframe')
        })

        it('should change view mode to xray', () => {
            cy.get('[data-testid="view-mode-select"]').click()
            cy.get('[data-testid="view-mode-xray"]').click()

            cy.get('[data-testid="view-mode-select"]')
                .should('contain', 'X-Ray')
        })

        it('should reset camera view', () => {
            cy.get('[data-testid="reset-camera-btn"]').click()

            // Camera should be reset (no error)
            cy.get('[data-testid="viewer-container"]').should('be.visible')
        })

        it('should show grid toggle', () => {
            cy.get('[data-testid="grid-toggle"]').should('exist')
        })
    })
})

// Helper to create minimal binary STL
function createBinarySTL(): Uint8Array {
    // Simple cube STL
    const triangles = 12
    const headerSize = 80
    const triangleSize = 50
    const totalSize = headerSize + 4 + triangles * triangleSize

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)

    // Write triangle count at offset 80
    view.setUint32(80, triangles, true)

    // Write triangles (simplified - just enough to be valid)
    const cubeData = [
        // Front face
        { n: [0, 0, 1], v: [[0, 0, 10], [10, 0, 10], [10, 10, 10]] },
        { n: [0, 0, 1], v: [[0, 0, 10], [10, 10, 10], [0, 10, 10]] },
        // Back face
        { n: [0, 0, -1], v: [[10, 0, 0], [0, 0, 0], [0, 10, 0]] },
        { n: [0, 0, -1], v: [[10, 0, 0], [0, 10, 0], [10, 10, 0]] },
        // Top face
        { n: [0, 1, 0], v: [[0, 10, 0], [0, 10, 10], [10, 10, 10]] },
        { n: [0, 1, 0], v: [[0, 10, 0], [10, 10, 10], [10, 10, 0]] },
        // Bottom face
        { n: [0, -1, 0], v: [[0, 0, 10], [0, 0, 0], [10, 0, 0]] },
        { n: [0, -1, 0], v: [[0, 0, 10], [10, 0, 0], [10, 0, 10]] },
        // Right face
        { n: [1, 0, 0], v: [[10, 0, 0], [10, 10, 0], [10, 10, 10]] },
        { n: [1, 0, 0], v: [[10, 0, 0], [10, 10, 10], [10, 0, 10]] },
        // Left face
        { n: [-1, 0, 0], v: [[0, 0, 10], [0, 10, 10], [0, 10, 0]] },
        { n: [-1, 0, 0], v: [[0, 0, 10], [0, 10, 0], [0, 0, 0]] },
    ]

    let offset = 84
    for (let i = 0; i < triangles; i++) {
        const tri = cubeData[i]
        
        // Normal
        view.setFloat32(offset, tri.n[0], true); offset += 4
        view.setFloat32(offset, tri.n[1], true); offset += 4
        view.setFloat32(offset, tri.n[2], true); offset += 4
        
        // Vertices
        for (const v of tri.v) {
            view.setFloat32(offset, v[0], true); offset += 4
            view.setFloat32(offset, v[1], true); offset += 4
            view.setFloat32(offset, v[2], true); offset += 4
        }
        
        // Attribute byte count
        view.setUint16(offset, 0, true); offset += 2
    }

    return new Uint8Array(buffer)
}
