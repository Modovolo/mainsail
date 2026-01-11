<template>
    <v-container>
        <v-row>
            <v-col cols="12" md="8" offset-md="2" lg="6" offset-lg="3">
                <v-card>
                    <v-card-title class="d-flex align-center primary white--text">
                        <v-btn icon dark class="mr-2" to="/my-printers">
                            <v-icon>mdi-arrow-left</v-icon>
                        </v-btn>
                        <v-icon class="mr-2">mdi-printer-3d-nozzle-plus</v-icon>
                        Register New Printer
                    </v-card-title>

                    <v-card-text class="pa-6">
                        <!-- Email Check Alert -->
                        <v-alert v-if="!userEmail" type="warning" prominent class="mb-6">
                            <v-row align="center">
                                <v-col class="grow">
                                    <strong>Email Required</strong>
                                    <div class="text-body-2 mt-1">
                                        You need to add an email address to your account to receive registration keys.
                                    </div>
                                </v-col>
                            </v-row>
                        </v-alert>

                        <v-alert v-else type="info" outlined class="mb-6">
                            <div class="d-flex align-center">
                                <v-icon left color="info">mdi-email</v-icon>
                                <span>Registration key will be sent to <strong>{{ userEmail }}</strong></span>
                            </div>
                        </v-alert>

                        <!-- Printer Name Input -->
                        <v-text-field
                            v-model="printerName"
                            label="Printer Name"
                            hint="Enter a friendly name for your printer (e.g., 'Workshop Ender 3')"
                            persistent-hint
                            outlined
                            :rules="nameRules"
                            :disabled="!userEmail"
                            class="mb-4"
                        >
                            <template v-slot:prepend-inner>
                                <v-icon>mdi-printer-3d</v-icon>
                            </template>
                        </v-text-field>

                        <!-- Send Button -->
                        <v-btn
                            color="primary"
                            block
                            large
                            @click="sendRegistrationKey"
                            :loading="sending"
                            :disabled="!printerName || printerName.length < 2 || !userEmail || sending"
                        >
                            <v-icon left>mdi-send</v-icon>
                            Send Now
                        </v-btn>

                        <!-- Success Message -->
                        <v-expand-transition>
                            <v-alert v-if="successMessage" type="success" class="mt-6" dismissible @input="successMessage = ''">
                                <div class="d-flex align-center">
                                    <v-icon left color="success">mdi-check-circle</v-icon>
                                    <div>
                                        <strong>Registration key sent!</strong>
                                        <div class="text-body-2 mt-1">
                                            Check your email at <strong>{{ userEmail }}</strong> for the registration key and setup instructions.
                                        </div>
                                    </div>
                                </div>
                            </v-alert>
                        </v-expand-transition>

                        <!-- Error Message -->
                        <v-expand-transition>
                            <v-alert v-if="errorMessage" type="error" class="mt-6" dismissible @input="errorMessage = ''">
                                {{ errorMessage }}
                            </v-alert>
                        </v-expand-transition>

                        <!-- Instructions -->
                        <v-divider class="my-6"></v-divider>
                        
                        <div class="text-h6 mb-3">
                            <v-icon class="mr-2">mdi-information</v-icon>
                            What happens next?
                        </div>
                        
                        <v-timeline dense class="ml-4">
                            <v-timeline-item small color="primary">
                                <div class="text-body-2">
                                    <strong>1. Receive Email</strong>
                                    <div class="grey--text">You will get a registration key via email</div>
                                </div>
                            </v-timeline-item>
                            <v-timeline-item small color="primary">
                                <div class="text-body-2">
                                    <strong>2. Setup Script</strong>
                                    <div class="grey--text">Download and run the fleet client on your printer Raspberry Pi</div>
                                </div>
                            </v-timeline-item>
                            <v-timeline-item small color="primary">
                                <div class="text-body-2">
                                    <strong>3. Register</strong>
                                    <div class="grey--text">Use the key to register your printer with the fleet</div>
                                </div>
                            </v-timeline-item>
                            <v-timeline-item small color="success">
                                <div class="text-body-2">
                                    <strong>4. Done!</strong>
                                    <div class="grey--text">Your printer will appear in your dashboard</div>
                                </div>
                            </v-timeline-item>
                        </v-timeline>
                    </v-card-text>

                    <v-card-actions class="pa-4">
                        <v-btn text to="/my-printers">
                            <v-icon left>mdi-arrow-left</v-icon>
                            Back to Printers
                        </v-btn>
                        <v-spacer></v-spacer>
                        <v-btn color="primary" to="/my-printers" v-if="successMessage">
                            <v-icon left>mdi-view-list</v-icon>
                            View Printers
                        </v-btn>
                    </v-card-actions>
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

@Component
export default class RegisterPrinter extends Mixins(BaseMixin) {
    printerName = ''
    sending = false
    successMessage = ''
    errorMessage = ''
    userEmail = ''

    nameRules = [
        (v: string) => !!v || 'Printer name is required',
        (v: string) => (v && v.length >= 2) || 'Printer name must be at least 2 characters',
    ]

    async mounted() {
        await this.loadUserInfo()
    }

    async loadUserInfo() {
        try {
            const token = localStorage.getItem('fleet_token')
            if (!token) {
                this.$router.push('/login')
                return
            }

            const response = await axios.get('/api/auth/me', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            this.userEmail = response.data.user.email || ''
        } catch (error: any) {
            console.error('Failed to load user info:', error)
        }
    }

    async sendRegistrationKey() {
        if (!this.printerName || this.printerName.length < 2) {
            this.errorMessage = 'Please enter a valid printer name'
            return
        }

        if (!this.userEmail) {
            this.errorMessage = 'You need to add an email address to your account first'
            return
        }

        this.sending = true
        this.errorMessage = ''
        this.successMessage = ''

        try {
            const token = localStorage.getItem('fleet_token')
            if (!token) {
                this.$router.push('/login')
                return
            }

            const response = await axios.post(
                '/api/printer-registration/keys',
                {
                    printerName: this.printerName,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            this.successMessage = response.data.message || 'Registration key sent successfully!'
            this.$toast.success('Registration key sent to your email!')
            
            // Clear the form
            this.printerName = ''
        } catch (error: any) {
            const message = error.response?.data?.error || 'Failed to send registration key'
            this.errorMessage = message
            this.$toast.error(message)
        } finally {
            this.sending = false
        }
    }
}
</script>

<style scoped>
.v-timeline {
    padding-top: 0;
}
</style>
