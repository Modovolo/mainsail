<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <h1 class="text-h4 mb-6">
                    <v-icon large class="mr-2">mdi-view-dashboard</v-icon>
                    Fleet Dashboard
                </h1>
            </v-col>
        </v-row>

        <v-row>
            <!-- Printers Count Card -->
            <v-col cols="12" md="6">
                <v-card class="dashboard-card" elevation="2">
                    <v-card-title class="primary white--text">
                        <v-icon large class="mr-3" color="white">mdi-printer-3d</v-icon>
                        <span>My Printers</span>
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <div class="d-flex align-center justify-space-between">
                            <div>
                                <div class="text-h2 font-weight-bold primary--text">
                                    {{ printerCount }}
                                </div>
                                <div class="text-subtitle-1 grey--text">
                                    {{ printerCount === 1 ? 'Printer' : 'Printers' }} Registered
                                </div>
                            </div>
                            <v-icon size="80" color="primary" class="opacity-20">
                                mdi-printer-3d-nozzle
                            </v-icon>
                        </div>
                        <v-divider class="my-4"></v-divider>
                        <v-btn block color="primary" outlined to="/my-printers">
                            <v-icon left>mdi-view-list</v-icon>
                            View All Printers
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>

            <!-- Register Printer Card -->
            <v-col cols="12" md="6">
                <v-card class="dashboard-card" elevation="2" color="green lighten-5">
                    <v-card-title class="green darken-1 white--text">
                        <v-icon large class="mr-3" color="white">mdi-plus-circle</v-icon>
                        <span>Register Printer</span>
                    </v-card-title>
                    <v-card-text class="pa-6">
                        <div class="text-body-1 mb-4">
                            Add a new printer to your fleet by generating a registration key.
                        </div>
                        <div class="text-body-2 grey--text mb-6">
                            <v-icon small class="mr-1">mdi-email</v-icon>
                            A registration key will be sent to your email address
                        </div>
                        <v-btn block color="green darken-1" dark large to="/register-printer">
                            <v-icon left>mdi-printer-3d-nozzle-plus</v-icon>
                            Register New Printer
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <!-- Loading State -->
        <v-row v-if="loading" class="mt-6">
            <v-col cols="12" class="text-center">
                <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
                <div class="mt-4 text-subtitle-1 grey--text">Loading your printers...</div>
            </v-col>
        </v-row>

        <!-- Recent Printers -->
        <v-row v-if="!loading && printers.length > 0" class="mt-6">
            <v-col cols="12">
                <v-card>
                    <v-card-title>
                        <v-icon class="mr-2">mdi-history</v-icon>
                        Recent Printers
                    </v-card-title>
                    <v-divider></v-divider>
                    <v-list>
                        <v-list-item
                            v-for="printer in recentPrinters"
                            :key="printer.printerId"
                            :to="`/?printer=${printer.printerId}`"
                        >
                            <v-list-item-avatar>
                                <v-icon :color="printer.isActive ? 'success' : 'grey'">
                                    mdi-printer-3d
                                </v-icon>
                            </v-list-item-avatar>
                            <v-list-item-content>
                                <v-list-item-title>{{ printer.name }}</v-list-item-title>
                                <v-list-item-subtitle>
                                    Added {{ formatDate(printer.createdAt) }}
                                </v-list-item-subtitle>
                            </v-list-item-content>
                            <v-list-item-action>
                                <v-chip :color="printer.isActive ? 'success' : 'grey'" small>
                                    {{ printer.isActive ? 'Active' : 'Inactive' }}
                                </v-chip>
                            </v-list-item-action>
                        </v-list-item>
                    </v-list>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import axios from 'axios'

interface Printer {
    id: string
    printerId: string
    name: string
    host?: string
    port?: number
    createdAt: string
    lastConnected?: string
    isActive: boolean
}

@Component
export default class FleetDashboard extends Mixins(BaseMixin) {
    printers: Printer[] = []
    loading = true

    get printerCount(): number {
        return this.printers.length
    }

    get recentPrinters(): Printer[] {
        return this.printers.slice(0, 5)
    }

    async mounted() {
        await this.loadPrinters()
    }

    async loadPrinters() {
        this.loading = true
        try {
            const token = localStorage.getItem('fleet_token')
            if (!token) {
                this.$router.push('/login')
                return
            }

            const response = await axios.get('/api/printers', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            this.printers = response.data.printers || []
        } catch (error: any) {
            console.error('Failed to load printers:', error)
            this.$toast.error('Failed to load printers')
        } finally {
            this.loading = false
        }
    }

    formatDate(dateString: string): string {
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'Today'
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
        return date.toLocaleDateString()
    }
}
</script>

<style scoped>
.dashboard-card {
    height: 100%;
}

.opacity-20 {
    opacity: 0.2;
}
</style>
