import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ProjectDocument } from '@constructflow/project-model'
import { resolveOpeningMuntinGrid, muntinGridPositions, type OpeningGridZone } from '@constructflow/architecture-engine'
import { buildProjectRepresentations3D, getPlanVisibleObjects, doorLeafDetails, sashBeadDetails, openingMaterialAppearance, openingHandlePlacement, type ObjectRepresentation3D, type RepresentationInteraction } from '@constructflow/representation-engine'

type ModelObject3D = THREE.Object3D & { userData: { objectId: string; objectType: string; moveable: boolean; interaction: RepresentationInteraction } }
const mmToM = (value: number) => value / 1000

function phaseColor(phase: ObjectRepresentation3D['display_phase']): THREE.ColorRepresentation {
  if (phase === 'existing') return '#94a3b8'
  if (phase === 'demolition') return '#ef4444'
  return '#38bdf8'
}

function objectColor(representation: ObjectRepresentation3D): THREE.ColorRepresentation {
  if (representation.display_phase !== 'new_construction') return phaseColor(representation.display_phase)
  if (representation.shape.kind === 'wall_extrusion') return '#bdc9d4'
  if (representation.object_type === 'structure.foundation') return '#8499ad'
  if (representation.object_type === 'structure.column') return '#9cabb9'
  if (representation.object_type === 'structure.beam') return '#91a5b6'
  return '#9bb2c4'
}

function makeObjectMesh(representation: ObjectRepresentation3D): ModelObject3D {
  const displayPhase = representation.display_phase
  const root = new THREE.Group() as unknown as ModelObject3D
  const standardMaterial = (color: THREE.ColorRepresentation, options: { transparent?: boolean; opacity?: number; metalness?: number; roughness?: number; depthWrite?: boolean } = {}) =>
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      color,
      roughness: options.roughness ?? 0.72,
      metalness: options.metalness ?? 0,
      transparent: options.transparent ?? displayPhase !== 'new_construction',
      opacity: options.opacity ?? (displayPhase === 'demolition' ? 0.48 : displayPhase === 'existing' ? 0.62 : 1),
      depthWrite: options.depthWrite ?? displayPhase === 'new_construction',
    })
  const addBox = (parent: THREE.Object3D, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material, rotationZ = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions.map(value => Math.max(value, 0.001)) as [number, number, number]), material)
    mesh.position.set(...position)
    mesh.rotation.z = rotationZ
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const rootPosition = representation.position_mm.map(mmToM) as [number, number, number]
  root.position.set(...rootPosition)
  root.rotation.z = representation.rotation_rad

  if (representation.shape.kind === 'opening') {
    const shape = representation.shape
    const width = mmToM(shape.width_mm), height = mmToM(shape.height_mm)
    const frameWidth = Math.min(width * 0.22, mmToM(shape.frame_face_width_mm))
    const sashFaceWidth = Math.min(Math.min(width, height) * 0.2, mmToM(shape.sash_face_width_mm))
    const frameDepth = Math.min(mmToM(shape.wall_thickness_mm) + 0.04, Math.max(0.055, mmToM(shape.frame_depth_mm)))
    const panelDepth = shape.opening_type === 'door' ? mmToM(shape.door_leaf_thickness_mm) : 0.018
    const panelOperations = shape.panel_layout.length === shape.panel_count ? shape.panel_layout : Array.from({ length: shape.panel_count }, () => shape.operation)
    const panelWidthRatios = shape.panel_width_ratios.length === shape.panel_count && Math.abs(shape.panel_width_ratios.reduce((sum, value) => sum + value, 0) - 1) < 0.001
      ? shape.panel_width_ratios : Array.from({ length: shape.panel_count }, () => 1 / shape.panel_count)
    const panelStartX = (index: number) => -clearWidth / 2 + clearWidth * panelWidthRatios.slice(0, index).reduce((sum, value) => sum + value, 0)
    const panelWidthAt = (index: number) => clearWidth * panelWidthRatios[index]
    const hasSlidingPanel = panelOperations.includes('sliding')
    const frameAppearance = openingMaterialAppearance(shape.frame_material)
    const panelAppearance = openingMaterialAppearance(shape.panel_material)
    const frameColor = frameAppearance.color
    const phaseFrameColor = displayPhase === 'new_construction' ? frameColor : phaseColor(displayPhase)
    const frameMaterial = standardMaterial(phaseFrameColor, frameAppearance)
    const panelColor = panelAppearance.color
    const panelMaterial = standardMaterial(displayPhase === 'new_construction' ? panelColor : phaseColor(displayPhase), panelAppearance)
    const glassColor = shape.glazing_material === 'tinted_glass' ? '#5f879b' : shape.glazing_material === 'frosted_glass' ? '#c8e1e5' : '#a5dce8'
    const glassOpacity = shape.glazing_material === 'frosted_glass' ? 0.48 : shape.glazing_material === 'tinted_glass' ? 0.34 : Math.max(0.12, Math.min(0.28, 0.34 - shape.glazing_transmission * 0.22))
    const glassMaterial = standardMaterial(displayPhase === 'new_construction' ? glassColor : phaseColor(displayPhase), {
      transparent: true,
      opacity: displayPhase === 'new_construction' ? glassOpacity : 0.32,
      depthWrite: false,
    })
    const halfWidth = width / 2
    const halfHeight = height / 2
    const maxFixedLightHeight = Math.max(0, height - frameWidth * 4)
    const requestedTopLight = mmToM(shape.transom_height_mm)
    const requestedBottomLight = mmToM(shape.bottom_light_height_mm)
    const lightScale = requestedTopLight + requestedBottomLight > maxFixedLightHeight
      ? maxFixedLightHeight / Math.max(requestedTopLight + requestedBottomLight, 0.001) : 1
    const transomHeight = requestedTopLight * lightScale
    const bottomLightHeight = requestedBottomLight * lightScale
    const leafHeight = height - transomHeight - bottomLightHeight
    const panelCenterZ = (bottomLightHeight - transomHeight) / 2
    const clearWidth = Math.max(0.03, width - frameWidth * 2)
    const clearHeight = Math.max(0.03, leafHeight - frameWidth * 2)
    const yFront = mmToM(shape.wall_thickness_mm) / 2 + 0.012
    const trackDepth = Math.max(0.016, frameDepth * 0.22)
    const beadMaterial = standardMaterial(displayPhase === 'new_construction' ? new THREE.Color(frameColor).multiplyScalar(0.7) : phaseColor(displayPhase), { roughness: 0.6 })
    const addFrameBar = (barWidth: number, barHeight: number, x: number, z: number) => addBox(root, [barWidth, frameDepth, barHeight], [x, 0, z], frameMaterial)
    const addSash = (parent: THREE.Object3D, x: number, z: number, sashWidth: number, sashHeight: number, y: number, material: THREE.Material, withGlass: boolean, zone: OpeningGridZone = 'leaf') => {
      const rail = Math.min(Math.min(sashWidth, sashHeight) * 0.25, sashFaceWidth)
      if (withGlass) addBox(parent, [Math.max(0.02, sashWidth - rail * 2), 0.012, Math.max(0.02, sashHeight - rail * 2)], [x, y + 0.004, z], glassMaterial)
      addBox(parent, [rail, frameDepth * 0.52, sashHeight], [x - sashWidth / 2 + rail / 2, y, z], material)
      addBox(parent, [rail, frameDepth * 0.52, sashHeight], [x + sashWidth / 2 - rail / 2, y, z], material)
      addBox(parent, [sashWidth, frameDepth * 0.52, rail], [x, y, z - sashHeight / 2 + rail / 2], material)
      addBox(parent, [sashWidth, frameDepth * 0.52, rail], [x, y, z + sashHeight / 2 - rail / 2], material)
      if (withGlass) for (const bead of sashBeadDetails(sashWidth * 1000, sashHeight * 1000, frameDepth * 520, rail * 1000)) {
        addBox(parent, bead.size_mm.map(mmToM) as [number, number, number], [x + mmToM(bead.center_mm[0]), y + mmToM(bead.center_mm[1]), z + mmToM(bead.center_mm[2])], beadMaterial)
      }
      const mullionY = y + frameDepth * 0.3
      const grid = muntinGridPositions(resolveOpeningMuntinGrid(shape, zone))
      for (const fraction of grid.vertical) {
        const barX = x - sashWidth / 2 + rail + (sashWidth - rail * 2) * fraction
        addBox(parent, [rail * 0.72, frameDepth * 0.38, sashHeight - rail * 2], [barX, mullionY, z], material)
      }
      for (const fraction of grid.horizontal) {
        const barZ = z - sashHeight / 2 + rail + (sashHeight - rail * 2) * fraction
        addBox(parent, [sashWidth - rail * 2, frameDepth * 0.38, rail * 0.72], [x, mullionY, barZ], material)
      }
    }
    const finishColors = { stainless: '#d7dde1', matte_black: '#242a30', satin_brass: '#b49a66', bronze: '#76553b' }
    const hardwareMaterial = standardMaterial(finishColors[shape.opening_hardware_finish] ?? finishColors.stainless, { metalness: 0.78, roughness: 0.26, opacity: displayPhase === 'new_construction' ? 1 : 0.62 })
    const recessedDark = standardMaterial('#263744', { metalness: 0.18 })
    const addCylinder = (parent: THREE.Object3D, radius: number, depth: number, position: [number, number, number], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 20), material)
      mesh.position.set(...position)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    const addHandle = (parent: THREE.Object3D, style: typeof shape.opening_handle_style, x: number, y: number, z: number, scale = 1, direction = -1) => {
      if (style === 'none') return
      if (style === 'round_knob') {
        addCylinder(parent, 0.032 * scale, 0.012 * scale, [x, y, z], hardwareMaterial)
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034 * scale, 18, 12), hardwareMaterial)
        knob.position.set(x, y + Math.sign(y || 1) * 0.034 * scale, z)
        parent.add(knob)
        addCylinder(parent, 0.011 * scale, 0.025 * scale, [x, y + Math.sign(y || 1) * 0.016 * scale, z - 0.095 * scale], hardwareMaterial)
        return
      }
      if (style === 'pull_handle') {
        addCylinder(parent, 0.035 * scale, 0.014 * scale, [x, y, z], hardwareMaterial)
        addBox(parent, [0.019 * scale, 0.023 * scale, 0.29 * scale], [x, y, z], hardwareMaterial)
        for (const dz of [-0.105, 0.105]) addBox(parent, [0.024 * scale, 0.027 * scale, 0.018 * scale], [x, y - Math.sign(y) * 0.017, z + dz * scale], hardwareMaterial)
        return
      }
      if (style === 'recessed_pull') {
        if (shape.opening_type === 'window') {
          const width = Math.min(0.022, Math.max(0.018, frameWidth * 0.48) * 0.85)
          const height = Math.min(0.085, clearHeight * 0.18)
          // The housing sits almost flush with the sash rather than floating
          // at the stand-off used by projecting levers and pull handles.
          const surfaceY = y - 0.017
          addBox(parent, [width, 0.003, height], [x, surfaceY, z], hardwareMaterial)
          addBox(parent, [width * 0.65, 0.001, height * 0.72], [x, surfaceY + 0.002, z], recessedDark)
          addBox(parent, [width * 0.48, 0.002, 0.006], [x, surfaceY + 0.003, z - height * 0.24], hardwareMaterial)
          return
        }
        addBox(parent, [0.094 * scale, 0.014 * scale, 0.20 * scale], [x, y, z], recessedDark)
        addBox(parent, [0.075 * scale, 0.009 * scale, 0.18 * scale], [x, y, z], recessedDark)
        addBox(parent, [0.058 * scale, 0.004 * scale, 0.15 * scale], [x, y + Math.sign(y) * 0.006, z], hardwareMaterial)
        return
      }
      addCylinder(parent, 0.027 * scale, 0.012 * scale, [x, y, z], hardwareMaterial)
      addBox(parent, [0.035 * scale, 0.009 * scale, 0.085 * scale], [x, y, z], hardwareMaterial)
      addBox(parent, [0.14 * scale, 0.018 * scale, 0.019 * scale], [x + direction * 0.072 * scale, y + Math.sign(y) * 0.012, z], hardwareMaterial)
      addCylinder(parent, 0.012 * scale, 0.02 * scale, [x, y + Math.sign(y || 1) * 0.014, z - 0.10 * scale], hardwareMaterial)
    }
    const detailShadow = standardMaterial(displayPhase === 'new_construction' ? new THREE.Color(panelColor).multiplyScalar(0.58) : phaseColor(displayPhase))
    const detailMoulding = standardMaterial(displayPhase === 'new_construction' ? new THREE.Color(panelColor).multiplyScalar(1.08) : phaseColor(displayPhase), panelAppearance)
    const addDoorFaceComponents = (parent: THREE.Object3D, centerX: number, centerZ: number, leafWidth: number, leafHeight: number, depth: number, centerY = 0) => {
      if (!shape.door_face_components?.length) return false
      const trimMaterial = detailMoulding
      for (const component of shape.door_face_components) {
        const width = leafWidth * component.width
        const height = leafHeight * component.height
        const x = -leafWidth / 2 + leafWidth * (component.x + component.width / 2)
        const z = -leafHeight / 2 + leafHeight * (component.y + component.height / 2)
        for (const face of [-1, 1]) {
          const y = centerY + face * (depth / 2 + 0.006)
          if (component.kind === 'grooves') {
            const count = Math.max(1, component.count ?? 1)
            for (let i = 1; i <= count; i++) {
              if (component.direction === 'vertical') addBox(parent, [0.004, 0.006, height], [centerX - leafWidth / 2 + leafWidth * (component.x + component.width * i / (count + 1)), y, centerZ + z], detailShadow)
              else addBox(parent, [width, 0.006, 0.004], [centerX + x, y, centerZ - leafHeight / 2 + leafHeight * (component.y + component.height * i / (count + 1))], detailShadow)
            }
            continue
          }
          const inset = Math.min(0.018, width * 0.05, height * 0.05)
          addBox(parent, [Math.max(0.02, width - inset * 2), 0.006, Math.max(0.02, height - inset * 2)], [centerX + x, y, centerZ + z], panelMaterial)
          const edge = component.contour === 'ellipse' || component.contour === 'capsule' ? Math.min(width, height) * 0.16 : inset
          addBox(parent, [width, 0.006, edge], [centerX + x, y + face * 0.003, centerZ + z - height / 2 + edge / 2], trimMaterial)
          addBox(parent, [width, 0.006, edge], [centerX + x, y + face * 0.003, centerZ + z + height / 2 - edge / 2], trimMaterial)
          addBox(parent, [edge, 0.006, height], [centerX + x - width / 2 + edge / 2, y + face * 0.003, centerZ + z], trimMaterial)
          addBox(parent, [edge, 0.006, height], [centerX + x + width / 2 - edge / 2, y + face * 0.003, centerZ + z], trimMaterial)
        }
      }
      return true
    }
    const addDoorLeafStyle = (parent: THREE.Object3D, centerX: number, centerZ: number, leafWidth: number, leafHeight: number, depth: number, centerY = 0) => {
      if (shape.opening_type !== 'door' || shape.glazing_material !== 'none') return
      if (addDoorFaceComponents(parent, centerX, centerZ, leafWidth, leafHeight, depth, centerY)) return
      for (const detail of doorLeafDetails(shape.door_leaf_style, leafWidth * 1000, leafHeight * 1000, depth * 1000)) {
        const material = detail.role === 'shadow' ? detailShadow : detail.role === 'moulding' ? detailMoulding : panelMaterial
        const mesh = addBox(parent, detail.size_mm.map(mmToM) as [number, number, number],
          [centerX + mmToM(detail.center_mm[0]), centerY + mmToM(detail.center_mm[1]), centerZ + mmToM(detail.center_mm[2])], material)
        mesh.rotation.x = detail.rotation_x_rad ?? 0
      }
    }

    addFrameBar(frameWidth, height, -halfWidth + frameWidth / 2, 0)
    addFrameBar(frameWidth, height, halfWidth - frameWidth / 2, 0)
    addFrameBar(width, frameWidth, 0, halfHeight - frameWidth / 2)
    addFrameBar(width, frameWidth, 0, -halfHeight + frameWidth / 2)
    if (transomHeight > 0) {
      const transomClearHeight = Math.max(0.03, transomHeight - frameWidth * 2)
      const transomCenterZ = halfHeight - transomHeight / 2
      addFrameBar(width, frameWidth, 0, halfHeight - transomHeight)
      addSash(root, 0, transomCenterZ, clearWidth, transomClearHeight, yFront, frameMaterial, shape.glazing_material !== 'none', 'transom')
    }
    if (bottomLightHeight > 0) {
      const bottomClearHeight = Math.max(0.03, bottomLightHeight - frameWidth * 2)
      const bottomCenterZ = -halfHeight + bottomLightHeight / 2
      addFrameBar(width, frameWidth, 0, -halfHeight + bottomLightHeight)
      addSash(root, 0, bottomCenterZ, clearWidth, bottomClearHeight, yFront, frameMaterial, shape.glazing_material !== 'none', 'bottom_light')
    }

    if (shape.opening_type === 'door' && panelOperations.every(operation => operation === 'hinged')) {
      const count = Math.max(1, shape.panel_count)
      const singleLeafLeftHinged = shape.handing?.startsWith('left') ?? true
      for (let index = 0; index < count; index++) {
        const panelWidth = panelWidthAt(index)
        const leftHinged = count === 1 ? singleLeafLeftHinged : index === 0
        const hingeX = leftHinged ? panelStartX(index) : panelStartX(index) + panelWidth
        const leafPivot = new THREE.Group()
        // Keep the vertical hinge axis centered on the opening and swing the
        // leaf in plan. The panel stays exactly within its clear opening size.
        leafPivot.position.set(hingeX, yFront, panelCenterZ)
        leafPivot.rotation.z = (leftHinged ? 1 : -1) * (shape.handing?.endsWith('out') ? -1 : 1) * Math.PI / 2
        root.add(leafPivot)
        const side = leftHinged ? 1 : -1
        const leafCenterX = side * panelWidth / 2
        if (shape.glazing_material === 'none') {
          addBox(leafPivot, [panelWidth - 0.012, panelDepth, clearHeight], [leafCenterX, 0, 0], panelMaterial)
          addDoorLeafStyle(leafPivot, leafCenterX, 0, panelWidth - 0.012, clearHeight, panelDepth)
        } else addSash(leafPivot, leafCenterX, 0, panelWidth - 0.01, clearHeight, 0, frameMaterial, true)
        const placement = openingHandlePlacement('hinged', leftHinged ? 0 : 1, (panelWidth - 0.01) * 1000, clearHeight * 1000, shape.glazing_material !== 'none')!
        const handleX = leafCenterX + (placement.x - 0.5) * (panelWidth - 0.01)
        for (const face of [-1, 1]) addHandle(leafPivot, shape.opening_handle_style, handleX, face * ((shape.glazing_material === 'none' ? panelDepth / 2 : frameDepth * 0.26) + 0.018), 0, 1, -side)
      }
    } else if (shape.opening_type === 'door') {
      const count = Math.max(1, shape.panel_count)
      const sliding = hasSlidingPanel
      for (let index = 0; index < count; index++) {
        const panelWidth = panelWidthAt(index) + (sliding ? 0.035 : 0)
        const panelOperation = panelOperations[index]
        const x = panelStartX(index) + panelWidthAt(index) / 2
        const isSlidingPanel = panelOperation === 'sliding'
        const y = yFront + (isSlidingPanel ? (index % 2) * trackDepth : 0)
        if (panelOperation === 'hinged') {
          const leftHinged = index === 0
          const hingeX = leftHinged ? x - panelWidth / 2 : x + panelWidth / 2
          const pivot = new THREE.Group()
          pivot.position.set(hingeX, yFront, panelCenterZ)
          pivot.rotation.z = (leftHinged ? 1 : -1) * (shape.handing?.endsWith('out') ? -1 : 1) * Math.PI / 2
          root.add(pivot)
          const side = leftHinged ? 1 : -1
          const centerX = side * panelWidth / 2
          if (shape.glazing_material === 'none') {
            addBox(pivot, [panelWidth - 0.012, panelDepth, clearHeight], [centerX, 0, 0], panelMaterial)
            addDoorLeafStyle(pivot, centerX, 0, panelWidth - 0.012, clearHeight, panelDepth)
          }
          else addSash(pivot, centerX, 0, panelWidth - 0.01, clearHeight, 0, frameMaterial, true)
          const placement = openingHandlePlacement('hinged', leftHinged ? 0 : 1, (panelWidth - 0.01) * 1000, clearHeight * 1000, shape.glazing_material !== 'none')!
          const handleX = centerX + (placement.x - 0.5) * (panelWidth - 0.01)
          for (const face of [-1, 1]) addHandle(pivot, shape.opening_handle_style, handleX, face * ((shape.glazing_material === 'none' ? panelDepth / 2 : frameDepth * 0.26) + 0.018), 0, 1, -side)
        } else if (panelOperation === 'louver') {
          const rail = Math.min(Math.min(panelWidth, clearHeight) * 0.25, sashFaceWidth)
          addBox(root, [rail, frameDepth * 0.7, clearHeight], [x - panelWidth / 2 + rail / 2, y, panelCenterZ], frameMaterial)
          addBox(root, [rail, frameDepth * 0.7, clearHeight], [x + panelWidth / 2 - rail / 2, y, panelCenterZ], frameMaterial)
          addBox(root, [panelWidth, frameDepth * 0.7, rail], [x, y, panelCenterZ - clearHeight / 2 + rail / 2], frameMaterial)
          addBox(root, [panelWidth, frameDepth * 0.7, rail], [x, y, panelCenterZ + clearHeight / 2 - rail / 2], frameMaterial)
          const slats = Math.max(6, Math.min(14, Math.round(clearHeight / 0.11)))
          for (let slat = 0; slat < slats; slat++) {
            const z = panelCenterZ - clearHeight / 2 + clearHeight * (slat + 0.5) / slats
            addBox(root, [Math.max(0.03, panelWidth - 0.06), panelDepth * 0.7, 0.025], [x, y, z], panelMaterial, -0.14)
          }
          const placement = openingHandlePlacement(panelOperation, index, panelWidth * 1000, clearHeight * 1000, false)!
          const handleX = x + (placement.x - 0.5) * panelWidth
          for (const face of [-1, 1]) addHandle(root, shape.opening_handle_style, handleX, y + face * (frameDepth * 0.35 + 0.018), panelCenterZ, 1, placement.direction)
        } else {
          addSash(root, x, panelCenterZ, panelWidth - 0.01, clearHeight, y, frameMaterial, shape.glazing_material !== 'none')
          if (shape.glazing_material === 'none') {
            addBox(root, [panelWidth - 0.035, panelDepth * 0.7, clearHeight - 0.035], [x, y, panelCenterZ], panelMaterial)
            addDoorLeafStyle(root, x, panelCenterZ, panelWidth - 0.035, clearHeight - 0.035, panelDepth * 0.7, y)
          }
          if (isSlidingPanel) {
            const placement = openingHandlePlacement(panelOperation, index, (panelWidth - 0.01) * 1000, clearHeight * 1000, true)!
            const handleX = x + (placement.x - 0.5) * (panelWidth - 0.01)
            for (const face of [-1, 1]) addHandle(root, shape.opening_handle_style, handleX, y + face * (frameDepth * 0.26 + 0.018), panelCenterZ, 1, placement.direction)
          }
        }
      }
      if (sliding) {
        addBox(root, [clearWidth + frameWidth, trackDepth, 0.018], [0, yFront - 0.004, panelCenterZ - clearHeight / 2 + frameWidth * 0.28], frameMaterial)
        addBox(root, [clearWidth + frameWidth, trackDepth, 0.018], [0, yFront + trackDepth, panelCenterZ - clearHeight / 2 + frameWidth * 0.62], frameMaterial)
      }
    } else {
      const count = Math.max(1, shape.panel_count)
      const sliding = hasSlidingPanel
      for (let index = 0; index < count; index++) {
        const paneWidth = panelWidthAt(index) + (sliding ? 0.03 : 0)
        const panelOperation = panelOperations[index]
        const x = panelStartX(index) + panelWidthAt(index) / 2
        const isSlidingPanel = panelOperation === 'sliding'
        const y = yFront + (isSlidingPanel ? (index % 2) * trackDepth : 0)
        if (panelOperation === 'awning' || panelOperation === 'hinged') {
          const awning = new THREE.Group()
          root.add(awning)
          const sashWidth = paneWidth - (count > 1 ? 0.012 : 0)
          if (panelOperation === 'awning') {
            awning.position.set(x, y, panelCenterZ + clearHeight / 2)
            awning.rotation.x = index % 2 === 0 ? -0.16 : 0.16
            addSash(awning, 0, -clearHeight / 2, sashWidth, clearHeight, 0, frameMaterial, shape.glazing_material !== 'none')
          } else {
            const leftHinged = index % 2 === 0
            awning.position.set(x + (leftHinged ? -sashWidth / 2 : sashWidth / 2), y, panelCenterZ)
            awning.rotation.z = leftHinged ? 0.16 : -0.16
            addSash(awning, leftHinged ? sashWidth / 2 : -sashWidth / 2, 0, sashWidth, clearHeight, 0, frameMaterial, shape.glazing_material !== 'none')
          }
          const placement = openingHandlePlacement(panelOperation, index, sashWidth * 1000, clearHeight * 1000, true)!
          const handleX = panelOperation === 'awning' ? 0 : (index % 2 === 0 ? sashWidth / 2 : -sashWidth / 2) + (placement.x - 0.5) * sashWidth
          addHandle(awning, shape.opening_handle_style, handleX, frameDepth * 0.26 + 0.018, panelOperation === 'awning' ? -clearHeight * placement.y : 0, 0.65, placement.direction)
        } else if (panelOperation === 'louver' && shape.glazing_material === 'none') {
          const slatCount = Math.max(5, Math.min(14, Math.round(clearHeight / 0.09)))
          for (let slat = 0; slat < slatCount; slat++) {
            const z = panelCenterZ - clearHeight / 2 + clearHeight * (slat + 0.5) / slatCount
            addBox(root, [paneWidth - 0.025, frameDepth * 0.34, 0.022], [x, y, z], frameMaterial, -0.16)
          }
          addSash(root, x, panelCenterZ, paneWidth - 0.01, clearHeight, 0, frameMaterial, false)
          const placement = openingHandlePlacement(panelOperation, index, (paneWidth - 0.01) * 1000, clearHeight * 1000, true)!
          addHandle(root, shape.opening_handle_style, x + (placement.x - 0.5) * (paneWidth - 0.01), y + frameDepth * 0.26 + 0.018, panelCenterZ, 0.65, placement.direction)
        } else {
          addSash(root, x, panelCenterZ, paneWidth - 0.01, clearHeight, y, frameMaterial, shape.glazing_material !== 'none')
          if (panelOperation === 'sliding') {
            const placement = openingHandlePlacement(panelOperation, index, (paneWidth - 0.01) * 1000, clearHeight * 1000, true)!
            addHandle(root, shape.opening_handle_style, x + (placement.x - 0.5) * (paneWidth - 0.01), y + frameDepth * 0.26 + 0.018, panelCenterZ, 0.65, placement.direction)
          }
        }
      }
      if (sliding) {
        addBox(root, [clearWidth + frameWidth, trackDepth, 0.018], [0, yFront - 0.004, -halfHeight + frameWidth * 0.28], frameMaterial)
        addBox(root, [clearWidth + frameWidth, trackDepth, 0.018], [0, yFront + trackDepth, -halfHeight + frameWidth * 0.62], frameMaterial)
      }
      addFrameBar(width + 0.035, frameWidth * 0.82, 0, -halfHeight + frameWidth * 0.82)
    }
    // Exterior casing and sill/threshold make the wall opening and installation depth legible.
    for (const face of [-1, 1]) {
      const faceY = face * (mmToM(shape.wall_thickness_mm) / 2 + 0.019)
      const casingW = Math.max(0.018, frameWidth * 0.42)
      const casingMaterial = standardMaterial(displayPhase === 'new_construction' ? frameColor : phaseColor(displayPhase), { metalness: frameColor === '#647b8b' ? 0.08 : 0 })
      addBox(root, [casingW, 0.018, height + casingW], [-halfWidth - casingW * 0.1, faceY, 0], casingMaterial)
      addBox(root, [casingW, 0.018, height + casingW], [halfWidth + casingW * 0.1, faceY, 0], casingMaterial)
      addBox(root, [width + casingW * 1.2, 0.018, casingW], [0, faceY, halfHeight + casingW * 0.1], casingMaterial)
    }
    const sillProjection = shape.opening_type === 'window' ? 0.065 : 0.025
    const sillHeight = shape.opening_type === 'window' ? 0.045 : 0.025
    addBox(root, [width + 0.045, mmToM(shape.wall_thickness_mm) + sillProjection * 2, sillHeight], [0, 0, -halfHeight - sillHeight / 2 + frameWidth * 0.2], frameMaterial)
    root.userData = {
      objectId: representation.object_id,
      objectType: representation.object_type,
      interaction: representation.interaction,
      moveable: representation.interaction.kind !== 'select_only',
    }
    return root
  }

  let geometry: THREE.BufferGeometry
  if (representation.shape.kind === 'triangle_mesh') {
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(representation.shape.triangles_mm.flat(2).map(mmToM),3))
    geometry.computeVertexNormals()
  } else if (representation.shape.kind === 'wall_extrusion') {
    const { length_mm, height_mm, thickness_mm, cutouts } = representation.shape
    const length = mmToM(length_mm), height = mmToM(height_mm), thickness = mmToM(thickness_mm)
    const shape = new THREE.Shape()
    shape.moveTo(0, 0); shape.lineTo(length, 0); shape.lineTo(length, height); shape.lineTo(0, height); shape.lineTo(0, 0)
    for (const cutout of cutouts) {
      const x1 = mmToM(cutout.min_x_mm), x2 = mmToM(cutout.max_x_mm)
      const z1 = mmToM(cutout.min_z_mm), z2 = mmToM(cutout.max_z_mm)
      const hole = new THREE.Path()
      hole.moveTo(x1, z1); hole.lineTo(x1, z2); hole.lineTo(x2, z2); hole.lineTo(x2, z1); hole.lineTo(x1, z1)
      shape.holes.push(hole)
    }
    if (representation.shape.layers?.length) {
      root.position.set(...representation.position_mm.map(mmToM) as [number, number, number])
      root.rotation.set(Math.PI / 2, 0, representation.rotation_rad)
      for (const layer of representation.shape.layers) {
        const layerThickness = mmToM(layer.thickness_mm)
        const layerGeometry = new THREE.ExtrudeGeometry(shape, { depth: layerThickness, bevelEnabled: false, steps: 1, curveSegments: 1 })
        layerGeometry.translate(0, 0, mmToM(layer.offset_mm) - layerThickness / 2)
        const finishColor: Record<string, string> = {
          cement_plaster: '#d4d0c8', wall_paint: '#f1eee6', interior_paint: '#f1eee6', exterior_paint: '#f1eee6',
          ceramic_tile: '#a8d4dc', stone_cladding: '#a99f91', timber_cladding: '#a8754b',
          smartboard: '#c7d1d4', fiber_cement_board: '#b9c4c8', gypsum_board: '#ece9df',
          composite_panel: '#b7c5ce', faux_wood_panel: '#a8754b',
          wallpaper: '#c8b8cc', exposed_masonry: '#b9755d', none: '#aebdca',
        }
        const layerColor = displayPhase === 'new_construction'
          ? layer.role === 'masonry' ? '#aebdca' : finishColor[layer.material] ?? '#c8d2dc'
          : phaseColor(displayPhase)
        const layerMesh = new THREE.Mesh(layerGeometry, standardMaterial(layerColor))
        layerMesh.castShadow = true
        layerMesh.receiveShadow = true
        layerMesh.userData = { objectId: representation.object_id, objectType: representation.object_type, layerRole: layer.role }
        root.add(layerMesh)
      }
      root.userData = {
        objectId: representation.object_id,
        objectType: representation.object_type,
        interaction: representation.interaction,
        moveable: representation.interaction.kind !== 'select_only',
      }
      return root
    }
    geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1 })
    geometry.translate(0, 0, -thickness / 2)
  } else {
    const [width, depth, height] = representation.shape.size_mm.map(mmToM)
    geometry = new THREE.BoxGeometry(Math.max(width, 0.01), Math.max(depth, 0.01), Math.max(height, 0.01))
  }
  const material = standardMaterial(objectColor(representation), { metalness: representation.object_type === 'structure.beam' && representation.material === 'steel' ? 0.12 : 0.01 })
  const mesh = new THREE.Mesh(geometry, material)
  root.position.set(...representation.position_mm.map(mmToM) as [number, number, number])
  mesh.position.set(0, 0, 0)
  if (representation.shape.kind === 'wall_extrusion') root.rotation.set(Math.PI / 2, 0, representation.rotation_rad)
  else root.rotation.z = representation.rotation_rad
  root.add(mesh)
  root.userData = {
    objectId: representation.object_id,
    objectType: representation.object_type,
    interaction: representation.interaction,
    moveable: representation.interaction.kind !== 'select_only',
  }
  mesh.castShadow = true
  mesh.receiveShadow = true
  return root
}

interface Model3DViewportProps {
  project: ProjectDocument
  onSelectObject: (id: string | null) => void
}

export const Model3DViewport: React.FC<Model3DViewportProps> = ({ project, onSelectObject }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const meshByIdRef = useRef(new Map<string, ModelObject3D>())
  const orbitRef = useRef<OrbitControls | null>(null)
  const selectRef = useRef(onSelectObject)
  selectRef.current = onSelectObject

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#080f1e')
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000)
    camera.up.set(0, 0, 1)
    // Plan coordinates use positive Y toward the bottom of the 2D canvas.
    // Start from +Y so the first 3D view shows the same front side as the plan.
    camera.position.set(12, 16, 13)
    cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = false
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    host.appendChild(renderer.domElement)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 0, 1.4)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    orbitRef.current = orbit

    scene.add(new THREE.HemisphereLight('#f1f5f9', '#64748b', 1.7))
    scene.add(new THREE.AmbientLight('#ffffff', 0.22))
    const sun = new THREE.DirectionalLight('#ffffff', 0.8)
    sun.position.set(-8, -10, 15)
    scene.add(sun)
    const grid = new THREE.GridHelper(40, 40, '#334155', '#1e293b')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.015
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
      material.transparent = true
      material.opacity = 0.42
      material.depthWrite = false
    }
    scene.add(grid)

    const resize = () => {
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onPointerUp = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects([...meshByIdRef.current.values()], true)
      let hitObject: THREE.Object3D | null = hits[0]?.object ?? null
      while (hitObject && typeof hitObject.userData.objectId !== 'string') hitObject = hitObject.parent
      selectRef.current(hitObject?.userData.objectId ?? null)
    }
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    let frame = 0
    const render = () => { frame = requestAnimationFrame(render); orbit.update(); renderer.render(scene, camera) }
    render()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      orbit.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      meshByIdRef.current.clear()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    for (const mesh of meshByIdRef.current.values()) {
      scene.remove(mesh)
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose()
        }
      })
    }
    meshByIdRef.current.clear()
    const visibleObjectIds = new Set(getPlanVisibleObjects(project).map(object => object.id))
    const representationResult = buildProjectRepresentations3D(project, { visibleObjectIds })
    for (const representation of representationResult.objects) {
      const mesh = makeObjectMesh(representation)
      scene.add(mesh)
      meshByIdRef.current.set(representation.object_id, mesh)
    }
    const box = new THREE.Box3()
    for (const mesh of meshByIdRef.current.values()) box.expandByObject(mesh)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const radius = Math.max(size.x, size.y, size.z, 2)
      orbitRef.current?.target.copy(center)
      cameraRef.current?.position.set(center.x + radius * 1.55, center.y + radius * 1.8, center.z + radius * 1.35)
      cameraRef.current?.updateProjectionMatrix()
      orbitRef.current?.update()
    }
  }, [project])

  return <div ref={hostRef} style={{ width: '100%', height: '100%', minHeight: 240, position: 'relative', background: '#080f1e' }}>
    <div style={{ position: 'absolute', left: 12, top: 10, zIndex: 1, color: '#94a3b8', background: 'rgba(8,15,30,0.76)', padding: '6px 9px', borderRadius: 4, fontSize: 11, pointerEvents: 'none' }}>
      ภาพตัวอย่าง 3D · ลากเพื่อหมุน · เลื่อนเพื่อซูม · เลือกวัตถุเพื่อดูคุณสมบัติ
    </div>
  </div>
}
