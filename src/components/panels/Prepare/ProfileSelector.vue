<template>
    <div class="profile-selector">
        <v-row dense align="center">
            <v-col>
                <v-select
                    v-model="selectedProfileId"
                    :items="profileOptions"
                    label="Profile"
                    outlined
                    dense
                    hide-details
                    :prepend-inner-icon="mdiContentSaveSettings"
                    @change="onProfileSelect">
                    <template #selection="{ item }">
                        <span class="text-truncate">{{ item.text }}</span>
                        <v-chip v-if="item.quality" x-small class="ml-2" :color="qualityColor(item.quality)">
                            {{ item.quality }}
                        </v-chip>
                    </template>
                    <template #item="{ item, on, attrs }">
                        <v-list-item v-bind="attrs" v-on="on">
                            <v-list-item-content>
                                <v-list-item-title>{{ item.text }}</v-list-item-title>
                                <v-list-item-subtitle v-if="item.description">
                                    {{ item.description }}
                                </v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action v-if="item.deletable">
                                <v-btn icon x-small @click.stop="deleteProfile(item.value)">
                                    <v-icon x-small>{{ mdiDelete }}</v-icon>
                                </v-btn>
                            </v-list-item-action>
                        </v-list-item>
                    </template>
                </v-select>
            </v-col>
            <v-col cols="auto">
                <v-btn icon small @click="showSaveDialog = true" title="Save as Profile">
                    <v-icon small>{{ mdiContentSavePlus }}</v-icon>
                </v-btn>
            </v-col>
        </v-row>

        <!-- Save Profile Dialog -->
        <v-dialog v-model="showSaveDialog" max-width="400">
            <v-card>
                <v-card-title>Save Profile</v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="newProfileName"
                        label="Profile Name"
                        outlined
                        dense
                        autofocus
                        :rules="[v => !!v || 'Name is required']" />
                    <v-textarea
                        v-model="newProfileDescription"
                        label="Description (optional)"
                        outlined
                        dense
                        rows="2" />
                    <v-select
                        v-model="newProfileMaterial"
                        :items="materialOptions"
                        label="Material (optional)"
                        outlined
                        dense
                        clearable />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showSaveDialog = false">Cancel</v-btn>
                    <v-btn color="primary" :disabled="!newProfileName" @click="saveProfile">Save</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Delete Confirmation -->
        <v-dialog v-model="showDeleteDialog" max-width="300">
            <v-card>
                <v-card-title class="text-subtitle-1">Delete Profile?</v-card-title>
                <v-card-text>
                    This will permanently delete "{{ profileToDelete?.name }}".
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showDeleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" @click="confirmDelete">Delete</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    mdiContentSaveSettings,
    mdiContentSavePlus,
    mdiDelete,
} from '@mdi/js'
import { SliceProfile } from '@/store/prepare/types'

interface ProfileOption {
    text: string
    value: string
    description?: string
    quality?: string
    deletable?: boolean
}

@Component
export default class ProfileSelector extends Mixins(BaseMixin) {
    mdiContentSaveSettings = mdiContentSaveSettings
    mdiContentSavePlus = mdiContentSavePlus
    mdiDelete = mdiDelete

    selectedProfileId: string | null = null
    showSaveDialog = false
    showDeleteDialog = false
    profileToDelete: SliceProfile | null = null

    newProfileName = ''
    newProfileDescription = ''
    newProfileMaterial = ''

    materialOptions = [
        { text: 'PLA', value: 'PLA' },
        { text: 'PETG', value: 'PETG' },
        { text: 'ABS', value: 'ABS' },
        { text: 'TPU', value: 'TPU' },
        { text: 'ASA', value: 'ASA' },
        { text: 'Nylon', value: 'Nylon' },
    ]

    get profiles(): SliceProfile[] {
        return this.$store.state.prepare.profiles
    }

    get activeProfileId(): string | null {
        return this.$store.state.prepare.activeProfileId
    }

    get profileOptions(): ProfileOption[] {
        const defaults: ProfileOption[] = [
            { text: 'Default - Draft', value: 'default-draft', quality: 'draft' },
            { text: 'Default - Normal', value: 'default-normal', quality: 'normal' },
            { text: 'Default - Fine', value: 'default-fine', quality: 'fine' },
            { text: 'Default - Ultra', value: 'default-ultra', quality: 'ultra' },
        ]

        const custom: ProfileOption[] = this.profiles.map((p) => ({
            text: p.name,
            value: p.id,
            description: p.description,
            quality: p.quality,
            deletable: true,
        }))

        if (custom.length > 0) {
            return [
                { text: '── Saved Profiles ──', value: '', disabled: true } as any,
                ...custom,
                { text: '── Defaults ──', value: '', disabled: true } as any,
                ...defaults,
            ]
        }

        return defaults
    }

    @Watch('activeProfileId', { immediate: true })
    onActiveProfileChange(): void {
        this.selectedProfileId = this.activeProfileId
    }

    qualityColor(quality: string): string {
        switch (quality) {
            case 'draft':
                return 'grey'
            case 'normal':
                return 'info'
            case 'fine':
                return 'success'
            case 'ultra':
                return 'primary'
            default:
                return ''
        }
    }

    onProfileSelect(profileId: string): void {
        if (!profileId || profileId.startsWith('default-')) {
            // Handle default profiles
            const quality = profileId?.replace('default-', '') || 'normal'
            this.$store.commit('prepare/setQualityPreset', quality)
            this.$store.commit('prepare/setActiveProfile', null)
        } else {
            this.$store.dispatch('prepare/loadProfile', profileId)
        }
    }

    saveProfile(): void {
        if (!this.newProfileName) return

        this.$store.dispatch('prepare/saveProfile', {
            name: this.newProfileName,
            description: this.newProfileDescription || undefined,
            material: this.newProfileMaterial || undefined,
        })

        this.showSaveDialog = false
        this.newProfileName = ''
        this.newProfileDescription = ''
        this.newProfileMaterial = ''
    }

    deleteProfile(profileId: string): void {
        this.profileToDelete = this.profiles.find((p) => p.id === profileId) || null
        if (this.profileToDelete) {
            this.showDeleteDialog = true
        }
    }

    confirmDelete(): void {
        if (this.profileToDelete) {
            this.$store.commit('prepare/deleteProfile', this.profileToDelete.id)
            this.profileToDelete = null
        }
        this.showDeleteDialog = false
    }
}
</script>

<style scoped>
.profile-selector {
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
}
</style>
