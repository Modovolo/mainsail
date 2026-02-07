/**
 * 3MF Loader - Adapted from Kiri:Moto (MIT License)
 * Copyright Stewart Allen <sa@grid.space>
 * 
 * Parses 3MF files (ZIP-based 3D manufacturing format).
 */

import * as THREE from 'three'
import JSZip from 'jszip'

export interface MeshItem {
    name: string
    vertices: Float32Array
}

const SCALE_MAP: Record<string, number> = {
    'inch': 1 / 25.4,
    'foot': 1 / 304.8,
    'micron': 1 / 1000,
    'meter': 1000,
    'millimeter': 1,
    'centimeter': 1 / 10,
}

interface ItemData {
    oid: string
    xform: string | null
    name?: string
    faces?: number[]
}

interface ComponentData {
    oid: string
    path: string | null
    xform: string | null
}

interface ObjectData {
    name: string
    mesh: number[] | null
    components: ComponentData[]
}

interface ModelData {
    objects: Record<string, ObjectData>
    items: ItemData[]
}

/**
 * Find matching attribute regardless of namespace
 */
function getLocalAttribute(node: Element, name: string): string | null {
    for (const attr of Array.from(node.attributes)) {
        if (attr.localName === name) {
            return attr.value
        }
    }
    return null
}

/**
 * Apply transformation matrix to mesh vertices
 */
function applyTransform(xformStr: string, mesh: number[]): number[] {
    const mat = xformStr.split(' ').map(v => parseFloat(v))
    const matrix = new THREE.Matrix4().set(
        mat[0], mat[3], mat[6], mat[9],
        mat[1], mat[4], mat[7], mat[10],
        mat[2], mat[5], mat[8], mat[11],
        0, 0, 0, 1
    )

    const result: number[] = []
    const vertex = new THREE.Vector3()

    for (let i = 0; i < mesh.length; i += 3) {
        vertex.set(mesh[i], mesh[i + 1], mesh[i + 2])
        vertex.applyMatrix4(matrix)
        result.push(vertex.x, vertex.y, vertex.z)
    }

    return result
}

/**
 * Load and parse a single .model XML document
 */
function loadModel(doc: Document): { objects: Record<string, ObjectData>; items: ItemData[] } {
    const items: ItemData[] = []
    const objects: Record<string, ObjectData> = {}
    let scale = 1

    // Find model element (handle namespaced and non-namespaced)
    const modelEl = doc.querySelector('model') || doc.getElementsByTagName('model')[0]
    if (!modelEl) {
        console.warn('3MF: No model element found')
        return { objects, items }
    }

    // Get units
    const units = modelEl.getAttribute('unit')
    if (units && SCALE_MAP[units]) {
        scale = SCALE_MAP[units]
    }

    // Get build items - handle namespaced elements
    const buildEl = modelEl.querySelector('build') || modelEl.getElementsByTagName('build')[0]
    if (buildEl) {
        const itemEls = buildEl.querySelectorAll('item') || buildEl.getElementsByTagName('item')
        for (const itemNode of Array.from(itemEls)) {
            items.push({
                oid: itemNode.getAttribute('objectid') || '',
                xform: itemNode.getAttribute('transform'),
            })
        }
    }

    // Parse objects
    const resourcesEl = modelEl.querySelector('resources') || modelEl.getElementsByTagName('resources')[0]
    if (resourcesEl) {
        const objectEls = resourcesEl.querySelectorAll('object') || resourcesEl.getElementsByTagName('object')
        for (const objNode of Array.from(objectEls)) {
            const id = objNode.getAttribute('id')
            if (!id) continue

            const object: ObjectData = {
                name: objNode.getAttribute('name') || `object-${id}`,
                mesh: null,
                components: [],
            }

            // Check for mesh
            const meshEl = objNode.querySelector('mesh') || objNode.getElementsByTagName('mesh')[0]
            if (meshEl) {
                const vertices: number[][] = []

                // Parse vertices
                const verticesEl = meshEl.querySelector('vertices') || meshEl.getElementsByTagName('vertices')[0]
                if (verticesEl) {
                    const vertexEls = verticesEl.querySelectorAll('vertex') || verticesEl.getElementsByTagName('vertex')
                    for (const vertex of Array.from(vertexEls)) {
                        vertices.push([
                            parseFloat(vertex.getAttribute('x') || '0') * scale,
                            parseFloat(vertex.getAttribute('y') || '0') * scale,
                            parseFloat(vertex.getAttribute('z') || '0') * scale,
                        ])
                    }
                }

                // Parse triangles
                const mesh: number[] = []
                const trianglesEl = meshEl.querySelector('triangles') || meshEl.getElementsByTagName('triangles')[0]
                if (trianglesEl) {
                    const triangleEls = trianglesEl.querySelectorAll('triangle') || trianglesEl.getElementsByTagName('triangle')
                    for (const triangle of Array.from(triangleEls)) {
                        const v1 = parseInt(triangle.getAttribute('v1') || '0')
                        const v2 = parseInt(triangle.getAttribute('v2') || '0')
                        const v3 = parseInt(triangle.getAttribute('v3') || '0')

                        // Avoid spread operator to prevent stack overflow on large meshes
                        if (vertices[v1]) {
                            mesh.push(vertices[v1][0], vertices[v1][1], vertices[v1][2])
                        }
                        if (vertices[v2]) {
                            mesh.push(vertices[v2][0], vertices[v2][1], vertices[v2][2])
                        }
                        if (vertices[v3]) {
                            mesh.push(vertices[v3][0], vertices[v3][1], vertices[v3][2])
                        }
                    }
                }

                object.mesh = mesh.length > 0 ? mesh : null
            }

            // Parse components if no mesh
            if (!object.mesh) {
                const componentsEl = objNode.querySelector('components') || objNode.getElementsByTagName('components')[0]
                if (componentsEl) {
                    const componentEls = componentsEl.querySelectorAll('component') || componentsEl.getElementsByTagName('component')
                    for (const comp of Array.from(componentEls)) {
                        object.components.push({
                            oid: comp.getAttribute('objectid') || '',
                            path: getLocalAttribute(comp, 'path'),
                            xform: comp.getAttribute('transform'),
                        })
                    }
                }
            }

            objects[id] = object
        }
    }

    return { objects, items }
}

/**
 * Extract mesh items from parsed models - iterative approach (no recursion)
 */
function extractItems(records: Record<string, ModelData>): MeshItem[] {
    const outItems: MeshItem[] = []
    const models = Object.values(records)

    // First pass: resolve all component references iteratively
    // Keep looping until no more changes (handles dependency ordering)
    let changed = true
    let iterations = 0
    const maxIterations = 100 // Safety limit

    while (changed && iterations < maxIterations) {
        changed = false
        iterations++

        for (const model of models) {
            const { objects } = model

            for (const object of Object.values(objects)) {
                // Skip if already has mesh data
                if (object.mesh && object.mesh.length > 0) {
                    continue
                }

                // Skip if no components
                if (!object.components || object.components.length === 0) {
                    continue
                }

                // Check if all referenced components have meshes
                let allResolved = true
                for (const component of object.components) {
                    const { oid, path } = component
                    let omap = objects
                    
                    if (path) {
                        const pathKey = path.startsWith('/') ? path.substring(1) : path
                        const pathModel = records[pathKey]
                        if (pathModel) {
                            omap = pathModel.objects
                        }
                    }

                    const ref = omap[oid]
                    if (!ref || !ref.mesh || ref.mesh.length === 0) {
                        allResolved = false
                        break
                    }
                }

                if (!allResolved) {
                    continue
                }

                // All components resolved - build the mesh
                const mesh: number[] = []
                for (const component of object.components) {
                    const { oid, path, xform } = component
                    let omap = objects

                    if (path) {
                        const pathKey = path.startsWith('/') ? path.substring(1) : path
                        const pathModel = records[pathKey]
                        if (pathModel) {
                            omap = pathModel.objects
                        }
                    }

                    const ref = omap[oid]
                    if (!ref || !ref.mesh) {
                        console.warn(`3MF: Missing component reference: ${oid}`)
                        continue
                    }

                    // Use for loop instead of spread to avoid stack overflow on large meshes
                    const srcMesh = xform ? applyTransform(xform, ref.mesh) : ref.mesh
                    for (let i = 0; i < srcMesh.length; i++) {
                        mesh.push(srcMesh[i])
                    }
                }

                object.mesh = mesh
                changed = true
            }
        }
    }

    if (iterations >= maxIterations) {
        console.warn('3MF: Maximum iterations reached while resolving components')
    }

    // Second pass: create output items from build items
    for (const model of models) {
        const { items, objects } = model

        for (const item of items || []) {
            const { oid, xform } = item
            const obj = objects[oid]

            if (!obj) {
                console.warn(`3MF: Build item references missing object: ${oid}`)
                continue
            }

            if (!obj.mesh || obj.mesh.length === 0) {
                console.warn(`3MF: Object ${oid} has no mesh data`)
                continue
            }

            // Apply transform if needed, otherwise use mesh directly
            // Avoid spread operator to prevent stack overflow on large meshes
            const vertices = xform ? applyTransform(xform, obj.mesh) : obj.mesh

            outItems.push({
                name: obj.name,
                vertices: new Float32Array(vertices),
            })
        }
    }

    // If no build items, export all objects with meshes
    if (outItems.length === 0) {
        for (const model of models) {
            for (const [id, obj] of Object.entries(model.objects)) {
                if (obj.mesh && obj.mesh.length > 0) {
                    outItems.push({
                        name: obj.name || `object-${id}`,
                        vertices: new Float32Array(obj.mesh),
                    })
                }
            }
        }
    }

    return outItems
}

export class ThreeMFLoader {
    /**
     * Parse 3MF file from ArrayBuffer
     */
    async parse(data: ArrayBuffer): Promise<MeshItem[]> {
        const zip = await new JSZip().loadAsync(data)
        const models: Record<string, ModelData> = {}

        // Find and parse all .model files
        for (const [key, value] of Object.entries(zip.files)) {
            if (key.endsWith('.model')) {
                const xml = await value.async('string')
                const parser = new DOMParser()
                const doc = parser.parseFromString(xml, 'text/xml')
                
                // Check for parse errors
                const parseError = doc.querySelector('parsererror')
                if (parseError) {
                    console.error('3MF XML parse error:', parseError.textContent)
                    continue
                }

                const { objects, items } = loadModel(doc)
                models[key] = { objects, items }
            }
        }

        return extractItems(models)
    }

    /**
     * Parse and return Three.js BufferGeometry objects
     */
    async parseToGeometries(data: ArrayBuffer): Promise<Array<{ name: string; geometry: THREE.BufferGeometry }>> {
        const items = await this.parse(data)

        return items.map(item => {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.BufferAttribute(item.vertices, 3))
            geometry.computeVertexNormals()

            return { name: item.name, geometry }
        })
    }
}

/**
 * Encode mesh items to 3MF format
 */
export async function encode3MF(
    records: Array<{ file: string; vertices: Float32Array }>,
    options: { unit?: string; title?: string } = {}
): Promise<Uint8Array> {
    const { unit = 'millimeter' } = options

    let objectId = 1
    const resources: string[] = []
    const buildItems: string[] = []

    for (const rec of records) {
        const { file, vertices } = rec
        const name = file || `object-${objectId}`

        // Extract unique vertices and build triangle indices
        const vertexList: Array<{ x: number; y: number; z: number }> = []
        const triangles: number[][] = []
        const vertexMap = new Map<string, number>()
        let vertexIndex = 0

        // Process triangles (every 9 floats = 3 vertices = 1 triangle)
        for (let i = 0; i < vertices.length; i += 9) {
            const triIndices: number[] = []

            for (let j = 0; j < 3; j++) {
                const vi = i + j * 3
                const x = vertices[vi]
                const y = vertices[vi + 1]
                const z = vertices[vi + 2]

                const key = `${x},${y},${z}`
                let idx = vertexMap.get(key)

                if (idx === undefined) {
                    idx = vertexIndex++
                    vertexMap.set(key, idx)
                    vertexList.push({ x, y, z })
                }

                triIndices.push(idx)
            }

            triangles.push(triIndices)
        }

        // Generate object XML
        const objectXml = [`    <object id="${objectId}" name="${name}" type="model">`]
        objectXml.push('      <mesh>')
        objectXml.push('        <vertices>')

        for (const v of vertexList) {
            objectXml.push(`          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`)
        }

        objectXml.push('        </vertices>')
        objectXml.push('        <triangles>')

        for (const tri of triangles) {
            objectXml.push(`          <triangle v1="${tri[0]}" v2="${tri[1]}" v3="${tri[2]}"/>`)
        }

        objectXml.push('        </triangles>')
        objectXml.push('      </mesh>')
        objectXml.push('    </object>')

        resources.push(objectXml.join('\n'))
        buildItems.push(`    <item objectid="${objectId}"/>`)

        objectId++
    }

    // Construct complete 3D model XML
    const modelXml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
        '  <resources>',
        resources.join('\n'),
        '  </resources>',
        '  <build>',
        buildItems.join('\n'),
        '  </build>',
        '</model>',
    ].join('\n')

    // Create content types XML
    const contentTypes = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
        '</Types>',
    ].join('\n')

    // Create relationships XML
    const rels = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
        '</Relationships>',
    ].join('\n')

    // Create ZIP archive
    const zip = new JSZip()
    zip.file('[Content_Types].xml', contentTypes)
    zip.file('_rels/.rels', rels)
    zip.file('3D/3dmodel.model', modelXml)

    return await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    })
}
