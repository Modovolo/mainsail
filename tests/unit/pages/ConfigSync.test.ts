import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ConfigSync from '@/pages/ConfigSync.vue'

describe('ConfigSync loadPrinterConfigFiles', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('falls back to printer.cfg when mainsail-idex.cfg request returns 404', async () => {
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
        expect(secondCallBody.filenames).toEqual(['printer.cfg'])
        expect(secondCallBody.includeDependencies).toBe(true)

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
