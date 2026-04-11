import Component from 'vue-class-component'
import routes, { AppRoute } from '@/routes'
import { Mixins, Watch } from 'vue-property-decorator'
import { mdiLinkVariant, mdiViewDashboardOutline } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import { PrinterStateKlipperConfig } from '@/store/printer/types'
import { GuiNavigationStateEntry } from '@/store/gui/navigation/types'

export interface NaviPoint {
    type: 'link' | 'route'
    title: string
    orgTitle?: string
    to?: string
    href?: string
    target?: string
    icon: string
    position: number
    visible: boolean
}

@Component
export default class NavigationMixin extends Mixins(BaseMixin) {
    private customNaviLinks: NaviPoint[] = []

    get countPrinters() {
        return this.$store.getters['farm/countPrinters']
    }

    get routesNaviPoints(): NaviPoint[] {
        const points: NaviPoint[] = []

        if (this.countPrinters) {
            points.push({
                title: this.$t('App.Printers'),
                icon: mdiViewDashboardOutline,
                to: '/allPrinters',
                position: 0,
                visible: true,
            } as NaviPoint)
        }

        routes
            .filter((element) => {
                return element.showInNavi && this.showInNavi(element)
            })
            .forEach((element) => {
                const [position, visible] = this.getUiSettings({
                    type: 'route',
                    title: element.title ?? 'unknown',
                    visible: true,
                    position: element.position ?? 999,
                })

                // Hide the Dashboard route if Klippy (printer) is not connected
                const isDashboard = (element.name === 'dashboard')
                const shouldShowDashboard = !isDashboard || this.klippyIsConnected

                points.push({
                    type: 'route',
                    title: element.title ?? 'Unknown',
                    orgTitle: element.title,
                    icon: element.icon,
                    to: element.path,
                    position,
                    visible: visible && shouldShowDashboard,
                } as NaviPoint)
            })

        if (this.customNaviLinks.length) {
            this.customNaviLinks.forEach((element) => {
                const [position, visible] = this.getUiSettings({
                    type: 'link',
                    title: element.title ?? 'unknown',
                    visible: element.visible ?? true,
                    position: element.position ?? 999,
                })

                points.push({
                    type: 'link',
                    title: element.title,
                    icon: element.icon,
                    href: element.href,
                    target: element.target,
                    position,
                    visible,
                })
            })
        }

        return points
    }

    get naviPoints(): NaviPoint[] {
        return this.routesNaviPoints.sort((a, b) => a.position - b.position)
    }

    get visibleNaviPoints(): NaviPoint[] {
        const points = this.naviPoints.filter((entry) => entry.visible)
        
        // If running in fleet mode, show fleet-relevant routes only
        if (this.$store.state.instancesDB === 'fleet') {
            const fleetAllowedTitles = [
                'Fleet Dashboard',
                'My Printers',
                'Register Printer',
                'Config Sync',
                'All Printers',
                'Printers',
                'Farm',
                'Files',
                'G-Code Files',
                'Central File Repository',
                'Build Plate Composer',
                'Print Queue',
                'Machine',
                'History',
                'Charts',
                'PMIs & Reporting',
            ];
            return points.filter(entry => {
                const titleToCheck = entry.orgTitle || entry.title;
                return fleetAllowedTitles.includes(titleToCheck);
            });
        }
        
        return points;
    }

    get uiSettings(): GuiNavigationStateEntry[] {
        return this.$store.state.gui.navigation.entries
    }

    get klippy_state(): string {
        return this.$store.state.server.klippy_state
    }

    get boolNaviWebcam(): boolean {
        return this.$store.state.gui.uiSettings.boolWebcamNavi
    }

    get moonrakerComponents(): string[] {
        return this.$store.state.server.components
    }

    get registeredDirectories(): string[] {
        return this.$store.state.server.registered_directories
    }

    get klipperConfigfileSettings(): PrinterStateKlipperConfig[] {
        return this.$store.state.printer.configfile?.settings ?? {}
    }

    get sidebarNaviFile(): string {
        return this.$store.getters['files/getCustomNaviPoints']
    }

    get webcamCount(): number {
        return this.$store.getters['gui/webcams/getWebcams'].length
    }

    @Watch('sidebarNaviFile', { immediate: true })
    async sidebarNaviFileChanged(newVal: string) {
        this.customNaviLinks = []

        // stop if no file is set
        if (!newVal) return

        const content = await fetch(newVal)
            .then((res) => res.json())
            .catch((err) => {
                window.console.error('Unable to parse .theme/navi.json.')
                throw err
            })

        content.forEach((item: NaviPoint) => {
            this.customNaviLinks.push({
                title: item.title ?? 'Unknown',
                icon: item.icon ?? mdiLinkVariant,
                href: item.href ?? '#',
                target: item.target ?? undefined,
                position: item.position ?? 999,
            } as NaviPoint)
        })
    }

    showInNavi(route: AppRoute): boolean {
        if (['shutdown', 'error', 'disconnected'].includes(this.klippy_state) && !route.alwaysShow) return false
        else if (route.title === 'Webcam' && this.webcamCount === 0) return false
        else if (route.moonrakerComponent && !this.moonrakerComponents.includes(route.moonrakerComponent)) {
            // If we're running as the manager host, allow certain manager-only routes
            // even if the server.component discovery hasn't populated for the current
            // (non-connected) context yet. Specifically, allow `history` so the
            // History page shows up for FARM MANAGER instances even before any
            // printer connection happened.
            // allow history when we are on the manager host (front-end served
            // from manager) with farm printers available – this lets the
            // manager see the History route even before any printer connects
            // to a klipper instance.
            if (!(this.$store.state.socket.hostname === window.location.hostname && route.moonrakerComponent === 'history')) {
                return false
            }
        }
        else if (route.registeredDirectory && !this.registeredDirectories.includes(route.registeredDirectory))
            return false
        else if (route.klipperComponent && !(route.klipperComponent in this.klipperConfigfileSettings)) return false
        else if (route.klipperIsConnected && !this.klippyIsConnected) return false

        return true
    }

    getUiSettings(entry: GuiNavigationStateEntry): [number, boolean] {
        const index = this.uiSettings.findIndex((point) => {
            return point.title === entry.title && point.type === entry.type
        })

        if (index === -1) return [entry.position, entry.visible]

        return [this.uiSettings[index].position, this.uiSettings[index].visible]
    }
}
