<template>
    <v-dialog v-model="show" max-width="900" scrollable>
        <v-card class="transfer-dialog">
            <v-card-title class="headline">
                Manage Printer Groups
                <v-spacer></v-spacer>
                <v-btn icon @click="show = false">
                    <v-icon>{{ mdiClose }}</v-icon>
                </v-btn>
            </v-card-title>
            <v-card-text style="height: 500px;" class="pt-4">
                <v-row class="fill-height align-center">
                    <!-- Left Side -->
                    <v-col cols="5" class="fill-height d-flex flex-column">
                        <v-select
                            v-model="leftGroup"
                            :items="groupOptions"
                            label="Group A"
                            hide-details
                            class="mb-2"
                            dense
                            outlined
                        ></v-select>
                        <v-card outlined class="flex-grow-1 overflow-y-auto group-list">
                            <v-list dense v-if="leftPrinters.length > 0">
                                <v-list-item-group v-model="leftSelection" multiple>
                                    <v-list-item v-for="printer in leftPrinters" :key="printer.id" :value="printer.id">
                                        <template v-slot:default="{ active }">
                                            <v-list-item-action class="mr-3">
                                                <v-checkbox :input-value="active"></v-checkbox>
                                            </v-list-item-action>
                                            <v-list-item-content>
                                                <v-list-item-title>{{ printer.name }}</v-list-item-title>
                                                <v-list-item-subtitle class="caption">{{ printer.state }}</v-list-item-subtitle>
                                            </v-list-item-content>
                                        </template>
                                    </v-list-item>
                                </v-list-item-group>
                            </v-list>
                            <div v-else class="d-flex align-center justify-center fill-height caption grey--text">
                                No printers in this group
                            </div>
                        </v-card>
                        <div class="caption text-right mt-1">{{ leftSelection.length }} selected</div>
                    </v-col>

                    <!-- Middle: Actions -->
                    <v-col cols="2" class="d-flex flex-column align-center justify-center">
                        <v-btn 
                            icon 
                            x-large 
                            @click="moveToRight" 
                            :disabled="leftSelection.length === 0 || leftGroup === rightGroup"
                            color="primary"
                        >
                            <v-icon>{{ mdiArrowRightBold }}</v-icon>
                        </v-btn>
                        <v-btn 
                            icon 
                            x-large 
                            @click="moveToLeft" 
                            :disabled="rightSelection.length === 0 || leftGroup === rightGroup"
                            color="primary"
                            class="mt-4"
                        >
                            <v-icon>{{ mdiArrowLeftBold }}</v-icon>
                        </v-btn>
                    </v-col>

                    <!-- Right Side -->
                    <v-col cols="5" class="fill-height d-flex flex-column">
                        <v-select
                            v-model="rightGroup"
                            :items="groupOptions"
                            label="Group B"
                            hide-details
                            class="mb-2"
                            dense
                            outlined
                        ></v-select>
                        <v-card outlined class="flex-grow-1 overflow-y-auto group-list">
                            <v-list dense v-if="rightPrinters.length > 0">
                                <v-list-item-group v-model="rightSelection" multiple>
                                    <v-list-item v-for="printer in rightPrinters" :key="printer.id" :value="printer.id">
                                        <template v-slot:default="{ active }">
                                            <v-list-item-action class="mr-3">
                                                <v-checkbox :input-value="active"></v-checkbox>
                                            </v-list-item-action>
                                            <v-list-item-content>
                                                <v-list-item-title>{{ printer.name }}</v-list-item-title>
                                                <v-list-item-subtitle class="caption">{{ printer.state }}</v-list-item-subtitle>
                                            </v-list-item-content>
                                        </template>
                                    </v-list-item>
                                </v-list-item-group>
                            </v-list>
                            <div v-else class="d-flex align-center justify-center fill-height caption grey--text">
                                No printers in this group
                            </div>
                        </v-card>
                        <div class="caption text-right mt-1">{{ rightSelection.length }} selected</div>
                    </v-col>
                </v-row>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text @click="show = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { mdiArrowLeftBold, mdiArrowRightBold, mdiClose } from '@mdi/js'

interface PrinterTableItem {
    id: string
    name: string
    state: string
    job_name: string
    group: string | null
}

@Component
export default class PrinterGroupTransferDialog extends Vue {
    @Prop({ type: Boolean, default: false }) public value!: boolean
    @Prop({ type: Array, default: () => [] }) public allPrinters!: PrinterTableItem[]
    @Prop({ type: Array, default: () => [] }) public availableGroups!: string[]

    public leftGroup: string | null = 'Ungrouped'
    public rightGroup: string | null = null
    public leftSelection: string[] = []
    public rightSelection: string[] = []

    public mdiArrowLeftBold = mdiArrowLeftBold
    public mdiArrowRightBold = mdiArrowRightBold
    public mdiClose = mdiClose

    get show() {
        return this.value
    }

    set show(val: boolean) {
        this.$emit('input', val)
    }

    get groupOptions() {
        return this.availableGroups
    }

    get leftPrinters() {
        return this.getPrintersInGroup(this.leftGroup)
    }

    get rightPrinters() {
        return this.getPrintersInGroup(this.rightGroup)
    }

    getPrintersInGroup(groupName: string | null) {
        const target = (groupName === 'Ungrouped') ? null : groupName
        return this.allPrinters.filter(p => {
            const g = p.group || null
            return g === target
        })
    }

    async moveToRight() {
        await this.movePrinters(this.leftSelection, this.rightGroup)
        this.leftSelection = []
    }

    async moveToLeft() {
        await this.movePrinters(this.rightSelection, this.leftGroup)
        this.rightSelection = []
    }

    async movePrinters(printerIds: string[], targetGroup: string | null) {
        const groupValue = (targetGroup === 'Ungrouped') ? '' : (targetGroup || '')
        
        const promises = printerIds.map(id => 
            this.$store.dispatch('gui/remoteprinters/updateSettings', {
                id,
                values: { group: groupValue }
            })
        )
        
        try {
            await Promise.all(promises)
            this.$toast.success(`Moved ${printerIds.length} printer(s)`)
        } catch (e) {
            console.error('Failed to move printers', e)
            this.$toast.error('Failed to move printers')
        }
    }
}
</script>

<style scoped>
.group-list {
    border-color: rgba(255, 255, 255, 0.12);
}
</style>
