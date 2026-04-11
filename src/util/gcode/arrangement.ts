/**
 * Build Plate Arrangement & Validation
 *
 * Auto-arranges G-code footprints on the build plate using the existing
 * bin packer, and validates sequential print feasibility (gantry clearance,
 * overlap, bed bounds).
 */

import { Packer, type PackBlock } from '@/util/mesh/packer'
import type { BuildPlateItem, GcodeFootprint } from './footprint'
import { getRotatedDimensions } from './footprint'

/** Printer gantry/printhead clearance configuration */
export interface SequentialPrintConfig {
    /** Bed width in mm */
    bedWidth: number
    /** Bed depth in mm */
    bedDepth: number
    /** Clearance between nozzle tip and gantry/X-bar (mm) */
    gantryHeight: number
    /** Printhead extent left/right of nozzle center (mm) */
    printheadBoundsX: [number, number]
    /** Printhead extent front/back of nozzle center (mm) */
    printheadBoundsY: [number, number]
    /** Minimum gap between parts (mm) */
    gap: number
}

export interface ValidationResult {
    valid: boolean
    errors: ValidationError[]
    warnings: ValidationWarning[]
}

export interface ValidationError {
    type: 'overlap' | 'out-of-bounds' | 'gantry-collision'
    message: string
    /** Indices of the involved items */
    itemIndices: number[]
}

export interface ValidationWarning {
    type: 'tight-fit' | 'tall-part' | 'print-order'
    message: string
    itemIndices: number[]
}

/**
 * Get the placed bounding box for an item on the bed.
 * Returns absolute bed coordinates { xMin, xMax, yMin, yMax }.
 */
function getPlacedBounds(item: BuildPlateItem): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const dims = getRotatedDimensions(item.footprint, item.rotation)
    return {
        xMin: item.placement.x - dims.width / 2,
        xMax: item.placement.x + dims.width / 2,
        yMin: item.placement.y - dims.depth / 2,
        yMax: item.placement.y + dims.depth / 2,
    }
}

/**
 * Check if two axis-aligned rectangles overlap (with optional margin).
 */
function rectsOverlap(
    a: { xMin: number; xMax: number; yMin: number; yMax: number },
    b: { xMin: number; xMax: number; yMin: number; yMax: number },
    margin = 0
): boolean {
    return !(
        a.xMax + margin <= b.xMin ||
        b.xMax + margin <= a.xMin ||
        a.yMax + margin <= b.yMin ||
        b.yMax + margin <= a.yMin
    )
}

/**
 * Auto-arrange items on the build plate using bin packing.
 * Returns a new array of items with updated placements.
 */
export function autoArrange(
    items: BuildPlateItem[],
    config: SequentialPrintConfig
): BuildPlateItem[] {
    if (items.length === 0) return []

    const gap = config.gap

    // Build pack blocks
    const blocks: (PackBlock & { index: number })[] = items.map((item, index) => {
        const dims = getRotatedDimensions(item.footprint, item.rotation)
        return {
            w: dims.width,
            h: dims.depth,
            index,
        }
    })

    const packer = new Packer(config.bedWidth, config.bedDepth, gap)
    packer.fit(blocks)

    return items.map((item, i) => {
        const block = blocks.find((b) => b.index === i)
        if (block?.fit) {
            const dims = getRotatedDimensions(item.footprint, item.rotation)
            return {
                ...item,
                placement: {
                    x: block.fit.x + dims.width / 2,
                    y: block.fit.y + dims.depth / 2,
                },
            }
        }
        return item
    })
}

/**
 * Validate the current arrangement for sequential printing feasibility.
 */
export function validateArrangement(
    items: BuildPlateItem[],
    config: SequentialPrintConfig
): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (items.length === 0) {
        return { valid: true, errors, warnings }
    }

    // Sort items by print order for sequential checks
    const sorted = [...items].sort((a, b) => a.printOrder - b.printOrder)

    // 1. Check each item is within bed bounds
    for (let i = 0; i < sorted.length; i++) {
        const bounds = getPlacedBounds(sorted[i])
        if (bounds.xMin < 0 || bounds.xMax > config.bedWidth ||
            bounds.yMin < 0 || bounds.yMax > config.bedDepth) {
            errors.push({
                type: 'out-of-bounds',
                message: `"${sorted[i].fileName}" extends outside the build plate`,
                itemIndices: [i],
            })
        }
    }

    // 2. Check for overlaps between all pairs
    for (let i = 0; i < sorted.length; i++) {
        const boundsA = getPlacedBounds(sorted[i])
        for (let j = i + 1; j < sorted.length; j++) {
            const boundsB = getPlacedBounds(sorted[j])

            if (rectsOverlap(boundsA, boundsB)) {
                errors.push({
                    type: 'overlap',
                    message: `"${sorted[i].fileName}" overlaps with "${sorted[j].fileName}"`,
                    itemIndices: [i, j],
                })
            }
        }
    }

    // 3. Check sequential gantry clearance
    // For each part in print order, the printhead (with its bounds) must be
    // able to travel to the next part without colliding with any already-printed
    // part that is taller than gantryHeight.
    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i]
        const currentBounds = getPlacedBounds(current)

        // Expand current bounds by printhead dimensions to get the
        // "exclusion zone" - area the printhead sweeps while printing this part
        const printheadZone = {
            xMin: currentBounds.xMin - config.printheadBoundsX[0],
            xMax: currentBounds.xMax + config.printheadBoundsX[1],
            yMin: currentBounds.yMin - config.printheadBoundsY[0],
            yMax: currentBounds.yMax + config.printheadBoundsY[1],
        }

        // Check against all previously-printed parts
        for (let j = 0; j < i; j++) {
            const printed = sorted[j]

            // Only a problem if the already-printed part is taller than gantry clearance
            if (printed.footprint.height <= config.gantryHeight) continue

            const printedBounds = getPlacedBounds(printed)

            if (rectsOverlap(printheadZone, printedBounds)) {
                errors.push({
                    type: 'gantry-collision',
                    message: `Printhead will collide with already-printed "${printed.fileName}" (${printed.footprint.height.toFixed(1)}mm tall, gantry clearance ${config.gantryHeight}mm) while printing "${current.fileName}"`,
                    itemIndices: [j, i],
                })
            }
        }
    }

    // 4. Warnings
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].footprint.height > config.gantryHeight * 0.8) {
            warnings.push({
                type: 'tall-part',
                message: `"${sorted[i].fileName}" is ${sorted[i].footprint.height.toFixed(1)}mm tall (gantry clearance: ${config.gantryHeight}mm)`,
                itemIndices: [i],
            })
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    }
}

/**
 * Suggest an optimal print order for sequential printing.
 *
 * Strategy: sort by Y position (back-to-front, highest Y first) so the
 * printhead doesn't have to reach over already-printed tall parts.
 * Among items at similar Y, print shortest first.
 */
export function suggestPrintOrder(items: BuildPlateItem[]): BuildPlateItem[] {
    const sorted = [...items].sort((a, b) => {
        // Primary: Y position descending (back of bed first)
        const yDiff = b.placement.y - a.placement.y
        if (Math.abs(yDiff) > 10) return yDiff

        // Secondary: shorter parts first
        return a.footprint.height - b.footprint.height
    })

    return sorted.map((item, index) => ({
        ...item,
        printOrder: index,
    }))
}
