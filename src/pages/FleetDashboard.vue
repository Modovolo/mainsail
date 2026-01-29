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
        </v-row>

        <!-- Loading State -->
        <v-row v-if="loading" class="mt-6">
            <v-col cols="12" class="text-center">
                <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
                <div class="mt-4 text-subtitle-1 grey--text">Loading your printers...</div>
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
