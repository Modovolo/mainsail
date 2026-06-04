<template>
    <div class="vue-codemirror">
        <div ref="editor" v-observe-visibility="visibilityChanged"></div>
    </div>
</template>

<script lang="ts">
// Inspired by this repo: https://github.com/surmon-china/vue-codemirror

import { Component, Mixins, Prop, Ref, Watch } from 'vue-property-decorator'
import BaseMixin from '../mixins/base'
import ThemeMixin from '../mixins/theme'
import { basicSetup } from 'codemirror'
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import { StreamLanguage } from '@codemirror/language'
import { klipper_config } from '@/plugins/StreamParserKlipperConfig'
import { gcode } from '@/plugins/StreamParserGcode'
import { indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { indentUnit } from '@codemirror/language'

@Component
export default class Codemirror extends Mixins(BaseMixin, ThemeMixin) {
    private content = ''
    private codemirror: null | EditorView = null
    private cminstance: null | EditorView = null

    @Ref('editor') editor!: HTMLElement

    @Prop({ required: false, default: '' })
    declare readonly code: string

    @Prop({ required: false, default: '' })
    declare value: string

    @Prop({ required: false, default: 'codemirror' })
    declare readonly name: string

    @Prop({ required: false, default: '' })
    declare readonly fileExtension: string

    @Prop({ required: false, default: false })
    declare readonly diffMode: boolean

    @Prop({ required: false, default: false })
    declare readonly readOnly: boolean

    @Prop({ required: false, default: () => [] })
    declare readonly highlightedLines: number[]

    @Prop({ required: false, default: 'none' })
    declare readonly highlightMode: 'none' | 'add' | 'remove'

    @Watch('value')
    valueChanged(newVal: string) {
        const cm_value = this.cminstance?.state?.doc.toString()
        if (newVal !== cm_value) {
            this.setCmValue(newVal)
        }
    }

    @Watch('highlightedLines', { deep: true })
    highlightedLinesChanged() {
        this.refreshEditorState()
    }

    @Watch('highlightMode')
    @Watch('diffMode')
    @Watch('readOnly')
    @Watch('fileExtension')
    editorConfigChanged() {
        this.refreshEditorState()
    }

    mounted(): void {
        this.initialize()
    }

    beforeDestroy() {
        this.destroy()
    }

    destroy() {
        this.cminstance?.destroy()
    }

    initialize() {
        this.codemirror = new EditorView({
            parent: this.editor,
        })
        this.cminstance = this.codemirror

        this.$nextTick(() => {
            this.setCmValue(this.code || this.value || this.content)

            this.$emit('ready', this.codemirror)
        })
    }

    setCmValue(content: string) {
        this.cminstance?.setState(EditorState.create({ doc: content, extensions: this.cmExtensions }))
    }

    refreshEditorState() {
        const currentValue = this.cminstance?.state?.doc.toString() ?? this.value ?? this.code ?? this.content
        this.setCmValue(currentValue)
    }

    get cmExtensions() {
        const extensions = [
            EditorView.theme({}, { dark: this.themeMode === 'dark' }),
            basicSetup,
            this.vscodeTheme,
            EditorState.readOnly.of(this.readOnly),
            EditorView.editable.of(!this.readOnly),
            indentUnit.of(' '.repeat(this.tabSize)),
            keymap.of([indentWithTab]),
            EditorView.updateListener.of((update) => {
                if (update.selectionSet) {
                    const line = this.cminstance?.state?.doc.lineAt(this.cminstance?.state?.selection.main.head).number
                    this.$emit('lineChange', line)
                }
                this.content = update.state?.doc.toString()
                if (this.$emit) {
                    this.$emit('input', this.content)
                }
            }),
        ]

        if (this.diffMode) {
            const diffLineDecorator = ViewPlugin.fromClass(
                class {
                    decorations

                    constructor(view: EditorView) {
                        this.decorations = this.buildDecorations(view)
                    }

                    update(update: any) {
                        if (update.docChanged || update.viewportChanged) {
                            this.decorations = this.buildDecorations(update.view)
                        }
                    }

                    buildDecorations(view: EditorView) {
                        const builder = new RangeSetBuilder<Decoration>()

                        for (const range of view.visibleRanges) {
                            let line = view.state.doc.lineAt(range.from)
                            while (line.from <= range.to) {
                                const text = line.text
                                if (text.startsWith('+') && !text.startsWith('+++')) {
                                    builder.add(line.from, line.from, Decoration.line({ class: 'cm-diff-add-line' }))
                                } else if (text.startsWith('-') && !text.startsWith('---')) {
                                    builder.add(line.from, line.from, Decoration.line({ class: 'cm-diff-remove-line' }))
                                }

                                if (line.to >= range.to) break
                                line = view.state.doc.line(line.number + 1)
                            }
                        }

                        return builder.finish()
                    }
                },
                {
                    decorations: (plugin) => plugin.decorations,
                }
            )

            extensions.push(
                diffLineDecorator,
                EditorView.theme({
                    '.cm-diff-add-line': {
                        backgroundColor: 'rgba(46, 160, 67, 0.18)',
                    },
                    '.cm-diff-remove-line': {
                        backgroundColor: 'rgba(248, 81, 73, 0.18)',
                    },
                })
            )
        }

        const normalizedHighlightedLines = (this.highlightedLines || [])
            .map((line) => Number(line))
            .filter((line) => Number.isInteger(line) && line > 0)

        if (this.highlightMode !== 'none' && normalizedHighlightedLines.length > 0) {
            const highlightedLineSet = new Set<number>(normalizedHighlightedLines)
            const lineClass = this.highlightMode === 'add' ? 'cm-split-add-line' : 'cm-split-remove-line'

            const highlightedLineDecorator = ViewPlugin.fromClass(
                class {
                    decorations

                    constructor(view: EditorView) {
                        this.decorations = this.buildDecorations(view)
                    }

                    update(update: any) {
                        if (update.docChanged || update.viewportChanged) {
                            this.decorations = this.buildDecorations(update.view)
                        }
                    }

                    buildDecorations(view: EditorView) {
                        const builder = new RangeSetBuilder<Decoration>()

                        for (const range of view.visibleRanges) {
                            let line = view.state.doc.lineAt(range.from)
                            while (line.from <= range.to) {
                                if (highlightedLineSet.has(line.number)) {
                                    builder.add(line.from, line.from, Decoration.line({ class: lineClass }))
                                }

                                if (line.to >= range.to) break
                                line = view.state.doc.line(line.number + 1)
                            }
                        }

                        return builder.finish()
                    }
                },
                {
                    decorations: (plugin) => plugin.decorations,
                }
            )

            extensions.push(
                highlightedLineDecorator,
                EditorView.theme({
                    '.cm-split-add-line': {
                        backgroundColor: 'rgba(46, 160, 67, 0.16)',
                    },
                    '.cm-split-remove-line': {
                        backgroundColor: 'rgba(248, 81, 73, 0.16)',
                    },
                })
            )
        }

        if (['cfg', 'conf'].includes(this.fileExtension)) extensions.push(StreamLanguage.define(klipper_config))
        else if (['gcode'].includes(this.fileExtension)) extensions.push(StreamLanguage.define(gcode))
        else if (['json'].includes(this.fileExtension)) extensions.push(json())
        else if (['css', 'scss', 'sass'].includes(this.fileExtension)) extensions.push(css())

        return extensions
    }

    visibilityChanged(isVisible: boolean) {
        if (isVisible) this.cminstance?.focus()
    }

    get tabSize() {
        return this.$store.state.gui.editor.tabSize || 2
    }

    get vscodeTheme() {
        return this.themeMode === 'dark' ? vscodeDark : vscodeLight
    }

    gotoLine(line: number) {
        const l = this.cminstance?.state?.doc.line(line)
        if (!l) return

        this.cminstance?.dispatch({
            selection: { head: l.from, anchor: l.to },
            scrollIntoView: true,
        })
    }
}
</script>
