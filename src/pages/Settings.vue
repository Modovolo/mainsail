<template>
    <v-container fluid class="pa-4">
        <v-row>
            <v-col cols="12" md="3">
                <!-- Settings Sidebar -->
                <v-card class="settings-sidebar">
                    <v-list dense nav>
                        <v-list-item class="py-3">
                            <v-list-item-avatar size="48">
                                <v-avatar size="48" color="primary">
                                    <v-icon size="28" dark>mdi-account</v-icon>
                                </v-avatar>
                            </v-list-item-avatar>
                            <v-list-item-content>
                                <v-list-item-title class="text-h6">{{ displayName }}</v-list-item-title>
                                <v-list-item-subtitle>{{ displayEmail }}</v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                        
                        <v-divider class="my-2" />
                        
                        <v-list-item-group v-model="activeTab" mandatory color="primary">
                            <v-list-item value="profile">
                                <v-list-item-icon>
                                    <v-icon>mdi-account-circle</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>Profile</v-list-item-title>
                                </v-list-item-content>
                            </v-list-item>
                            
                            <v-list-item value="groups">
                                <v-list-item-icon>
                                    <v-icon>mdi-account-group</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>Groups</v-list-item-title>
                                </v-list-item-content>
                                <v-list-item-action>
                                    <v-chip x-small>{{ groups.length }}</v-chip>
                                </v-list-item-action>
                            </v-list-item>
                            
                            <v-list-item value="security">
                                <v-list-item-icon>
                                    <v-icon>mdi-shield-account</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>Security</v-list-item-title>
                                </v-list-item-content>
                            </v-list-item>
                        </v-list-item-group>
                    </v-list>
                </v-card>
            </v-col>
            
            <v-col cols="12" md="9">
                <!-- Profile Tab -->
                <v-card v-if="activeTab === 'profile'" class="pa-4">
                    <v-card-title class="px-0 pt-0">
                        <v-icon class="mr-2">mdi-account-circle</v-icon>
                        Profile Settings
                    </v-card-title>
                    <v-card-text class="px-0">
                        <v-row>
                            <v-col cols="12" md="6">
                                <v-text-field
                                    v-model="profile.username"
                                    label="Username"
                                    outlined
                                    dense
                                    disabled
                                    hint="Username cannot be changed"
                                    persistent-hint
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-text-field
                                    v-model="profile.email"
                                    label="Email"
                                    outlined
                                    dense
                                    disabled
                                    hint="Email cannot be changed"
                                    persistent-hint
                                ></v-text-field>
                            </v-col>
                        </v-row>
                        <v-row>
                            <v-col cols="12">
                                <div class="text-body-2 grey--text">
                                    <v-icon small class="mr-1">mdi-information</v-icon>
                                    Account created: {{ profile.createdAt ? formatAccountDate(profile.createdAt) : 'Unknown' }}
                                </div>
                            </v-col>
                        </v-row>
                    </v-card-text>
                </v-card>
                
                <!-- Groups Tab -->
                <div v-if="activeTab === 'groups'">
                    <v-card class="pa-4 mb-4">
                        <v-card-title class="px-0 pt-0 d-flex align-center">
                            <v-icon class="mr-2">mdi-account-group</v-icon>
                            My Groups
                            <v-spacer></v-spacer>
                            <v-btn color="primary" @click="showCreateDialog = true">
                                <v-icon left>mdi-plus</v-icon>
                                Create Group
                            </v-btn>
                        </v-card-title>
                        <v-card-text class="px-0 pb-0">
                            <p class="text-body-2 grey--text mb-4">
                                Groups allow you to share printers with other users. Create a group, invite members by email, and assign your printers to the group.
                            </p>
                        </v-card-text>
                    </v-card>
                    
                    <!-- Loading State -->
                    <div v-if="loading" class="text-center py-8">
                        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
                        <div class="mt-4 text-subtitle-1 grey--text">Loading groups...</div>
                    </div>
                    
                    <!-- No Groups -->
                    <v-card v-else-if="groups.length === 0" class="pa-6 text-center">
                        <v-icon size="64" color="grey lighten-1">mdi-account-group-outline</v-icon>
                        <h3 class="text-h6 mt-4">No Groups Yet</h3>
                        <p class="text-body-2 grey--text mt-2">
                            Create a group to share printers with other users.
                        </p>
                        <v-btn color="primary" class="mt-4" @click="showCreateDialog = true">
                            <v-icon left>mdi-plus</v-icon>
                            Create Your First Group
                        </v-btn>
                    </v-card>
                    
                    <!-- Groups List -->
                    <v-card v-else>
                        <v-list two-line>
                            <template v-for="(group, index) in groups" :key="group.id">
                                <v-list-item @click="openGroupDetails(group)">
                                    <v-list-item-avatar>
                                        <v-avatar :color="getRoleColor(group.memberRole)" size="40">
                                            <v-icon dark>mdi-account-group</v-icon>
                                        </v-avatar>
                                    </v-list-item-avatar>
                                    <v-list-item-content>
                                        <v-list-item-title class="font-weight-medium">
                                            {{ group.name }}
                                        </v-list-item-title>
                                        <v-list-item-subtitle>
                                            {{ group.description || 'No description' }}
                                        </v-list-item-subtitle>
                                    </v-list-item-content>
                                    <v-list-item-action>
                                        <v-chip small :color="getRoleColor(group.memberRole)" text-color="white">
                                            {{ group.memberRole }}
                                        </v-chip>
                                    </v-list-item-action>
                                    <v-list-item-action>
                                        <v-btn icon small @click.stop="openGroupDetails(group)">
                                            <v-icon>mdi-chevron-right</v-icon>
                                        </v-btn>
                                    </v-list-item-action>
                                </v-list-item>
                                <v-divider v-if="index < groups.length - 1" :key="`divider-${group.id}`" />
                            </template>
                        </v-list>
                    </v-card>
                </div>
                
                <!-- Security Tab -->
                <v-card v-if="activeTab === 'security'" class="pa-4">
                    <v-card-title class="px-0 pt-0">
                        <v-icon class="mr-2">mdi-shield-account</v-icon>
                        Security Settings
                    </v-card-title>
                    <v-card-text class="px-0">
                        <v-list>
                            <v-list-item>
                                <v-list-item-icon>
                                    <v-icon>mdi-key</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>Change Password</v-list-item-title>
                                    <v-list-item-subtitle>Update your account password</v-list-item-subtitle>
                                </v-list-item-content>
                                <v-list-item-action>
                                    <v-btn text color="primary" @click="showPasswordDialog = true">Change</v-btn>
                                </v-list-item-action>
                            </v-list-item>
                            <v-divider inset />
                            <v-list-item>
                                <v-list-item-icon>
                                    <v-icon color="error">mdi-logout</v-icon>
                                </v-list-item-icon>
                                <v-list-item-content>
                                    <v-list-item-title>Sign Out</v-list-item-title>
                                    <v-list-item-subtitle>Sign out of your account on this device</v-list-item-subtitle>
                                </v-list-item-content>
                                <v-list-item-action>
                                    <v-btn text color="error" @click="handleLogout">Sign Out</v-btn>
                                </v-list-item-action>
                            </v-list-item>
                        </v-list>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Create Group Dialog -->
        <v-dialog v-model="showCreateDialog" max-width="500">
            <v-card>
                <v-card-title>
                    <v-icon class="mr-2">mdi-plus-circle</v-icon>
                    Create New Group
                </v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="newGroup.name"
                        label="Group Name"
                        outlined
                        dense
                        class="mb-2"
                    ></v-text-field>
                    <v-textarea
                        v-model="newGroup.description"
                        label="Description (optional)"
                        outlined
                        dense
                        rows="3"
                    ></v-textarea>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="showCreateDialog = false">Cancel</v-btn>
                    <v-btn color="primary" :loading="creating" :disabled="!newGroup.name" @click="createGroup">
                        Create
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Group Details Dialog -->
        <v-dialog v-model="showDetailsDialog" max-width="800" scrollable>
            <v-card v-if="selectedGroup">
                <v-card-title class="d-flex align-center">
                    <v-icon class="mr-2">mdi-account-group</v-icon>
                    {{ selectedGroup.name }}
                    <v-spacer></v-spacer>
                    <v-chip small :color="getRoleColor(selectedGroup.userRole)" text-color="white">
                        {{ selectedGroup.userRole }}
                    </v-chip>
                    <v-btn icon @click="showDetailsDialog = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                </v-card-title>
                
                <v-card-text class="pb-0">
                    <p v-if="selectedGroup.description" class="text-body-1 mb-4">
                        {{ selectedGroup.description }}
                    </p>
                    
                    <v-tabs v-model="detailsTab">
                        <v-tab>Members ({{ selectedGroup.members?.length || 0 }})</v-tab>
                        <v-tab>Printers ({{ selectedGroup.printers?.length || 0 }})</v-tab>
                    </v-tabs>
                    
                    <v-tabs-items v-model="detailsTab">
                        <!-- Members Tab -->
                        <v-tab-item>
                            <div class="py-4">
                                <!-- Invite by Email -->
                                <div v-if="selectedGroup.userRole !== 'member'" class="mb-4">
                                    <v-text-field
                                        v-model="inviteEmail"
                                        label="Invite by email address"
                                        placeholder="user@example.com"
                                        outlined
                                        dense
                                        append-icon="mdi-send"
                                        hint="Enter the email address of the user you want to invite"
                                        @click:append="inviteMember"
                                        @keyup.enter="inviteMember"
                                    ></v-text-field>
                                </div>
                                
                                <v-list>
                                    <v-list-item v-for="member in selectedGroup.members" :key="member.id">
                                        <v-list-item-avatar>
                                            <v-icon :color="getRoleColor(member.role)">mdi-account</v-icon>
                                        </v-list-item-avatar>
                                        <v-list-item-content>
                                            <v-list-item-title>{{ member.username }}</v-list-item-title>
                                            <v-list-item-subtitle>
                                                {{ member.email || 'No email' }} · Joined {{ formatRelativeDate(member.joinedAt) }}
                                            </v-list-item-subtitle>
                                        </v-list-item-content>
                                        <v-list-item-action>
                                            <v-chip x-small :color="getRoleColor(member.role)" text-color="white">
                                                {{ member.role }}
                                            </v-chip>
                                        </v-list-item-action>
                                        <v-list-item-action v-if="selectedGroup.userRole === 'owner' && member.role !== 'owner'">
                                            <v-menu offset-y>
                                                <template #activator="{ on, attrs }">
                                                    <v-btn icon small v-bind="attrs" v-on="on">
                                                        <v-icon small>mdi-dots-vertical</v-icon>
                                                    </v-btn>
                                                </template>
                                                <v-list dense>
                                                    <v-list-item @click="updateMemberRole(member, member.role === 'admin' ? 'member' : 'admin')">
                                                        <v-list-item-icon>
                                                            <v-icon small>mdi-shield-account</v-icon>
                                                        </v-list-item-icon>
                                                        <v-list-item-title>
                                                            {{ member.role === 'admin' ? 'Demote to Member' : 'Promote to Admin' }}
                                                        </v-list-item-title>
                                                    </v-list-item>
                                                    <v-list-item @click="removeMember(member)">
                                                        <v-list-item-icon>
                                                            <v-icon small color="error">mdi-account-remove</v-icon>
                                                        </v-list-item-icon>
                                                        <v-list-item-title class="error--text">Remove</v-list-item-title>
                                                    </v-list-item>
                                                </v-list>
                                            </v-menu>
                                        </v-list-item-action>
                                    </v-list-item>
                                </v-list>
                            </div>
                        </v-tab-item>
                        
                        <!-- Printers Tab -->
                        <v-tab-item>
                            <div class="py-4">
                                <div v-if="ownedPrinters.length > 0" class="mb-4">
                                    <v-select
                                        v-model="printersToAssign"
                                        :items="ownedPrinters"
                                        item-text="name"
                                        item-value="id"
                                        label="Select printers to assign to this group"
                                        outlined
                                        dense
                                        clearable
                                        multiple
                                        chips
                                        deletable-chips
                                        small-chips
                                    />
                                    <v-btn
                                        color="primary"
                                        :disabled="printersToAssign.length === 0"
                                        :loading="assigningPrinters"
                                        class="mt-2"
                                        @click="assignPrinters"
                                    >
                                        <v-icon left>mdi-plus</v-icon>
                                        Assign {{ printersToAssign.length }} Printer{{ printersToAssign.length !== 1 ? 's' : '' }}
                                    </v-btn>
                                </div>
                                
                                <v-list v-if="selectedGroup.printers && selectedGroup.printers.length > 0">
                                    <v-list-item v-for="printer in selectedGroup.printers" :key="printer.id">
                                        <v-list-item-avatar>
                                            <v-icon color="primary">mdi-printer-3d</v-icon>
                                        </v-list-item-avatar>
                                        <v-list-item-content>
                                            <v-list-item-title>{{ printer.name }}</v-list-item-title>
                                            <v-list-item-subtitle>ID: {{ printer.printerId }}</v-list-item-subtitle>
                                        </v-list-item-content>
                                        <v-list-item-action v-if="isMyPrinter(printer)">
                                            <v-btn icon small color="error" @click="removePrinterFromGroup(printer)">
                                                <v-icon small>mdi-link-off</v-icon>
                                            </v-btn>
                                        </v-list-item-action>
                                    </v-list-item>
                                </v-list>
                                <div v-else class="text-center py-6 grey--text">
                                    <v-icon size="48" color="grey lighten-1">mdi-printer-3d-off</v-icon>
                                    <div class="mt-2">No printers assigned to this group yet.</div>
                                </div>
                            </div>
                        </v-tab-item>
                    </v-tabs-items>
                </v-card-text>
                
                <v-card-actions>
                    <v-btn v-if="selectedGroup.userRole === 'owner'" color="error" text @click="confirmDelete(selectedGroup)">
                        <v-icon left>mdi-delete</v-icon>
                        Delete Group
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-btn text @click="showDetailsDialog = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="showDeleteDialog" max-width="400">
            <v-card>
                <v-card-title class="error--text">
                    <v-icon class="mr-2" color="error">mdi-alert</v-icon>
                    Delete Group
                </v-card-title>
                <v-card-text>
                    Are you sure you want to delete <strong>{{ groupToDelete?.name }}</strong>?
                    This action cannot be undone. All printers will be unassigned from this group.
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="showDeleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" :loading="deleting" @click="deleteGroup">Delete</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Change Password Dialog -->
        <v-dialog v-model="showPasswordDialog" max-width="450" persistent>
            <v-card>
                <v-card-title>
                    <v-icon class="mr-2">mdi-key</v-icon>
                    Change Password
                </v-card-title>
                <v-card-text>
                    <v-form ref="passwordForm" v-model="passwordFormValid">
                        <v-text-field
                            v-model="passwordData.currentPassword"
                            label="Current Password"
                            :type="showCurrentPassword ? 'text' : 'password'"
                            :append-icon="showCurrentPassword ? 'mdi-eye' : 'mdi-eye-off'"
                            outlined
                            dense
                            :rules="[rules.required, rules.minLength]"
                            class="mb-2"
                            @click:append="showCurrentPassword = !showCurrentPassword"
                        ></v-text-field>
                        <v-text-field
                            v-model="passwordData.newPassword"
                            label="New Password"
                            :type="showNewPassword ? 'text' : 'password'"
                            :append-icon="showNewPassword ? 'mdi-eye' : 'mdi-eye-off'"
                            outlined
                            dense
                            :rules="[rules.required, rules.minLength]"
                            hint="Must be at least 8 characters"
                            class="mb-2"
                            @click:append="showNewPassword = !showNewPassword"
                        ></v-text-field>
                        <v-text-field
                            v-model="passwordData.confirmPassword"
                            label="Confirm New Password"
                            :type="showConfirmPassword ? 'text' : 'password'"
                            :append-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
                            outlined
                            dense
                            :rules="[rules.required, rules.minLength, rules.passwordMatch]"
                            @click:append="showConfirmPassword = !showConfirmPassword"
                        ></v-text-field>
                    </v-form>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn text @click="closePasswordDialog">Cancel</v-btn>
                    <v-btn 
                        color="primary" 
                        :loading="changingPassword" 
                        :disabled="!passwordFormValid"
                        @click="changePassword"
                    >
                        Change Password
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import axios from 'axios'

interface GroupMember {
    id: string
    groupId: string
    userId: string
    role: string
    joinedAt: string
    username: string
    email?: string
}

interface GroupPrinter {
    id: string
    printerId: string
    name: string
    ownerId: string
}

interface Group {
    id: string
    name: string
    description?: string
    createdBy: string
    createdAt: string
    memberRole?: string
    userRole?: string
    members?: GroupMember[]
    printers?: GroupPrinter[]
}

interface OwnedPrinter {
    id: string
    printerId: string
    name: string
    groupId?: string
}

interface UserProfile {
    username: string
    email: string
    id: string
    role?: string
    createdAt?: string
}

@Component
class PageSettings extends Mixins(BaseMixin) {
    activeTab = 'profile'
    groups: Group[] = []
    loading = true
    creating = false
    deleting = false

    showCreateDialog = false
    showDetailsDialog = false
    showDeleteDialog = false
    showPasswordDialog = false

    newGroup = { name: '', description: '' }
    selectedGroup: Group | null = null
    groupToDelete: Group | null = null
    detailsTab = 0

    inviteEmail = ''
    printersToAssign: string[] = []
    assigningPrinters = false
    ownedPrinters: OwnedPrinter[] = []
    
    // Password change properties
    changingPassword = false
    passwordFormValid = false
    showCurrentPassword = false
    showNewPassword = false
    showConfirmPassword = false
    passwordData = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    }
    
    rules = {
        required: (v: string) => !!v || 'Required',
        minLength: (v: string) => (v && v.length >= 8) || 'Must be at least 8 characters',
        passwordMatch: (v: string) => v === this.passwordData.newPassword || 'Passwords do not match'
    }
    
    profile: UserProfile = {
        username: '',
        email: '',
        id: '',
        role: '',
        createdAt: ''
    }

    get displayName(): string {
        const storeUser = this.$store.state.auth?.user
        if (storeUser?.username) return storeUser.username
        if (this.profile.username) return this.profile.username
        return 'User'
    }

    get displayEmail(): string {
        const storeUser = this.$store.state.auth?.user
        if (storeUser?.email) return storeUser.email
        if (this.profile.email) return this.profile.email
        return 'Not available'
    }

    async mounted() {
        await this.loadProfile()
        await this.loadGroups()
        await this.loadOwnedPrinters()
    }

    async loadProfile(): Promise<void> {
        const token = localStorage.getItem('fleet_token')
        if (!token) return

        try {
            const response = await axios.get('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.profile = {
                username: response.data.user.username,
                email: response.data.user.email || '',
                id: response.data.user.id,
                role: response.data.user.role,
                createdAt: response.data.user.createdAt || response.data.user.created_at
            }
        } catch (error) {
            console.error('Failed to load profile:', error)
        }
    }

    async loadGroups(): Promise<void> {
        this.loading = true
        const token = localStorage.getItem('fleet_token')
        if (!token) {
            this.loading = false
            return
        }

        try {
            const response = await axios.get('/api/groups', {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.groups = response.data.groups || []
        } catch (error) {
            console.error('Failed to load groups:', error)
            this.$toast.error('Failed to load groups')
        } finally {
            this.loading = false
        }
    }

    async loadOwnedPrinters(): Promise<void> {
        const token = localStorage.getItem('fleet_token')
        if (!token) return

        try {
            const response = await axios.get('/api/printers', {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.ownedPrinters = (response.data.printers || []).filter(
                (p: OwnedPrinter) => !p.groupId
            )
        } catch (error) {
            console.error('Failed to load owned printers:', error)
        }
    }

    async createGroup(): Promise<void> {
        if (!this.newGroup.name) return

        this.creating = true
        const token = localStorage.getItem('fleet_token')

        try {
            await axios.post('/api/groups', this.newGroup, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Group created successfully')
            this.showCreateDialog = false
            this.newGroup = { name: '', description: '' }
            await this.loadGroups()
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to create group')
        } finally {
            this.creating = false
        }
    }

    async openGroupDetails(group: Group): Promise<void> {
        const token = localStorage.getItem('fleet_token')
        if (!token) return

        try {
            const response = await axios.get(`/api/groups/${group.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.selectedGroup = response.data.group
            this.detailsTab = 0
            this.showDetailsDialog = true
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to load group details')
        }
    }

    async inviteMember(): Promise<void> {
        if (!this.inviteEmail || !this.selectedGroup) return

        const token = localStorage.getItem('fleet_token')

        try {
            await axios.post(`/api/groups/${this.selectedGroup.id}/members`, {
                user: this.inviteEmail,
                role: 'member'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Member added successfully')
            this.inviteEmail = ''
            await this.openGroupDetails(this.selectedGroup)
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to add member. Make sure the email is registered.')
        }
    }

    async updateMemberRole(member: GroupMember, newRole: string): Promise<void> {
        if (!this.selectedGroup) return

        const token = localStorage.getItem('fleet_token')

        try {
            await axios.put(`/api/groups/${this.selectedGroup.id}/members/${member.id}`, {
                role: newRole
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Member role updated')
            await this.openGroupDetails(this.selectedGroup)
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to update member role')
        }
    }

    async removeMember(member: GroupMember): Promise<void> {
        if (!this.selectedGroup) return

        const token = localStorage.getItem('fleet_token')

        try {
            await axios.delete(`/api/groups/${this.selectedGroup.id}/members/${member.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Member removed')
            await this.openGroupDetails(this.selectedGroup)
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to remove member')
        }
    }

    async assignPrinters(): Promise<void> {
        if (this.printersToAssign.length === 0 || !this.selectedGroup) return

        const token = localStorage.getItem('fleet_token')
        this.assigningPrinters = true

        try {
            let successCount = 0
            let failCount = 0
            
            for (const printerId of this.printersToAssign) {
                try {
                    await axios.post(`/api/groups/${this.selectedGroup.id}/printers`, {
                        printerId
                    }, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    successCount++
                } catch {
                    failCount++
                }
            }
            
            if (successCount > 0) {
                this.$toast.success(`${successCount} printer${successCount !== 1 ? 's' : ''} assigned to group`)
            }
            if (failCount > 0) {
                this.$toast.error(`Failed to assign ${failCount} printer${failCount !== 1 ? 's' : ''}`)
            }
            
            this.printersToAssign = []
            await this.loadOwnedPrinters()
            await this.openGroupDetails(this.selectedGroup)
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to assign printers')
        } finally {
            this.assigningPrinters = false
        }
    }

    async removePrinterFromGroup(printer: GroupPrinter): Promise<void> {
        if (!this.selectedGroup) return

        const token = localStorage.getItem('fleet_token')

        try {
            await axios.delete(`/api/groups/${this.selectedGroup.id}/printers/${printer.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Printer removed from group')
            await this.loadOwnedPrinters()
            await this.openGroupDetails(this.selectedGroup)
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to remove printer')
        }
    }

    isMyPrinter(printer: GroupPrinter): boolean {
        const userId = this.profile.id || this.$store.state.auth?.user?.id
        return printer.ownerId === userId
    }

    confirmDelete(group: Group): void {
        this.groupToDelete = group
        this.showDetailsDialog = false
        this.showDeleteDialog = true
    }

    async deleteGroup(): Promise<void> {
        if (!this.groupToDelete) return

        this.deleting = true
        const token = localStorage.getItem('fleet_token')

        try {
            await axios.delete(`/api/groups/${this.groupToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Group deleted')
            this.showDeleteDialog = false
            this.groupToDelete = null
            await this.loadGroups()
        } catch (error: any) {
            this.$toast.error(error.response?.data?.error || 'Failed to delete group')
        } finally {
            this.deleting = false
        }
    }

    closePasswordDialog(): void {
        this.showPasswordDialog = false
        this.passwordData = {
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        }
        this.showCurrentPassword = false
        this.showNewPassword = false
        this.showConfirmPassword = false
    }

    async changePassword(): Promise<void> {
        if (!this.passwordFormValid) return
        if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
            this.$toast.error('Passwords do not match')
            return
        }

        this.changingPassword = true
        const token = localStorage.getItem('fleet_token')

        try {
            await axios.post('/api/auth/change-password', {
                currentPassword: this.passwordData.currentPassword,
                newPassword: this.passwordData.newPassword
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            this.$toast.success('Password changed successfully')
            this.closePasswordDialog()
        } catch (error: any) {
            const message = error.response?.data?.error || 'Failed to change password'
            this.$toast.error(message)
        } finally {
            this.changingPassword = false
        }
    }

    async handleLogout(): Promise<void> {
        try {
            const token = localStorage.getItem('fleet_token')
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` }
                })
            }
        } catch (error) {
            console.error('Logout error:', error)
        } finally {
            localStorage.removeItem('fleet_token')
            localStorage.removeItem('fleet_refresh_token')
            this.$store.commit('auth/clearAuth')
            this.$router.push('/login')
        }
    }

    getRoleColor(role?: string): string {
        if (!role) return 'grey'
        const colors: Record<string, string> = {
            owner: 'amber darken-2',
            admin: 'blue',
            member: 'grey'
        }
        return colors[role] || 'grey'
    }

    formatAccountDate(dateString?: string): string {
        if (!dateString) return 'Unknown'
        return new Date(dateString).toLocaleDateString()
    }

    formatRelativeDate(dateString: string): string {
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'today'
        if (diffDays === 1) return 'yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
        return date.toLocaleDateString()
    }
}

export default PageSettings
</script>

<style scoped>
.settings-sidebar {
    position: sticky;
    top: 80px;
}
</style>
