<template>
    <div>
        <v-app-bar app elevate-on-scroll :height="topbarHeight" class="topbar pa-0" clipped-left>
            <v-app-bar-nav-icon 
                tile 
                :disabled="viewMode !== 'devices'" 
                @click.stop="naviDrawer = !naviDrawer" />
            <router-link to="/">
                <img src="/img/modovolo-logo-logomark-white.svg" :class="logoClasses" alt="Modovolo Logo" />
            </router-link>
            <v-toolbar-title class="text-no-wrap ml-0 pl-2 mr-2">{{ printerName }}</v-toolbar-title>
            <printer-selector v-if="countPrinters" />
            <v-spacer />
            <v-btn-toggle
                v-model="viewMode"
                mandatory
                dense
                class="view-mode-toggle"
                color="primary">
                <v-btn small value="prepare">
                    <v-icon small class="mr-1">{{ mdiWrench }}</v-icon>
                    <span class="d-none d-md-inline">Prepare</span>
                </v-btn>
                <v-btn small value="preview">
                    <v-icon small class="mr-1">{{ mdiEye }}</v-icon>
                    <span class="d-none d-md-inline">Preview</span>
                </v-btn>
                <v-btn small value="devices">
                    <v-icon small class="mr-1">{{ mdiDevices }}</v-icon>
                    <span class="d-none d-md-inline">Devices</span>
                </v-btn>
                <v-btn small value="monitoring">
                    <v-icon small class="mr-1">{{ mdiMonitor }}</v-icon>
                    <span class="d-none d-md-inline">Monitoring</span>
                </v-btn>
            </v-btn-toggle>
            <v-spacer />
            <input
                ref="fileUploadAndStart"
                type="file"
                :accept="gcodeInputFileAccept.join(', ')"
                style="display: none"
                @change="uploadAndStart" />
            <v-btn
                v-if="showSaveConfigButton"
                tile
                :icon="$vuetify.breakpoint.smAndDown"
                :text="$vuetify.breakpoint.mdAndUp"
                color="primary"
                class="button-min-width-auto px-3 d-none d-sm-flex save-config-button"
                :disabled="printerIsPrinting"
                :loading="loadings.includes('topbarSaveConfig')"
                @click="saveConfig">
                <v-icon class="d-md-none">{{ mdiContentSave }}</v-icon>
                <span class="d-none d-md-inline">{{ $t('App.TopBar.SAVE_CONFIG') }}</span>
            </v-btn>
            <v-btn
                v-if="boolShowUploadAndPrint"
                tile
                :icon="$vuetify.breakpoint.smAndDown"
                :text="$vuetify.breakpoint.mdAndUp"
                color="primary"
                class="button-min-width-auto px-3 d-none d-sm-flex upload-and-start-button"
                :loading="loadings.includes('btnUploadAndStart')"
                @click="btnUploadAndStart">
                <v-icon class="mr-md-2">{{ mdiFileUpload }}</v-icon>
                <span class="d-none d-md-inline">{{ $t('App.TopBar.UploadPrint') }}</span>
            </v-btn>
            <v-btn
                v-if="klippyIsConnected"
                tile
                :icon="$vuetify.breakpoint.smAndDown"
                :text="$vuetify.breakpoint.mdAndUp"
                color="error"
                class="button-min-width-auto px-3 emergency-button"
                :loading="loadings.includes('topbarEmergencyStop')"
                @click="btnEmergencyStop">
                <v-icon class="mr-md-2">{{ mdiAlertOctagonOutline }}</v-icon>
                <span class="d-none d-md-inline">{{ $t('App.TopBar.EmergencyStop') }}</span>
            </v-btn>
            <v-btn
                v-if="showDisconnectButton"
                tile
                :icon="$vuetify.breakpoint.smAndDown"
                :text="$vuetify.breakpoint.mdAndUp"
                color="secondary"
                class="button-min-width-auto px-3 d-none d-sm-flex disconnect-button"
                @click="btnDisconnect">
                <v-icon class="mr-md-2">{{ mdiLogout }}</v-icon>
                <span class="d-none d-md-inline">{{ $t('App.TopBar.ReturnToManager') }}</span>
            </v-btn>
            <the-topbar-user-menu />
            <the-notification-menu />
            <the-settings-menu />
            <the-top-corner-menu />
        </v-app-bar>
        <v-snackbar v-model="uploadSnackbar.status" :timeout="-1" fixed right bottom>
            <strong>{{ $t('App.TopBar.Uploading') }} {{ uploadSnackbar.filename }}</strong>
            <br />
            {{ Math.round(uploadSnackbar.percent) }} % @ {{ formatFilesize(Math.round(uploadSnackbar.speed)) }}/s
            <br />
            <v-progress-linear class="mt-2" :value="uploadSnackbar.percent"></v-progress-linear>
            <template #action="{ attrs }">
                <v-btn color="red" text v-bind="attrs" style="min-width: auto" @click="cancelUpload">
                    <v-icon class="0">{{ mdiClose }}</v-icon>
                </v-btn>
            </template>
        </v-snackbar>
        <emergency-stop-dialog :show-dialog="showEmergencyStopDialog" @close="showEmergencyStopDialog = false" />
    </div>
</template>

<script lang="ts">
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { validGcodeExtensions } from '@/store/variables'
import Component from 'vue-class-component'
import axios, { AxiosProgressEvent } from 'axios'
import { formatFilesize } from '@/plugins/helpers'
import TheTopCornerMenu from '@/components/TheTopCornerMenu.vue'
import TheSettingsMenu from '@/components/TheSettingsMenu.vue'
import TheTopbarUserMenu from '@/components/TheTopbarUserMenu.vue'
import Panel from '@/components/ui/Panel.vue'
import PrinterSelector from '@/components/ui/PrinterSelector.vue'
import MainsailLogo from '@/components/ui/MainsailLogo.vue'
import TheNotificationMenu from '@/components/notifications/TheNotificationMenu.vue'
import { topbarHeight } from '@/store/variables'
import { mdiAlertOctagonOutline, mdiContentSave, mdiFileUpload, mdiClose, mdiCloseThick, mdiLogout, mdiWrench, mdiEye, mdiDevices, mdiMonitor } from '@mdi/js'
import EmergencyStopDialog from '@/components/dialogs/EmergencyStopDialog.vue'
import InlineSvg from 'vue-inline-svg'
import ThemeMixin from '@/components/mixins/theme'

type uploadSnackbar = {
    status: boolean
    filename: string
    percent: number
    speed: number
    total: number
    cancelTokenSource: any
}

@Component({
    components: {
        EmergencyStopDialog,
        InlineSvg,
        Panel,
        TheSettingsMenu,
        TheTopCornerMenu,
        TheTopbarUserMenu,
        PrinterSelector,
        MainsailLogo,
        TheNotificationMenu,
    },
})
export default class TheTopbar extends Mixins(BaseMixin, ThemeMixin) {
    mdiAlertOctagonOutline = mdiAlertOctagonOutline
    mdiContentSave = mdiContentSave
    mdiFileUpload = mdiFileUpload
    mdiClose = mdiClose
    mdiLogout = mdiLogout
    mdiCloseThick = mdiCloseThick
    mdiWrench = mdiWrench
    mdiEye = mdiEye
    mdiDevices = mdiDevices
    mdiMonitor = mdiMonitor

    topbarHeight = topbarHeight

    showEmergencyStopDialog = false

    viewMode: string = 'devices'

    uploadSnackbar: uploadSnackbar = {
        status: false,
        filename: '',
        percent: 0,
        speed: 0,
        total: 0,
        cancelTokenSource: null,
    }

    formatFilesize = formatFilesize

    declare $refs: {
        fileUploadAndStart: HTMLFormElement
    }

    get gcodeInputFileAccept() {
        if (this.isIOS) return []

        return validGcodeExtensions
    }

    get naviDrawer() {
        return this.$store.state.naviDrawer
    }

    set naviDrawer(newVal) {
        this.$store.dispatch('setNaviDrawer', newVal)
    }

    get currentPage() {
        return this.$route.fullPath
    }

    get saveConfigPending() {
        return this.$store.state.printer.configfile?.save_config_pending ?? false
    }

    get hideSaveConfigForBedMash() {
        return this.$store.state.gui.uiSettings.hideSaveConfigForBedMash ?? false
    }

    get showSaveConfigButton() {
        if (!this.klipperReadyForGui) return false
        if (!this.hideSaveConfigForBedMash) return this.saveConfigPending

        let pendingKeys = Object.keys(this.$store.state.printer.configfile?.save_config_pending_items ?? {})
        pendingKeys = pendingKeys.filter((key: string) => !key.startsWith('bed_mesh '))

        return pendingKeys.length > 0
    }

    get printerName(): string {
        if (this.$store.state.gui.general.printername.length) return this.$store.state.gui.general.printername

        return this.$store.state.printer.hostname
    }

    get countPrinters() {
        return this.$store.getters['farm/countPrinters']
    }

    get boolHideUploadAndPrintButton() {
        return this.$store.state.gui.uiSettings.boolHideUploadAndPrintButton ?? false
    }

    get isSvgLogo() {
        return this.sidebarLogo.includes('.svg?timestamp=') || this.sidebarLogo.endsWith('.svg')
    }

    get logoColor(): string {
        return this.$store.state.gui.uiSettings.logo
    }

    get logoClasses() {
        return ['nav-logo', 'ml-2', 'mr-1', 'd-none', 'd-sm-flex']
    }

    get boolShowUploadAndPrint() {
        return (
            this.klippyIsConnected &&
            this.existGcodesRootDirectory &&
            ['standby', 'complete', 'cancelled'].includes(this.printer_state) &&
            !this.boolHideUploadAndPrintButton
        )
    }

    /**
     * Show disconnect button when we are connected to a remote printer
     * (socket host/port differs from the current window host/port)
     */
    get showDisconnectButton(): boolean {
        const socketHostname = this.$store.state.socket.hostname ?? ''
        const socketPort = this.$store.state.socket.port ? Number(this.$store.state.socket.port) : (window.location.protocol === 'https:' ? 443 : 80)
        const locationHostname = window.location.hostname ?? ''
        const locationPort = window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80)

        if (!socketHostname) return false
        return socketHostname !== locationHostname || socketPort !== locationPort
    }

    get defaultNavigationStateSetting() {
        return this.$store.state.gui?.uiSettings?.defaultNavigationStateSetting ?? 'alwaysOpen'
    }

    mounted() {
        //this.naviDrawer = this.$vuetify.breakpoint.lgAndUp
        switch (this.defaultNavigationStateSetting) {
            case 'alwaysClosed':
                this.naviDrawer = false
                break

            case 'lastState':
                this.naviDrawer = (localStorage.getItem('naviDrawer') ?? 'true') === 'true'
                break

            default:
                this.naviDrawer = this.$vuetify.breakpoint.lgAndUp
        }
        
        // Initialize view mode - show sidebar only for devices tab
        this.updateNaviDrawerForViewMode(this.viewMode)
    }

    @Watch('viewMode')
    onViewModeChange(newMode: string) {
        this.updateNaviDrawerForViewMode(newMode)
        this.navigateToViewMode(newMode)
    }

    updateNaviDrawerForViewMode(mode: string) {
        // Show sidebar only when "devices" tab is selected
        if (mode === 'devices') {
            this.naviDrawer = true
        } else {
            this.naviDrawer = false
        }
    }

    navigateToViewMode(mode: string) {
        // Navigate to the appropriate route based on view mode
        const routeMap: { [key: string]: string } = {
            'prepare': '/prepare',
            'preview': '/preview',
            'devices': '/',
            'monitoring': '/monitoring'
        }
        
        const targetPath = routeMap[mode]
        if (targetPath && this.$route.path !== targetPath) {
            this.$router.push(targetPath).catch(() => {
                // Ignore navigation duplicates
            })
        }
    }

    btnEmergencyStop() {
        const confirmOnEmergencyStop = this.$store.state.gui.uiSettings.confirmOnEmergencyStop
        if (confirmOnEmergencyStop) {
            this.showEmergencyStopDialog = true
            return
        }

        this.emergencyStop()
    }

    btnDisconnect() {
        this.$store.dispatch('disconnectToManager')
    }

    emergencyStop() {
        this.showEmergencyStopDialog = false
        this.$socket.emit('printer.emergency_stop', {}, { loading: 'topbarEmergencyStop' })
    }

    saveConfig() {
        this.$store.dispatch('server/addEvent', { message: 'SAVE_CONFIG', type: 'command' })
        this.$socket.emit('printer.gcode.script', { script: 'SAVE_CONFIG' }, { loading: 'topbarSaveConfig' })
    }

    btnUploadAndStart() {
        this.$refs.fileUploadAndStart.click()
    }

    async uploadAndStart() {
        if (this.$refs.fileUploadAndStart?.files.length) {
            await this.$store.dispatch('socket/addLoading', { name: 'btnUploadAndStart' })
            let successFiles = []
            for (const file of this.$refs.fileUploadAndStart?.files || []) {
                const result = await this.doUploadAndStart(file)
                successFiles.push(result)
            }

            await this.$store.dispatch('socket/removeLoading', { name: 'btnUploadAndStart' })
            for (const file of successFiles) {
                const text = this.$t('App.TopBar.UploadOfFileSuccessful', { file: file }).toString()
                this.$toast.success(text)
            }

            this.$refs.fileUploadAndStart.value = ''
            if (this.currentPage !== '/') await this.$router.push('/')
        }
    }

    doUploadAndStart(file: File) {
        const formData = new FormData()
        const filename = file.name

        this.uploadSnackbar.filename = filename
        this.uploadSnackbar.status = true
        this.uploadSnackbar.percent = 0
        this.uploadSnackbar.speed = 0

        formData.append('file', file, filename)
        formData.append('print', 'true')

        return new Promise((resolve) => {
            this.uploadSnackbar.cancelTokenSource = axios.CancelToken.source()
            axios
                .post(this.apiUrl + '/server/files/upload', formData, {
                    cancelToken: this.uploadSnackbar.cancelTokenSource.token,
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                        this.uploadSnackbar.percent = (progressEvent.progress ?? 0) * 100
                        this.uploadSnackbar.speed = progressEvent.rate ?? 0
                        this.uploadSnackbar.total = progressEvent.total ?? 0
                    },
                })
                .then((result) => {
                    this.uploadSnackbar.status = false
                    // if the server returned an item path, refresh the directory to show newly uploaded file
                    try {
                        const path = result?.data?.item?.path
                        if (path) {
                            const root = path.split('/')[0]
                            this.$socket.emit('server.files.get_directory', { path: root }, { action: 'files/getDirectory' })
                        }
                    } catch (_) {}

                    resolve(result.data.result)
                })
                .catch(() => {
                    this.uploadSnackbar.status = false
                    this.$store.dispatch('socket/removeLoading', { name: 'btnUploadAndStart' })
                    const text = this.$t('App.TopBar.CannotUploadTheFile').toString()
                    this.$toast.error(text)
                })
        })
    }

    cancelUpload(): void {
        this.uploadSnackbar.cancelTokenSource.cancel()
        this.uploadSnackbar.status = false
    }
}
</script>

<style scoped>
/*noinspection CssUnusedSymbol*/
::v-deep .topbar .v-toolbar__content {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
}

.button-min-width-auto {
    min-width: auto !important;
}
/*noinspection CssUnusedSymbol*/
.topbar .v-btn {
    height: 100% !important;
    max-height: none;
}
::v-deep .topbar .nav-logo {
    width: auto;
    height: 32px;
}
/*noinspection CssUnusedSymbol*/
.topbar .v-btn.v-btn--icon {
    /*noinspection CssUnresolvedCustomProperty*/
    width: var(--topbar-icon-btn-width) !important;
}
/*noinspection CssUnusedSymbol*/
@media (min-width: 768px) {
    header.topbar {
        z-index: 8 !important;
    }
}

.view-mode-toggle {
    height: 32px !important;
}

.view-mode-toggle .v-btn {
    height: 32px !important;
    text-transform: none !important;
}
</style>
