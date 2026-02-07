/**
 * Bin Packer - BSP rectangle packing for auto-layout
 * Adapted from Kiri:Moto (MIT License)
 * 
 * Uses a binary space partition tree to pack rectangular blocks
 * into a 2D area with spacing between items.
 */

export interface PackBlock {
    w: number
    h: number
    fit?: PackNode
    move?: (x: number, y: number, z: number, abs: boolean) => void
}

interface PackNode {
    x: number
    y: number
    w: number
    h: number
    used?: boolean
    right?: PackNode
    down?: PackNode
}

export class Packer {
    root: PackNode
    max: { w: number; h: number }
    packed: boolean
    spacing: number
    pad: number

    constructor(w: number, h: number, spacing: number) {
        this.root = { x: 0, y: 0, w, h }
        this.max = { w: 0, h: 0 }
        this.packed = false
        this.spacing = spacing
        this.pad = spacing / 2
    }

    /**
     * Try to fit all blocks. Returns this.
     * Sets this.packed = true if all blocks fit.
     * Each block gets a .fit property with {x, y} coordinates.
     */
    fit(blocks: PackBlock[]): Packer {
        // Sort by height descending for better packing
        blocks.sort((a, b) => b.h - a.h)
        return this.fitSplit(blocks)
    }

    private fitSplit(blocks: PackBlock[]): Packer {
        const spacing = this.spacing

        for (const block of blocks) {
            const node = this.findNode(this.root, block.w + spacing, block.h + spacing)
            if (node) {
                block.fit = this.splitNode(node, block.w + spacing, block.h + spacing)
                // Adjust fit position to account for padding
                block.fit.x += this.pad
                block.fit.y += this.pad
            } else {
                // Doesn't fit
                return this
            }
        }

        this.packed = true
        return this
    }

    private findNode(root: PackNode, w: number, h: number): PackNode | null {
        if (root.used) {
            return this.findNode(root.right!, w, h) || this.findNode(root.down!, w, h)
        }
        if (w <= root.w && h <= root.h) {
            return root
        }
        return null
    }

    private splitNode(node: PackNode, w: number, h: number): PackNode {
        node.used = true
        node.down = {
            x: node.x,
            y: node.y + h,
            w: node.w,
            h: node.h - h,
        }
        node.right = {
            x: node.x + w,
            y: node.y,
            w: node.w - w,
            h: h,
        }
        this.max.w = Math.max(this.max.w, node.x + w)
        this.max.h = Math.max(this.max.h, node.y + h)
        return node
    }
}

/**
 * Pack blocks into minimum area, growing until they fit.
 * Returns the packed result with each block having a .fit property.
 */
export function packBlocks(blocks: PackBlock[], maxWidth: number, maxHeight: number, gap: number): Packer {
    let w = maxWidth
    let h = maxHeight

    // Try to fit, grow by 10% if doesn't fit
    let packer = new Packer(w, h, gap)
    packer.fit(blocks)

    let attempts = 0
    while (!packer.packed && attempts < 20) {
        w *= 1.1
        h *= 1.1
        packer = new Packer(w, h, gap)
        packer.fit(blocks)
        attempts++
    }

    return packer
}

/**
 * Spiral search for non-colliding position when adding a single widget.
 * Returns {x, y} offset for the new widget.
 */
export function findNonCollidingPosition(
    newWidth: number,
    newHeight: number,
    existingBounds: Array<{ x: number; y: number; w: number; h: number }>,
    gap: number = 5
): { x: number; y: number } {
    if (existingBounds.length === 0) {
        return { x: 0, y: 0 }
    }

    const halfW = newWidth / 2
    const halfH = newHeight / 2

    // Spiral outward from center
    for (let rad = 10; rad < 500; rad += 5) {
        for (let deg = 0; deg < 360; deg += 5) {
            const radians = deg * (Math.PI / 180)
            const dx = Math.cos(radians) * rad
            const dy = Math.sin(radians) * rad

            // Check collision with all existing bounds
            let collides = false
            for (const existing of existingBounds) {
                const overlapX = Math.abs(dx - existing.x) < (halfW + existing.w / 2 + gap)
                const overlapY = Math.abs(dy - existing.y) < (halfH + existing.h / 2 + gap)
                if (overlapX && overlapY) {
                    collides = true
                    break
                }
            }

            if (!collides) {
                return { x: dx, y: dy }
            }
        }
    }

    // Fallback: offset to the right
    return { x: newWidth + gap * 2, y: 0 }
}
