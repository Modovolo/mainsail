import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ConfigSync from '@/pages/ConfigSync.vue'

describe('ConfigSync loadPrinterConfigFiles', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('tries idex filename aliases before falling back to printer.cfg', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Printer not found' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Printer not found' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Printer not found' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Printer not found' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    files: [
                        { path: 'printer.cfg', content: 'abc', content_hash: 'hash-a' },
                    ],
                }),
            })

        vi.stubGlobal('fetch', fetchMock)

        const vm: any = new (ConfigSync as any)()
        vm.$store = {
            getters: {
                'auth/token': 'token-123',
            },
            dispatch: vi.fn(),
        }
        vm.$router = { push: vi.fn() }
        vm.$route = { fullPath: '/config-sync' }
        vm.showError = vi.fn()
        vm.getConfigFetchDebugMessage = vi.fn().mockResolvedValue('debug message')
        vm.printerStatuses = [
            {
                printerId: 'printer-1',
                printerName: 'Printer 1',
                isOnline: true,
                templates: [],
                configFiles: [],
                configFilesError: undefined,
                configFilesLoading: false,
                configFilesLoaded: false,
                configFileEntries: [],
                migrationPendingVerification: false,
            },
        ]

        await vm.loadPrinterConfigFiles('printer-1')

        expect(fetchMock).toHaveBeenCalledTimes(5)

        const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(firstCallBody.filenames).toEqual(['printer.cfg', 'mainsail-idex.cfg'])
        expect(firstCallBody.includeDependencies).toBe(true)

        const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body)
        expect(secondCallBody.filenames).toEqual(['printer.cfg', 'mainsail_idex.cfg'])
        expect(secondCallBody.includeDependencies).toBe(true)

        const thirdCallBody = JSON.parse(fetchMock.mock.calls[2][1].body)
        expect(thirdCallBody.filenames).toEqual(['printer.cfg', 'mainsaild_idex.cfg'])
        expect(thirdCallBody.includeDependencies).toBe(true)

        const fourthCallBody = JSON.parse(fetchMock.mock.calls[3][1].body)
        expect(fourthCallBody.filenames).toEqual(['printer.cfg', 'mainsaild-idex.cfg'])
        expect(fourthCallBody.includeDependencies).toBe(true)

        const fifthCallBody = JSON.parse(fetchMock.mock.calls[4][1].body)
        expect(fifthCallBody.filenames).toEqual(['printer.cfg'])
        expect(fifthCallBody.includeDependencies).toBe(true)

        const updatedPrinter = vm.printerStatuses[0]
        expect(updatedPrinter.configFiles).toEqual(['printer.cfg'])
        expect(updatedPrinter.configFileEntries).toEqual([
            {
                path: 'printer.cfg',
                content: 'abc',
                contentHash: 'hash-a',
            },
        ])
        expect(updatedPrinter.configFilesLoaded).toBe(true)
        expect(updatedPrinter.configFilesLoading).toBe(false)
        expect(updatedPrinter.configFilesError).toBeUndefined()
    })

    it('loads mainsail_idex.cfg when hyphenated idex filename is missing', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Printer not found' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    files: [
                        { path: 'printer.cfg', content: 'abc', content_hash: 'hash-a' },
                        { path: 'mainsail_idex.cfg', content: 'macro', content_hash: 'hash-b' },
                    ],
                }),
            })

        vi.stubGlobal('fetch', fetchMock)

        const vm: any = new (ConfigSync as any)()
        vm.$store = {
            getters: {
                'auth/token': 'token-123',
            },
            dispatch: vi.fn(),
        }
        vm.$router = { push: vi.fn() }
        vm.$route = { fullPath: '/config-sync' }
        vm.showError = vi.fn()
        vm.getConfigFetchDebugMessage = vi.fn().mockResolvedValue('debug message')
        vm.printerStatuses = [
            {
                printerId: 'printer-1',
                printerName: 'Printer 1',
                isOnline: true,
                templates: [],
                configFiles: [],
                configFilesError: undefined,
                configFilesLoading: false,
                configFilesLoaded: false,
                configFileEntries: [],
                migrationPendingVerification: false,
            },
        ]

        await vm.loadPrinterConfigFiles('printer-1')

        expect(fetchMock).toHaveBeenCalledTimes(2)

        const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(firstCallBody.filenames).toEqual(['printer.cfg', 'mainsail-idex.cfg'])
        expect(firstCallBody.includeDependencies).toBe(true)

        const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body)
        expect(secondCallBody.filenames).toEqual(['printer.cfg', 'mainsail_idex.cfg'])
        expect(secondCallBody.includeDependencies).toBe(true)

        const updatedPrinter = vm.printerStatuses[0]
        expect(updatedPrinter.configFiles).toEqual(['mainsail_idex.cfg', 'printer.cfg'])
        expect(updatedPrinter.configFileEntries).toEqual([
            {
                path: 'printer.cfg',
                content: 'abc',
                contentHash: 'hash-a',
            },
            {
                path: 'mainsail_idex.cfg',
                content: 'macro',
                contentHash: 'hash-b',
            },
        ])
        expect(updatedPrinter.configFilesLoaded).toBe(true)
        expect(updatedPrinter.configFilesLoading).toBe(false)
        expect(updatedPrinter.configFilesError).toBeUndefined()
    })

    it('rebuilds candidate content from per-line decisions', () => {
        const vm: any = new (ConfigSync as any)()
        const candidate: any = {
            templateId: 'tpl-1',
            currentContent: 'A\nB\nC',
            content: 'A\nB2\nC\nD',
        }

        vm.initializeLineDecisions(candidate)

        const ops = vm.buildDiffOperations(candidate.currentContent, candidate.content)
        const removeB = ops.find((op: any) => op.type === 'remove' && op.line === 'B')
        const addB2 = ops.find((op: any) => op.type === 'add' && op.line === 'B2')
        const addD = ops.find((op: any) => op.type === 'add' && op.line === 'D')

        expect(removeB).toBeTruthy()
        expect(addB2).toBeTruthy()
        expect(addD).toBeTruthy()

        vm.setLineDecision(candidate, addD.index, false)

        const rebuilt = vm.rebuildCandidateContentWithLineDecisions(candidate)
        expect(rebuilt).toBe('A\nB2\nC')
    })

    it('preselects templates in Sync Configs dialog and tracks selection changes', () => {
        const vm: any = new (ConfigSync as any)()
        vm.showError = vi.fn()

        const printer = {
            printerId: 'printer-1',
            printerName: 'Printer 1',
            isOnline: true,
            migrationPendingVerification: false,
            templates: [
                {
                    templateId: 'tpl-printer',
                    templateName: 'printer.cfg',
                    filename: 'printer.cfg',
                    currentVersion: '1.0',
                    syncedVersion: '1.0',
                    syncedAt: null,
                    status: 'synced',
                },
                {
                    templateId: 'tpl-macros',
                    templateName: 'mainsail-idex.cfg',
                    filename: 'mainsail-idex.cfg',
                    currentVersion: '1.0',
                    syncedVersion: null,
                    syncedAt: null,
                    status: 'missing',
                },
            ],
        }

        vm.openSyncConfigsDialog(printer)

        expect(vm.syncConfigsDialog).toBe(true)
        expect(vm.selectedSyncConfigIds.sort()).toEqual(['tpl-macros', 'tpl-printer'])

        vm.setSyncConfigSelection('tpl-macros', false)
        expect(vm.selectedSyncConfigIds).toEqual(['tpl-printer'])
    })
})

describe('ConfigSync startMigrationReview', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    function buildVmWithLoadedConfigEntries() {
        const vm: any = new (ConfigSync as any)()
        vm.$store = {
            getters: {
                'auth/token': 'token-123',
            },
            dispatch: vi.fn(),
        }
        vm.$router = { push: vi.fn() }
        vm.$route = { fullPath: '/config-sync' }
        vm.showError = vi.fn()
        vm.showSuccess = vi.fn()
        vm.loadPrinterConfigFiles = vi.fn()
        vm.printerStatuses = [
            {
                printerId: 'printer-1',
                printerName: 'Printer 1',
                isOnline: true,
                templates: [
                    {
                        templateId: 'tpl-printer',
                        templateName: 'printer.cfg',
                        filename: 'printer.cfg',
                        currentVersion: '1.0',
                        syncedVersion: '1.0',
                        syncedAt: null,
                        status: 'synced',
                    },
                    {
                        templateId: 'tpl-idex',
                        templateName: 'mainsail_idex.cfg',
                        filename: 'mainsail_idex.cfg',
                        currentVersion: '1.0',
                        syncedVersion: null,
                        syncedAt: null,
                        status: 'missing',
                    },
                ],
                configFiles: ['printer.cfg', 'mainsail_idex.cfg'],
                configFilesError: undefined,
                configFilesLoading: false,
                configFilesLoaded: true,
                configFileEntries: [
                    {
                        path: 'printer.cfg',
                        content: 'cHJpbnRlcg==',
                        contentHash: 'hash-printer',
                    },
                    {
                        path: 'mainsail_idex.cfg',
                        content: 'aWRleA==',
                        contentHash: 'hash-idex',
                    },
                ],
                migrationPendingVerification: false,
            },
        ]
        return vm
    }

    it('sends selected templateIds for template-scoped migration review', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [],
                unmatchedTemplates: [],
            }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const vm = buildVmWithLoadedConfigEntries()
        const printer = vm.printerStatuses[0]

        await vm.startMigrationReview(printer, ['tpl-idex'], 'mainsail_idex.cfg')

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(requestBody.printerId).toBe('printer-1')
        expect(requestBody.sourceType).toBe('runtime')
        expect(requestBody.templateIds).toEqual(['tpl-idex'])
        expect(requestBody.files.map((f: any) => f.path).sort()).toEqual(['mainsail_idex.cfg', 'printer.cfg'])
    })

    it('does not send templateIds when reviewing all templates', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [],
                unmatchedTemplates: [],
            }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const vm = buildVmWithLoadedConfigEntries()
        const printer = vm.printerStatuses[0]

        await vm.startMigrationReview(printer)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(requestBody.printerId).toBe('printer-1')
        expect(requestBody.sourceType).toBe('runtime')
        expect(requestBody.templateIds).toBeUndefined()
    })
})
