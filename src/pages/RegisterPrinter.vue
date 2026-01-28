<template>
    <v-container>
        <v-row>
            <v-col cols="12" md="8" offset-md="2" lg="6" offset-lg="3">
                <v-card>
                    <v-card-title class="d-flex align-center primary white--text">
                        <v-btn icon dark class="mr-2" to="/">
                            <v-icon>mdi-arrow-left</v-icon>
                        </v-btn>
                        <v-icon class="mr-2">mdi-printer-3d-nozzle-plus</v-icon>
                        Register Printer
                    </v-card-title>

                    <v-card-text class="pa-6">
                        <!-- Tab Selection -->
                        <v-btn-toggle v-model="registrationMethod" mandatory class="mb-6" color="primary">
                            <v-btn value="pairing" class="px-6">
                                <v-icon left>mdi-link-variant</v-icon>
                                Pair with Code
                            </v-btn>
                            <v-btn value="email" class="px-6">
                                <v-icon left>mdi-email</v-icon>
                                Email Key
                            </v-btn>
                        </v-btn-toggle>

                        <!-- PAIRING MODE -->
                        <div v-if="registrationMethod === 'pairing'">
                            <v-alert type="info" outlined class="mb-6">
                                <div class="d-flex align-center">
                                    <v-icon left color="info">mdi-information</v-icon>
                                    <span>Enter the 6-digit code displayed on your printer</span>
                                </div>
                            </v-alert>

                            <!-- Pairing Code Input -->
                            <div class="pairing-code-container mb-6">
                                <v-otp-input
                                    v-model="pairingCode"
                                    length="6"
                                    type="number"
                                    :disabled="pairing"
                                    @finish="claimPairingCode"
                                    class="pairing-code-input"
                                />
                            </div>

                            <!-- Pair Button -->
                            <v-btn
                                color="primary"
                                block
                                large
                                @click="claimPairingCode"
                                :loading="pairing"
                                :disabled="pairingCode.length !== 6 || pairing"
                            >
                                <v-icon left>mdi-link-variant</v-icon>
                                Pair Printer
                            </v-btn>

                            <!-- Pairing Success -->
                            <v-expand-transition>
                                <v-alert v-if="pairingSuccess" type="success" class="mt-6">
                                    <div class="d-flex align-center">
                                        <v-icon left color="success">mdi-check-circle</v-icon>
                                        <div>
                                            <strong>Printer paired successfully!</strong>
                                            <div class="text-body-2 mt-1">
                                                {{ pairingSuccessMessage }}
                                            </div>
                                        </div>
                                    </div>
                                </v-alert>
                            </v-expand-transition>

                            <!-- Pairing Instructions -->
                            <v-divider class="my-6"></v-divider>
                            
                            <div class="text-h6 mb-3">
                                <v-icon class="mr-2">mdi-help-circle</v-icon>
                                How to get the pairing code
                            </div>
                            
                            <v-timeline dense class="ml-4">
                                <v-timeline-item small color="primary">
                                    <div class="text-body-2">
                                        <strong>1. Install Fleet Client</strong>
                                        <div class="grey--text">Run on your printer's Raspberry Pi:</div>
                                        <code class="d-block mt-1 pa-2" style="background: #263238; color: #4fc3f7; border-radius: 4px;">
                                            curl -sSL https://fleet.modovolo.com/install.sh | sudo bash
                                        </code>
                                    </div>
                                </v-timeline-item>
                                <v-timeline-item small color="primary">
                                    <div class="text-body-2">
                                        <strong>2. View the Code</strong>
                                        <div class="grey--text">The 6-digit code will appear in the terminal and on your printer's LCD</div>
                                    </div>
                                </v-timeline-item>
                                <v-timeline-item small color="success">
                                    <div class="text-body-2">
                                        <strong>3. Enter Code Above</strong>
                                        <div class="grey--text">Type the code here and click Pair</div>
                                    </div>
                                </v-timeline-item>
                            </v-timeline>
                        </div>

                        <!-- EMAIL KEY MODE (Original) -->
                        <div v-else>
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
                                Send Registration Key
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
                        </div>

                        <!-- Error Message (shared) -->
                        <v-expand-transition>
                            <v-alert v-if="errorMessage" type="error" class="mt-6" dismissible @input="errorMessage = ''">
                                {{ errorMessage }}
                            </v-alert>
                        </v-expand-transition>
                    </v-card-text>

                    <v-card-actions class="pa-4">
                        <v-btn text to="/">
                            <v-icon left>mdi-arrow-left</v-icon>
                            Back
                        </v-btn>
                        <v-spacer></v-spacer>
                        <v-btn color="primary" to="/" v-if="pairingSuccess || successMessage">
                            <v-icon left>mdi-view-dashboard</v-icon>
                            Go to Dashboard
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
    // Registration method toggle
    registrationMethod: 'pairing' | 'email' = 'pairing'
    
    // Pairing mode state
    pairingCode = ''
    pairing = false
    pairingSuccess = false
    pairingSuccessMessage = ''
    
    // Email mode state
    printerName = ''
    sending = false
    successMessage = ''
    
    // Shared state
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

    async claimPairingCode() {
        if (this.pairingCode.length !== 6) {
            this.errorMessage = 'Please enter a valid 6-digit code'
            return
        }

        this.pairing = true
        this.errorMessage = ''
        this.pairingSuccess = false

        try {
            const token = localStorage.getItem('fleet_token')
            if (!token) {
                this.$router.push('/login')
                return
            }

            const response = await axios.post(
                '/api/pairing/claim',
                {
                    code: this.pairingCode,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            this.pairingSuccess = true
            this.pairingSuccessMessage = `${response.data.printer?.name || 'Printer'} is now connected to your account!`
            this.$toast.success('Printer paired successfully!')
            
            // Clear the code
            this.pairingCode = ''
        } catch (error: any) {
            const message = error.response?.data?.error || 'Failed to pair printer. Check the code and try again.'
            this.errorMessage = message
            this.$toast.error(message)
        } finally {
            this.pairing = false
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

.pairing-code-container {
    display: flex;
    justify-content: center;
}

.pairing-code-input {
    max-width: 400px;
}

::v-deep .v-otp-input input {
    font-size: 24px;
    font-weight: bold;
}
</style>
