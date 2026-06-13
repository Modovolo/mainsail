<template>
    <div>
        <v-dialog
            v-model="show"
            persistent
            fullscreen
            hide-overlay
            :transition="false"
            @close="close"
            @keydown.esc="escClose"
            @keydown.ctrl.shift.s.prevent="!isSplitMode && restartServiceNameExists && save(restartServiceName)"
            @keydown.meta.shift.s.prevent="!isSplitMode && restartServiceNameExists && save(restartServiceName)"
            @keydown.ctrl.s.prevent="isSplitMode ? saveSplit() : save(null)"
            @keydown.meta.s.prevent="isSplitMode ? saveSplit() : save(null)">
            <panel
                card-class="editor-dialog"
                :icon="editorIcon"
                :title="title">
                <template #buttons>
                    <v-btn v-if="!isSplitMode" text tile class="d-none d-md-flex" @click="dialogDevices = true">
                        <v-icon small class="mr-1">{{ mdiUsb }}</v-icon>
                        {{ $t('Editor.DeviceDialog') }}
                    </v-btn>
                    <v-btn
                        v-if="!isSplitMode && restartServiceName === 'klipper'"
                        text
                        tile
                        :href="klipperConfigReference"
                        target="_blank"
                        class="d-none d-md-flex">
                        <v-icon small class="mr-1">{{ mdiHelp }}</v-icon>
                        {{ $t('Editor.ConfigReference') }}
                    </v-btn>
                    <v-btn
                        v-if="!isSplitMode && existsFileStructure"
                        text
                        tile
                        class="d-none d-md-flex"
                        @click="toggleFileStructure">
                        <v-icon small class="mr-1">{{ mdiFormatListCheckbox }}</v-icon>
                        {{ $t('Editor.FileStructure') }}
                    </v-btn>
                    <v-btn
                        v-if="!isSplitMode && restartServiceNameExists && !isDiffMode"
                        color="primary"
                        text
                        tile
                        class="d-none d-sm-flex"
                        @click="save(restartServiceName)">
                        <v-icon small class="mr-1">{{ mdiRestart }}</v-icon>
                        {{ $t('Editor.SaveRestart') }}
                    </v-btn>
                    <v-btn v-if="!isSplitMode && isWriteable && !isDiffMode" icon tile @click="save(null)">
                        <v-icon>{{ mdiContentSave }}</v-icon>
                    </v-btn>
                    <v-btn
                        v-if="isSplitMode"
                        color="primary"
                        text
                        tile
                        :loading="splitSaving"
                        class="d-none d-sm-flex"
                        @click="saveSplit()">
                        <v-icon small class="mr-1">{{ mdiContentSave }}</v-icon>
                        Save Both
                    </v-btn>
                    <v-btn icon tile @click="close">
                        <v-icon>{{ mdiCloseThick }}</v-icon>
                    </v-btn>
                </template>
                <v-card-text class="pa-0 d-flex">
                    <template v-if="isSplitMode">
                        <div class="split-review-layout">
                            <div class="split-review-pane">
                                <div class="split-review-pane-title">{{ splitLeftTitle }}</div>
                                <codemirror-async
                                    v-if="show"
                                    v-model="splitLeftContent"
                                    :name="splitLeftFilename"
                                    :file-extension="splitLeftFileExtension"
                                    :highlighted-lines="splitLeftHighlightLines"
                                    highlight-mode="remove"
                                    :read-only="false"
                                    class="codemirror split-codemirror" />
                            </div>
                            <div class="split-review-divider"></div>
                            <div class="split-review-pane">
                                <div class="split-review-pane-title">{{ splitRightTitle }}</div>
                                <codemirror-async
                                    v-if="show"
                                    v-model="splitRightContent"
                                    :name="splitRightFilename"
                                    :file-extension="splitRightFileExtension"
                                    :highlighted-lines="splitRightHighlightLines"
                                    highlight-mode="add"
                                    :read-only="false"
                                    class="codemirror split-codemirror" />
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <codemirror-async
                            v-if="show"
                            ref="editor"
                            v-model="sourcecode"
                            :name="filename"
                            :file-extension="fileExtension"
                            :diff-mode="isDiffMode"
                            :read-only="isDiffMode || !isWriteable"
                            class="codemirror"
                            :class="{ withSidebar: existsFileStructure && fileStructureSidebar }"
                            @lineChange="lineChanges" />
                    </template>
                    <div
                        v-if="!isSplitMode && existsFileStructure && fileStructureSidebar"
                        class="d-none d-md-flex structure-sidebar">
                        <v-treeview
                            activatable
                            dense
                            :active="structureActive"
                            :open="structureOpen"
                            :item-key="treeviewItemKeyProp"
                            :items="configFileStructure"
                            class="w-100"
                            @update:active="activeChanges">
                            <template #label="{ item }">
                                <div
                                    class="cursor-pointer _structure-sidebar-item"
                                    :class="item.type == 'item' ? 'ͼp' : 'ͼt'"
                                    @click="activeChangesItemClick">
                                    {{ item.name }}
                                </div>
                            </template>
                            <template v-if="restartServiceName === 'klipper'" #append="{ item }">
                                <v-btn
                                    v-if="item.type == 'section'"
                                    icon
                                    small
                                    plain
                                    color="grey darken-2"
                                    :href="klipperConfigReference + '#' + item.name.split(' ')[0]"
                                    target="_blank">
                                    <v-icon small class="mr-1">{{ mdiHelpCircle }}</v-icon>
                                </v-btn>
                            </template>
                        </v-treeview>
                    </div>
                </v-card-text>
            </panel>
        </v-dialog>
        <v-snackbar v-model="loaderBool" :timeout="-1" fixed right bottom>
            <div>
                {{ snackbarHeadline }}
                <br />
                <strong>{{ filename }}</strong>
            </div>
            <template v-if="loaderProgress.total > 0">
                <span class="mr-1">
                    ({{ formatFilesize(loaderProgress.loaded) }}/{{ formatFilesize(loaderProgress.total) }})
                </span>
                {{ Math.round((100 * loaderProgress.loaded) / loaderProgress.total) }} % @ {{ loaderProgress.speed }}/s
                <br />
                <v-progress-linear
                    class="mt-2"
                    :value="(100 * loaderProgress.loaded) / loaderProgress.total"></v-progress-linear>
            </template>
            <template v-else>
                <v-progress-linear class="mt-2" indeterminate></v-progress-linear>
            </template>
            <template #action="{ attrs }">
                <v-btn color="red" text v-bind="attrs" style="min-width: auto" tile @click="cancelDownload">
                    <v-icon class="0">{{ mdiClose }}</v-icon>
                </v-btn>
            </template>
        </v-snackbar>
        <v-dialog v-model="dialogConfirmChange" persistent :width="600">
            <panel
                card-class="editor-confirm-change-dialog"
                :icon="mdiHelpCircle"
                :title="$t('Editor.UnsavedChanges')"
                :margin-bottom="false">
                <template #buttons>
                    <v-btn icon tile @click="dialogConfirmChange = false">
                        <v-icon>{{ mdiCloseThick }}</v-icon>
                    </v-btn>
                </template>
                <v-card-text class="pt-3">
                    <v-row>
                        <v-col>
                            <p class="body-1 mb-2">{{ $t('Editor.UnsavedChangesMessage', { filename: filename }) }}</p>
                            <p class="body-2">{{ $t('Editor.UnsavedChangesSubMessage') }}</p>
                        </v-col>
                    </v-row>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="discardChanges">
                        {{ $t('Editor.DontSave') }}
                    </v-btn>
                    <v-btn text color="primary" @click="save">
                        {{ $t('Editor.SaveClose') }}
                    </v-btn>
                    <template v-if="restartServiceNameExists">
                        <v-btn text color="primary" @click="save(restartServiceName)">
                            {{ $t('Editor.SaveRestart') }}
                        </v-btn>
                    </template>
                </v-card-actions>
            </panel>
        </v-dialog>
        <devices-dialog :show-dialog="dialogDevices" @close="dialogDevices = false" />
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Ref, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { capitalize, formatFilesize, windowBeforeUnloadFunction } from '@/plugins/helpers'
import Panel from '@/components/ui/Panel.vue'
import { klipperRepos } from '@/store/variables'
import CodemirrorAsync from '@/components/inputs/CodemirrorAsync'
import {
    mdiClose,
    mdiCloseThick,
    mdiContentSave,
    mdiFileDocumentOutline,
    mdiFileDocumentEditOutline,
    mdiHelp,
    mdiHelpCircle,
    mdiRestart,
    mdiUsb,
    mdiFormatListCheckbox,
} from '@mdi/js'
import DevicesDialog from '@/components/dialogs/DevicesDialog.vue'
import { ConfigFileSection } from '@/store/files/types'

@Component({
    components: { DevicesDialog, Panel, CodemirrorAsync },
})
export default class TheEditor extends Mixins(BaseMixin) {
    dialogConfirmChange = false
    dialogDevices = false
    treeviewItemKeyProp = 'line' as const
    structureActive: number[] = []
    structureOpen: number[] = []
    structureActiveChangedBySidebar: boolean = false
    splitSaving = false

    formatFilesize = formatFilesize

    /**
     * Icons
     */
    mdiCloseThick = mdiCloseThick
    mdiHelp = mdiHelp
    mdiContentSave = mdiContentSave
    mdiRestart = mdiRestart
    mdiClose = mdiClose
    mdiHelpCircle = mdiHelpCircle
    mdiFileDocumentEditOutline = mdiFileDocumentEditOutline
    mdiFileDocumentOutline = mdiFileDocumentOutline
    mdiUsb = mdiUsb
    mdiFormatListCheckbox = mdiFormatListCheckbox

    //@ts-ignore
    @Ref('editor') editor!: CodemirrorAsync

    get changed() {
        return this.$store.state.editor.changed ?? false
    }

    get changedOutput() {
        return this.changed ? '*' : ''
    }

    get show() {
        return this.$store.state.editor.bool ?? false
    }

    get isDiffMode() {
        return this.$store.state.editor.diffMode ?? false
    }

    get isSplitMode() {
        return this.$store.state.editor.splitMode ?? false
    }

    get filepath(): string {
        return this.$store.state.editor.filepath ?? ''
    }

    get filename(): string {
        return this.$store.state.editor.filename ?? ''
    }

    get filenameWithoutExtension(): string {
        if (this.filename.lastIndexOf('.')) return this.filename.slice(0, this.filename.lastIndexOf('.'))

        return this.filename
    }

    get fileExtension() {
        if (this.filename.lastIndexOf('.')) return this.filename.slice(this.filename.lastIndexOf('.') + 1)

        return ''
    }

    get splitLeftTitle(): string {
        return this.$store.state.editor.splitLeftTitle ?? 'Template'
    }

    get splitRightTitle(): string {
        return this.$store.state.editor.splitRightTitle ?? 'Remote'
    }

    get splitLeftFilename(): string {
        return this.$store.state.editor.splitLeftFilename ?? this.filename
    }

    get splitRightFilename(): string {
        return this.$store.state.editor.splitRightFilename ?? this.filename
    }

    get splitLeftContent(): string {
        return this.$store.state.editor.splitLeftContent ?? ''
    }

    set splitLeftContent(newVal: string) {
        this.$store.commit('editor/updateSplitLeftContent', newVal)
    }

    get splitRightContent(): string {
        return this.$store.state.editor.splitRightContent ?? ''
    }

    set splitRightContent(newVal: string) {
        this.$store.commit('editor/updateSplitRightContent', newVal)
    }

    get splitDiffHighlightLines(): { left: number[]; right: number[] } {
        const leftContent = this.splitLeftContent || ''
        const rightContent = this.splitRightContent || ''

        if (!leftContent && !rightContent) {
            return { left: [], right: [] }
        }

        if (leftContent === rightContent) {
            return { left: [], right: [] }
        }

        return this.buildSplitDiffHighlightLines(leftContent, rightContent)
    }

    get splitLeftHighlightLines(): number[] {
        return this.splitDiffHighlightLines.left
    }

    get splitRightHighlightLines(): number[] {
        return this.splitDiffHighlightLines.right
    }

    get splitLeftFileExtension(): string {
        return this.getExtension(this.splitLeftFilename)
    }

    get splitRightFileExtension(): string {
        return this.getExtension(this.splitRightFilename)
    }

    get editorIcon() {
        return !this.isSplitMode && this.isWriteable ? this.mdiFileDocumentEditOutline : this.mdiFileDocumentOutline
    }

    get fileroot() {
        return this.$store.state.editor.fileroot ?? 'gcodes'
    }

    get permissions(): string {
        return this.$store.state.editor.permissions ?? 'r'
    }

    get isWriteable() {
        return this.permissions.includes('w')
    }

    get sourcecode() {
        return this.$store.state.editor.sourcecode ?? ''
    }

    set sourcecode(newVal) {
        this.$store.dispatch('editor/updateSourcecode', newVal)
    }

    get loaderBool() {
        return this.$store.state.editor.loaderBool ?? false
    }

    get loaderProgress() {
        return this.$store.state.editor.loaderProgress ?? {}
    }

    get snackbarHeadline() {
        let directionUppercase = this.$t('Editor.Downloading')
        if (this.loaderProgress.direction) directionUppercase = capitalize(this.loaderProgress.direction)

        return this.$t(`Editor.${directionUppercase}`)
    }

    get availableServices() {
        return this.$store.state.server.system_info?.available_services ?? []
    }

    get restartAllowedOrPossible() {
        if (!this.isWriteable) return null
        if (['printing', 'paused'].includes(this.printer_state)) return null

        return true
    }

    get restartServiceName() {
        // check for generic services <service>.conf (like moonraker.conf, crowsnest.conf, sonar.conf)
        if (this.availableServices.includes(this.filenameWithoutExtension) && this.fileExtension === 'conf')
            return this.filenameWithoutExtension

        // old webcam service DEPRECATED
        if (this.filename.startsWith('webcam') && ['conf', 'txt'].includes(this.fileExtension)) return 'webcamd'

        // check for mooncord config files
        if (this.filename.startsWith('mooncord') && this.fileExtension === 'json') return 'mooncord'

        // fallback for moonraker with multi instances
        if (this.filename === 'moonraker.conf') return 'moonraker'

        // all .cfg files will be klipper config files
        if (this.fileExtension === 'cfg') return 'klipper'

        return null
    }

    get restartServiceNameExists() {
        if (!this.restartAllowedOrPossible) return false

        // hide the button, if there is no service found
        if (this.restartServiceName === null) return false

        // klipper and moonraker uses specific api calls instead of generic service restart
        if (['klipper', 'moonraker'].includes(this.restartServiceName)) return true

        return this.availableServices.includes(this.restartServiceName)
    }

    get confirmUnsavedChanges() {
        return this.$store.state.gui.editor.confirmUnsavedChanges ?? false
    }

    get escToClose() {
        return this.$store.state.gui.editor.escToClose ?? false
    }

    get title() {
        const title = this.filepath ? `${this.filepath}/${this.filename}` : this.filename

        if (this.isSplitMode) return 'Diff Review · Editable'

        if (this.isDiffMode) return `${title} (${this.$t('Editor.FileReadOnly')}) · Diff Review`

        if (!this.isWriteable) return `${title} (${this.$t('Editor.FileReadOnly')})`

        return `${title} ${this.changedOutput}`
    }

    get currentLanguage() {
        return this.$store.state.gui.general.language
    }

    get klipperConfigReference(): string {
        const currentLanguage = this.currentLanguage
        const klipperRepo = klipperRepos[this.klipperAppName] ?? klipperRepos.Klipper

        let url = klipperRepo.url
        if (klipperRepo.docsLanguages?.includes(currentLanguage)) {
            url += `${currentLanguage}/`
        }

        url += 'Config_Reference.html'

        return url
    }

    get fileStructureSidebar() {
        return this.$store.state.gui.editor.fileStructureSidebar
    }

    getExtension(filename: string): string {
        const value = filename || ''
        if (!value.includes('.')) return ''

        return value.slice(value.lastIndexOf('.') + 1)
    }

    buildSplitDiffHighlightLines(leftContent: string, rightContent: string): { left: number[]; right: number[] } {
        const leftLines = leftContent.split('\n')
        const rightLines = rightContent.split('\n')
        const leftCount = leftLines.length
        const rightCount = rightLines.length

        const lcs: number[][] = Array.from({ length: leftCount + 1 }, () => Array<number>(rightCount + 1).fill(0))

        for (let i = 1; i <= leftCount; i++) {
            for (let j = 1; j <= rightCount; j++) {
                if (leftLines[i - 1] === rightLines[j - 1]) {
                    lcs[i][j] = lcs[i - 1][j - 1] + 1
                } else {
                    lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
                }
            }
        }

        const leftHighlightedLines: number[] = []
        const rightHighlightedLines: number[] = []
        let i = leftCount
        let j = rightCount

        while (i > 0 && j > 0) {
            if (leftLines[i - 1] === rightLines[j - 1]) {
                i--
                j--
            } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
                leftHighlightedLines.push(i)
                i--
            } else {
                rightHighlightedLines.push(j)
                j--
            }
        }

        while (i > 0) {
            leftHighlightedLines.push(i)
            i--
        }

        while (j > 0) {
            rightHighlightedLines.push(j)
            j--
        }

        leftHighlightedLines.reverse()
        rightHighlightedLines.reverse()

        return {
            left: leftHighlightedLines,
            right: rightHighlightedLines,
        }
    }

    set fileStructureSidebar(newVal) {
        this.$store.dispatch('gui/saveSetting', { name: 'editor.fileStructureSidebar', value: newVal })
    }

    get configFileStructure(): ConfigFileSection[] {
        if (!['conf', 'cfg'].includes(this.fileExtension)) return []

        const lines = this.sourcecode.split(/\n/gi)
        const regex = /^[^#\S]*?(\[(?<section>.*?)]|(?<name>\w+)\s*?[:=])/gim
        const structure: ConfigFileSection[] = []

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const matches = [...line.matchAll(regex)]

            // break if no matches were found
            if (matches.length === 0) continue

            const match = matches[0]
            if (match['groups']['section']) {
                structure.push({
                    name: match['groups']['section'],
                    type: 'section',
                    line: i + 1,
                    children: [],
                })

                continue
            }

            if (structure.length && match['groups']['name']) {
                structure[structure.length - 1]['children'].push({
                    name: match['groups']['name'],
                    type: 'item',
                    line: i + 1,
                })
            }
        }

        return structure
    }

    get existsFileStructure() {
        return this.configFileStructure.length > 0
    }

    toggleFileStructure() {
        this.fileStructureSidebar = !this.fileStructureSidebar
    }

    cancelDownload() {
        this.$store.dispatch('editor/cancelLoad')
    }

    escClose() {
        if (this.escToClose) this.close()
    }

    close() {
        if (this.confirmUnsavedChanges) this.promptUnsavedChanges()
        else this.$store.dispatch('editor/close')
    }

    discardChanges() {
        this.dialogConfirmChange = false
        this.$store.dispatch('editor/close')
    }

    promptUnsavedChanges() {
        if (!this.changed || !this.isWriteable) this.$store.dispatch('editor/close')
        else this.dialogConfirmChange = true
    }

    save(restartServiceName: string | null = null) {
        this.dialogConfirmChange = false

        this.$store.dispatch('editor/saveFile', {
            content: this.sourcecode,
            restartServiceName: restartServiceName,
        })
    }

    // Saving in split (diff review) mode is handled by whoever opened the editor
    // (currently ConfigSync). We expose the current pane contents via a root event
    // and reflect the in-flight state back through `editor/setSplitSaving`.
    saveSplit() {
        if (this.splitSaving) return

        this.splitSaving = true
        this.$root.$emit('editor:split-save', {
            left: this.splitLeftContent,
            right: this.splitRightContent,
            done: (success: boolean) => {
                this.splitSaving = false
                if (success) this.$store.dispatch('editor/close')
            },
        })
    }

    // Relies on event bubbling to flip the flag before treeview active change is handled
    activeChangesItemClick() {
        this.structureActiveChangedBySidebar = true
    }

    activeChanges(activeItems: Array<ConfigFileSection[typeof this.treeviewItemKeyProp]>) {
        if (!this.structureActiveChangedBySidebar) {
            return
        }

        this.structureActiveChangedBySidebar = false

        if (!activeItems.length) {
            return
        }

        this.editor?.gotoLine(activeItems[0])
    }

    lineChanges(line: number) {
        this.configFileStructure?.map((item) => {
            if (item.line == line) {
                this.structureActive = [line]
            } else {
                item.children?.map((child) => {
                    if (child.line == line) {
                        this.structureActive = [line]
                        if (!this.structureOpen.includes(item.line)) this.structureOpen.push(item.line)
                    }
                })
            }
        })
    }

    @Watch('changed')
    changedChanged(newVal: boolean) {
        if (!this.confirmUnsavedChanges) return

        if (newVal) {
            window.addEventListener('beforeunload', windowBeforeUnloadFunction)
            return
        }

        window.removeEventListener('beforeunload', windowBeforeUnloadFunction)
    }
}
</script>
<style scoped>
::v-deep .ͼ1 .cm-panel.cm-search *:focus:not(.focus-visible) {
    outline: none;
}

::v-deep .ͼ1 .cm-panel.cm-search input[type='checkbox'] {
    width: 2.2em;
    height: 2.2em;
    color: dodgerblue;
    vertical-align: middle;
    -webkit-appearance: none;
    border: 10px;
    outline: 0;
    flex-grow: 0;
    border-radius: 4px;
    background: var(--v-toolbar-base);
    transition: background 300ms;
    cursor: pointer;
    margin-right: 0.5em;
}

/* Pseudo element for check styling */

::v-deep .ͼ1 .cm-panel.cm-search input[type='checkbox']::before {
    content: '';
    color: transparent;
    display: block;
    width: inherit;
    height: inherit;
    border-radius: inherit;
    border: 2px;
    background-color: transparent;
    background-size: contain;
    box-shadow: inset 0 0 0 1px #ccd3d8;
    font-size: 16px;
}

/* Checked */

::v-deep .ͼ1 .cm-panel.cm-search input[type='checkbox']:checked {
    background-color: var(--color-primary);
}

::v-deep .ͼ1 .cm-panel.cm-search input[type='checkbox']:checked::before {
    box-shadow: none;
    background-color: var(--color-primary);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E %3Cpath d='M15.88 8.29L10 14.17l-1.88-1.88a.996.996 0 1 0-1.41 1.41l2.59 2.59c.39.39 1.02.39 1.41 0L17.3 9.7a.996.996 0 0 0 0-1.41c-.39-.39-1.03-.39-1.42 0z' fill='%23fffff'/%3E %3C/svg%3E");
}

@media screen and (min-width: 960px) {
    .codemirror:not(.withSidebar) {
        width: 100%;
    }
    .codemirror.withSidebar {
        width: calc(100% - 300px);
    }
}

.split-review-layout {
    display: flex;
    width: 100%;
    min-height: calc(100vh - 48px);
}

.split-review-pane {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.split-review-pane-title {
    padding: 10px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.split-review-divider {
    width: 1px;
    background: rgba(128, 128, 128, 0.25);
}

.split-codemirror {
    width: 100%;
    flex: 1 1 auto;
}

@media screen and (max-width: 959px) {
    .split-review-layout {
        flex-direction: column;
    }

    .split-review-divider {
        width: 100%;
        height: 1px;
    }
}

.structure-sidebar {
    width: 300px;
    overflow-y: auto;
    max-height: calc(100vh - 48px);
}
._structure-sidebar-item {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
}

::v-deep .v-treeview-node__level + .v-treeview-node__level {
    width: 12px;
}
</style>
