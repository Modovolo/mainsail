/**
 * Settings Mapper Unit Tests
 * 
 * Tests for mapping user-facing settings to internal slicer config
 */

import { describe, it, expect } from 'vitest'
import { mapSettings, getDefaultConfig } from '@/util/slicer/settingsMapper'
import type { SliceParams, PrinterProfile } from '@/store/prepare/types'

// Helper to create test SliceParams
function createTestSliceParams(overrides: Partial<SliceParams> = {}): SliceParams {
    return {
        layer_height: 0.2,
        first_layer_height: 0.3,
        line_width: 0,
        infill_density: 20,
        infill_pattern: 'grid',
        wall_count: 3,
        top_layers: 4,
        bottom_layers: 4,
        print_speed: 60,
        travel_speed: 150,
        first_layer_speed: 20,
        nozzle_temp: 210,
        bed_temp: 60,
        nozzle_temps: [210],
        active_nozzle_index: 0,
        bed_controller_temps: [60],
        active_bed_controller_index: 0,
        enable_support: false,
        support_angle: 50,
        support_density: 15,
        support_pattern: 'grid',
        enable_non_planar: false,
        max_slope_angle: 45,
        enable_idex: false,
        idex_mode: 'normal',
        adhesion_type: 'none',
        brim_width: 8,
        brim_lines: 5,
        mouse_ear_diameter: 10,
        mouse_ear_layers: 2,
        raft_pad_layers: 3,
        raft_pad_gap: 0.15,
        bed_heater_temps: {},
        ...overrides,
    }
}

// Helper to create test PrinterProfile
function createTestPrinterProfile(overrides: Partial<PrinterProfile> = {}): PrinterProfile {
    return {
        id: 'test-printer',
        name: 'Test Printer',
        buildVolume: { x: 220, y: 220, z: 250 },
        extruderCount: 1,
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        bedShape: 'rectangular',
        heatedBed: true,
        bedHeaterControllerCount: 1,
        heatedChamber: false,
        autoBedLeveling: true,
        directDrive: false,
        ...overrides,
        firmware: overrides.firmware ?? 'klipper',
        gcodeFlavor: overrides.gcodeFlavor ?? 'marlin',
    }
}

describe('mapSettings', () => {
    describe('layer settings', () => {
        it('should map layer height correctly', () => {
            const params = createTestSliceParams({ layer_height: 0.15 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.layerHeight).toBe(0.15)
        })

        it('should map first layer height correctly', () => {
            const params = createTestSliceParams({ first_layer_height: 0.25 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.firstLayerHeight).toBe(0.25)
        })
    })

    describe('wall settings', () => {
        it('should map wall count correctly', () => {
            const params = createTestSliceParams({ wall_count: 5 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.wallCount).toBe(5)
        })

        it('should calculate wall speed as 70% of print speed', () => {
            const params = createTestSliceParams({ print_speed: 100 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.wallSpeed).toBeCloseTo(70, 1)
        })
    })

    describe('infill settings', () => {
        it('should convert infill density from percentage to decimal', () => {
            const params = createTestSliceParams({ infill_density: 50 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.infillDensity).toBe(0.5)
        })

        it('should map grid infill pattern', () => {
            const params = createTestSliceParams({ infill_pattern: 'grid' })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.infillPattern).toBe('grid')
        })

        it('should map gyroid infill pattern', () => {
            const params = createTestSliceParams({ infill_pattern: 'gyroid' })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.infillPattern).toBe('gyroid')
        })

        it('should default to grid for unknown pattern', () => {
            const params = createTestSliceParams({ infill_pattern: 'unknown_pattern' })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.infillPattern).toBe('grid')
        })
    })

    describe('speed settings', () => {
        it('should map print speed correctly', () => {
            const params = createTestSliceParams({ print_speed: 80 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.printSpeed).toBe(80)
            expect(config.infillSpeed).toBe(80)
        })

        it('should map travel speed correctly', () => {
            const params = createTestSliceParams({ travel_speed: 200 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.travelSpeed).toBe(200)
        })

        it('should map first layer speed correctly', () => {
            const params = createTestSliceParams({ first_layer_speed: 15 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.firstLayerSpeed).toBe(15)
        })
    })

    describe('temperature settings', () => {
        it('should map nozzle temperature correctly', () => {
            const params = createTestSliceParams({ nozzle_temp: 220 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.nozzleTemp).toBe(220)
        })

        it('should set first layer nozzle temp 5 degrees higher', () => {
            const params = createTestSliceParams({ nozzle_temp: 200 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.firstLayerNozzleTemp).toBe(205)
        })

        it('should map bed temperature correctly', () => {
            const params = createTestSliceParams({ bed_temp: 70 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.bedTemp).toBe(70)
        })

        it('should set first layer bed temp equal to bed temp', () => {
            const params = createTestSliceParams({ bed_temp: 60 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.firstLayerBedTemp).toBe(60)
        })

        it('should use active extruder and bed-controller temperatures', () => {
            const params = createTestSliceParams({
                nozzle_temp: 235,
                bed_temp: 70,
                nozzle_temps: [205, 235],
                active_nozzle_index: 1,
                bed_controller_temps: [55, 70],
                active_bed_controller_index: 1,
            })
            const printer = createTestPrinterProfile({
                extruderCount: 2,
                bedHeaterControllerCount: 2,
                bedHeaterZones: [{ name: 'heater_bed_FL' }, { name: 'heater_bed_FR' }],
            })

            const config = mapSettings(params, printer)

            expect(config.nozzleTemp).toBe(235)
            expect(config.firstLayerNozzleTemp).toBe(240)
            expect(config.bedTemp).toBe(70)
            expect(config.firstLayerBedTemp).toBe(70)
            expect(config.nozzleTemps).toEqual([205, 235])
            expect(config.firstLayerNozzleTemps).toEqual([210, 240])
            expect(config.bedControllerTemps).toEqual([55, 70])
            expect(config.firstLayerBedControllerTemps).toEqual([55, 70])
            expect(config.bedHeaterTemps).toEqual({
                heater_bed_FL: 55,
                heater_bed_FR: 70,
            })
        })
    })

    describe('printer profile settings', () => {
        it('should use printer nozzle diameter', () => {
            const params = createTestSliceParams()
            const printer = createTestPrinterProfile({ nozzleDiameter: 0.6 })

            const config = mapSettings(params, printer)

            expect(config.nozzleDiameter).toBe(0.6)
        })

        it('should calculate line width from nozzle diameter', () => {
            const params = createTestSliceParams()
            const printer = createTestPrinterProfile({ nozzleDiameter: 0.4 })

            const config = mapSettings(params, printer)

            expect(config.lineWidth).toBeCloseTo(0.44, 2) // 0.4 * 1.1
        })

        it('should use printer filament diameter', () => {
            const params = createTestSliceParams()
            const printer = createTestPrinterProfile({ filamentDiameter: 2.85 })

            const config = mapSettings(params, printer)

            expect(config.filamentDiameter).toBe(2.85)
        })

        it('should use printer build volume', () => {
            const params = createTestSliceParams()
            const printer = createTestPrinterProfile({ 
                buildVolume: { x: 300, y: 300, z: 400 } 
            })

            const config = mapSettings(params, printer)

            expect(config.buildVolumeX).toBe(300)
            expect(config.buildVolumeY).toBe(300)
            expect(config.buildVolumeZ).toBe(400)
        })

        it('should use shorter retraction for direct drive', () => {
            const params = createTestSliceParams()
            const directDrive = createTestPrinterProfile({ directDrive: true })
            const bowden = createTestPrinterProfile({ directDrive: false })

            const ddConfig = mapSettings(params, directDrive)
            const bowdenConfig = mapSettings(params, bowden)

            expect(ddConfig.retractDistance).toBe(0.8)
            expect(bowdenConfig.retractDistance).toBe(1.5)
        })
    })

    describe('support settings', () => {
        it('should map enable support correctly', () => {
            const params = createTestSliceParams({ enable_support: true })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.enableSupport).toBe(true)
        })

        it('should convert support density from percentage to decimal', () => {
            const params = createTestSliceParams({ support_density: 25 })
            const printer = createTestPrinterProfile()

            const config = mapSettings(params, printer)

            expect(config.supportDensity).toBe(0.25)
        })
    })
})

describe('getDefaultConfig', () => {
    it('should return default config object', () => {
        const config = getDefaultConfig()

        expect(config).toBeDefined()
        expect(config.layerHeight).toBe(0.2)
        expect(config.nozzleDiameter).toBe(0.4)
    })

    it('should return a new object each time', () => {
        const config1 = getDefaultConfig()
        const config2 = getDefaultConfig()

        expect(config1).not.toBe(config2)
        expect(config1).toEqual(config2)
    })

    it('should be immutable reference', () => {
        const config = getDefaultConfig()
        config.layerHeight = 999

        const fresh = getDefaultConfig()
        expect(fresh.layerHeight).toBe(0.2)
    })
})

describe('mapSettings - Regression Tests', () => {
    it('should handle zero infill density', () => {
        const params = createTestSliceParams({ infill_density: 0 })
        const printer = createTestPrinterProfile()

        const config = mapSettings(params, printer)

        expect(config.infillDensity).toBe(0)
    })

    it('should handle 100% infill density', () => {
        const params = createTestSliceParams({ infill_density: 100 })
        const printer = createTestPrinterProfile()

        const config = mapSettings(params, printer)

        expect(config.infillDensity).toBe(1)
    })

    it('should handle very small layer heights', () => {
        const params = createTestSliceParams({ layer_height: 0.05 })
        const printer = createTestPrinterProfile()

        const config = mapSettings(params, printer)

        expect(config.layerHeight).toBe(0.05)
    })

    it('should handle very high temperatures', () => {
        const params = createTestSliceParams({ nozzle_temp: 300, bed_temp: 120 })
        const printer = createTestPrinterProfile()

        const config = mapSettings(params, printer)

        expect(config.nozzleTemp).toBe(300)
        expect(config.bedTemp).toBe(120)
    })

    it('should handle small build volumes', () => {
        const params = createTestSliceParams()
        const printer = createTestPrinterProfile({
            buildVolume: { x: 50, y: 50, z: 50 }
        })

        const config = mapSettings(params, printer)

        expect(config.buildVolumeX).toBe(50)
        expect(config.buildVolumeY).toBe(50)
        expect(config.buildVolumeZ).toBe(50)
    })
})
