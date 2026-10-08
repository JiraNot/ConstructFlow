import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { ProjectDocument } from '@constructflow/project-model'
import { resolveOpeningMuntinGrid, muntinGridPositions, type OpeningGridZone } from '@constructflow/architecture-engine'
import { buildProjectRepresentations3D, getPlanVisibleObjects, type ObjectRepresentation3D, type RepresentationInteraction } from '@constructflow/representation-engine'

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
  const standardMaterial = (color: THREE.ColorRepresentation, options: { transparent?: boolean; opacity?: number; metalness?: number; depthWrite?: boolean } = {}) =>
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      color,
      roughness: 0.94,
      metalness: options.metalness ?? 0,
      transparent: options.transparent ?? displayPhase !== 'new_construction',
      opacity: options.opacity ?? (displayPhase === 'demolition' ? 0.48 : displayPhase === 'existing' ? 0.62 : 1),
      depthWrite: options.depthWrite ?? displayPhase === 'new_construction',
    })
  const addBox = (parent: THREE.Object3D, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material, rotationZ = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions.map(value => Math.max(value, 0.008)) as [number, number, number]), material)
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
    const frameWidth = Math.min(0.065, Math.max(0.032, mmToM(shape.frame_depth_mm) * 0.62))
    const frameDepth = Math.min(mmToM(shape.wall_thickness_mm) + 0.04, Math.max(0.055, mmToM(shape.frame_depth_mm)))
    const panelDepth = shape.opening_type === 'door' && shape.glazing_material === 'none' ? 0.042 : 0.018
    const panelOperations = shape.panel_layout.length === shape.panel_count ? shape.panel_layout : Array.from({ length: shape.panel_count }, () => shape.operation)
    const panelWidthRatios = shape.panel_width_ratios.length === shape.panel_count && Math.abs(shape.panel_width_ratios.reduce((sum, value) => sum + value, 0) - 1) < 0.001
      ? shape.panel_width_ratios : Array.from({ length: shape.panel_count }, () => 1 / shape.panel_count)
    const panelStartX = (index: number) => -clearWidth / 2 + clearWidth * panelWidthRatios.slice(0, index).reduce((sum, value) => sum + value, 0)
    const panelWidthAt = (index: number) => clearWidth * panelWidthRatios[index]
    const hasSlidingPanel = panelOperations.includes('sliding')
    const frameColor = shape.frame_material.toLowerCase().includes('timber') || shape.frame_material.toLowerCase().includes('wood') ? '#8b5e3c' : '#647b8b'
    const phaseFrameColor = displayPhase === 'demolition' ? '#ef4444' : displayPhase === 'existing' ? '#94a3b8' : frameColor
    const frameMaterial = standardMaterial(phaseFrameColor, { metalness: frameColor === '#647b8b' ? 0.12 : 0.01 })
    const panelMaterialKey = shape.panel_material?.toLowerCase() ?? ''
    const panelColor = ['timber', 'wood', 'solid_wood'].includes(panelMaterialKey) ? '#b87946' : ['hdf', 'mdf'].includes(panelMaterialKey) ? '#d4c2a7' : panelMaterialKey === 'wpc' ? '#927251' : panelMaterialKey === 'upvc' || panelMaterialKey === 'pvc' ? '#e4e8e4' : panelMaterialKey === 'aluminium' || panelMaterialKey === 'steel' ? '#788995' : '#4c6474'
    const panelMaterial = standardMaterial(displayPhase === 'new_construction' ? panelColor : phaseColor(displayPhase), { transparent: displayPhase !== 'new_construction', opacity: displayPhase === 'new_construction' ? 1 : 0.55 })
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
    const addFrameBar = (barWidth: number, barHeight: number, x: number, z: number) => addBox(root, [barWidth, frameDepth, barHeight], [x, 0, z], frameMaterial)
    const addSash = (parent: THREE.Object3D, x: number, z: number, sashWidth: number, sashHeight: number, y: number, material: THREE.Material, withGlass: boolean, zone: OpeningGridZone = 'leaf') => {
      const rail = Math.max(0.018, frameWidth * 0.48)
      if (withGlass) addBox(parent, [Math.max(0.02, sashWidth - rail * 2), 0.012, Math.max(0.02, sashHeight - rail * 2)], [x, y + 0.004, z], glassMaterial)
      addBox(parent, [rail, frameDepth * 0.52, sashHeight], [x - sashWidth / 2 + rail / 2, y, z], material)
      addBox(parent, [rail, frameDepth * 0.52, sashHeight], [x + sashWidth / 2 - rail / 2, y, z], material)
      addBox(parent, [sashWidth, frameDepth * 0.52, rail], [x, y, z - sashHeight / 2 + rail / 2], material)
      addBox(parent, [sashWidth, frameDepth * 0.52, rail], [x, y, z + sashHeight / 2 - rail / 2], material)
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
    const hardwareMaterial = standardMaterial(finishColors[shape.opening_hardware_finish] ?? finishColors.stainless, { metalness: 0.68, opacity: displayPhase === 'new_construction' ? 1 : 0.62 })
    const recessedDark = standardMaterial('#263744', { metalness: 0.18 })
    const addHandle = (parent: THREE.Object3D, style: typeof shape.opening_handle_style, x: number, y: number, z: number, scale = 1) => {
      if (style === 'none') return
      if (style === 'round_knob') {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024 * scale, 16, 12), hardwareMaterial)
        knob.position.set(x, y, z)
        parent.add(knob)
        return
      }
      if (style === 'pull_handle') {
        addBox(parent, [0.019 * scale, 0.023 * scale, 0.29 * scale], [x, y, z], hardwareMaterial)
        for (const dz of [-0.105, 0.105]) addBox(parent, [0.024 * scale, 0.027 * scale, 0.018 * scale], [x, y - Math.sign(y) * 0.017, z + dz * scale], hardwareMaterial)
        return
      }
      if (style === 'recessed_pull') {
        addBox(parent, [0.075 * scale, 0.009 * scale, 0.18 * scale], [x, y, z], recessedDark)
        addBox(parent, [0.058 * scale, 0.004 * scale, 0.15 * scale], [x, y + Math.sign(y) * 0.006, z], hardwareMaterial)
        return
      }
      addBox(parent, [0.035 * scale, 0.009 * scale, 0.085 * scale], [x, y, z], hardwareMaterial)
      addBox(parent, [0.14 * scale, 0.018 * scale, 0.019 * scale], [x + 0.072 * scale, y + Math.sign(y) * 0.012, z], hardwareMaterial)
    }
    const addDoorLeafStyle = (parent: THREE.Object3D, centerX: number, centerZ: number, leafWidth: number, leafHeight: number, depth: number) => {
      const style = shape.door_leaf_style
      if (shape.opening_type !== 'door' || shape.glazing_material !== 'none' || style === 'flush') return
      const raisedGrids: Record<string, [number, number]> = { raised_2_panel: [2, 1], raised_4_panel: [2, 2], raised_6_panel: [3, 2] }
      const grid = raisedGrids[style]
      const insetX = Math.min(0.055, leafWidth * 0.10)
      const insetZ = Math.min(0.065, leafHeight * 0.055)
      const clearWidth = Math.max(0.03, leafWidth - insetX * 2)
      const clearHeight = Math.max(0.03, leafHeight - insetZ * 2)
      const faceLine = standardMaterial('#765b43', { metalness: 0.02 })
      const panelInset = standardMaterial(panelColor, { transparent: false })
      for (const face of [-1, 1]) {
        const faceY = face * (depth / 2 + 0.004)
        if (grid) {
          const gap = Math.max(0.025, leafWidth * 0.035)
          const panelW = (clearWidth - gap * (grid[1] - 1)) / grid[1]
          const panelH = (clearHeight - gap * (grid[0] - 1)) / grid[0]
          for (let row = 0; row < grid[0]; row++) for (let col = 0; col < grid[1]; col++) {
            const px = centerX - clearWidth / 2 + panelW / 2 + col * (panelW + gap)
            const pz = centerZ + clearHeight / 2 - panelH / 2 - row * (panelH + gap)
            addBox(parent, [panelW, 0.006, panelH], [px, faceY, pz], panelInset)
            const frame = Math.min(0.018, panelW * 0.08, panelH * 0.08)
            for (const zsign of [-1, 1]) addBox(parent, [panelW + frame, 0.006, frame], [px, faceY + face * 0.004, pz + zsign * (panelH / 2 + frame / 2)], faceLine)
            for (const xsign of [-1, 1]) addBox(parent, [frame, 0.006, panelH], [px + xsign * (panelW / 2 + frame / 2), faceY + face * 0.004, pz], faceLine)
          }
        } else if (style.startsWith('horizontal_grooves_')) {
          const count = style.endsWith('_5') ? 5 : 3
          for (let i = 0; i < count; i++) addBox(parent, [clearWidth, 0.006, 0.006], [centerX, faceY, centerZ - clearHeight / 2 + clearHeight * (i + 1) / (count + 1)], faceLine)
        } else if (style === 'vertical_grooves_3') {
          for (let i = 0; i < 3; i++) addBox(parent, [0.006, 0.006, clearHeight], [centerX - clearWidth / 2 + clearWidth * (i + 1) / 4, faceY, centerZ], faceLine)
        } else if (style === 'louvered') {
          const count = 8
          for (let i = 0; i < count; i++) addBox(parent, [clearWidth, 0.012, 0.022], [centerX, faceY, centerZ - clearHeight / 2 + clearHeight * (i + 0.5) / count], panelInset, -0.14)
        }
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
        const handleX = leafCenterX + side * (panelWidth / 2 - Math.min(0.10, panelWidth * 0.18))
        for (const face of [-1, 1]) addHandle(leafPivot, shape.opening_handle_style, handleX, face * (panelDepth / 2 + 0.018), 0)
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
          const handleX = centerX + side * (panelWidth / 2 - Math.min(0.1, panelWidth * 0.18))
          for (const face of [-1, 1]) addHandle(pivot, shape.opening_handle_style, handleX, face * (panelDepth / 2 + 0.018), 0)
        } else if (panelOperation === 'louver') {
          const rail = Math.max(0.025, frameWidth * 0.55)
          addBox(root, [rail, frameDepth * 0.7, clearHeight], [x - panelWidth / 2 + rail / 2, y, panelCenterZ], frameMaterial)
          addBox(root, [rail, frameDepth * 0.7, clearHeight], [x + panelWidth / 2 - rail / 2, y, panelCenterZ], frameMaterial)
          addBox(root, [panelWidth, frameDepth * 0.7, rail], [x, y, panelCenterZ - clearHeight / 2 + rail / 2], frameMaterial)
          addBox(root, [panelWidth, frameDepth * 0.7, rail], [x, y, panelCenterZ + clearHeight / 2 - rail / 2], frameMaterial)
          const slats = Math.max(6, Math.min(14, Math.round(clearHeight / 0.11)))
          for (let slat = 0; slat < slats; slat++) {
            const z = panelCenterZ - clearHeight / 2 + clearHeight * (slat + 0.5) / slats
            addBox(root, [Math.max(0.03, panelWidth - 0.06), panelDepth * 0.7, 0.025], [x, y, z], panelMaterial, -0.14)
          }
          const handleX = x + panelWidth / 2 - Math.min(0.07, panelWidth * 0.16)
          for (const face of [-1, 1]) addHandle(root, shape.opening_handle_style, handleX, y + face * (panelDepth * 0.48), panelCenterZ)
        } else {
          addSash(root, x, panelCenterZ, panelWidth - 0.01, clearHeight, y, frameMaterial, shape.glazing_material !== 'none')
          if (shape.glazing_material === 'none') {
            addBox(root, [panelWidth - 0.035, panelDepth * 0.7, clearHeight - 0.035], [x, y, panelCenterZ], panelMaterial)
            addDoorLeafStyle(root, x, panelCenterZ, panelWidth - 0.035, clearHeight - 0.035, panelDepth * 0.7)
          }
          if (isSlidingPanel) {
            const handleX = x + panelWidth / 2 - Math.min(0.07, panelWidth * 0.16)
            for (const face of [-1, 1]) addHandle(root, shape.opening_handle_style, handleX, y + face * (panelDepth * 0.48), panelCenterZ)
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
          const handleX = panelOperation === 'awning' ? x : x + paneWidth * (index % 2 === 0 ? 0.32 : -0.32)
          addHandle(root, shape.opening_handle_style, handleX, yFront + frameDepth * 0.45, panelCenterZ)
        } else if (panelOperation === 'louver' && shape.glazing_material === 'none') {
          const slatCount = Math.max(5, Math.min(14, Math.round(clearHeight / 0.09)))
          for (let slat = 0; slat < slatCount; slat++) {
            const z = panelCenterZ - clearHeight / 2 + clearHeight * (slat + 0.5) / slatCount
            addBox(root, [paneWidth - 0.025, frameDepth * 0.34, 0.022], [x, y, z], frameMaterial, -0.16)
          }
          addSash(root, x, panelCenterZ, paneWidth - 0.01, clearHeight, 0, frameMaterial, false)
          addHandle(root, shape.opening_handle_style, x + paneWidth / 2 - 0.04, y + frameDepth * 0.48, panelCenterZ)
        } else {
          addSash(root, x, panelCenterZ, paneWidth - 0.01, clearHeight, y, frameMaterial, shape.glazing_material !== 'none')
          if (panelOperation === 'sliding') addHandle(root, shape.opening_handle_style, x + paneWidth / 2 - 0.04, y + frameDepth * 0.48, panelCenterZ)
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
        const layerColor = displayPhase === 'new_construction'
          ? layer.role === 'masonry' ? '#aebdca' : '#c8d2dc'
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
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  onMoveColumn: (id: string, location_mm: [number, number]) => boolean
  onMoveWall: (id: string, delta_mm: [number, number]) => boolean
  onMoveFoundation: (id: string, center_mm: [number, number]) => boolean
  onMoveOpening: (id: string, offset_along_wall_mm: number) => boolean
}

export const Model3DViewport: React.FC<Model3DViewportProps> = ({ project, selectedId, onSelectObject, onMoveColumn, onMoveWall, onMoveFoundation, onMoveOpening }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const meshByIdRef = useRef(new Map<string, ModelObject3D>())
  const transformRef = useRef<TransformControls | null>(null)
  const orbitRef = useRef<OrbitControls | null>(null)
  const transformOriginRef = useRef<THREE.Vector3 | null>(null)
  const skipPointerSelectionRef = useRef(false)
  const moveColumnRef = useRef(onMoveColumn)
  const moveWallRef = useRef(onMoveWall)
  const selectRef = useRef(onSelectObject)
  const moveFoundationRef = useRef(onMoveFoundation)
  const moveOpeningRef = useRef(onMoveOpening)
  moveColumnRef.current = onMoveColumn
  moveWallRef.current = onMoveWall
  selectRef.current = onSelectObject
  moveFoundationRef.current = onMoveFoundation
  moveOpeningRef.current = onMoveOpening

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

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('translate')
    transform.setSpace('world')
    transform.showZ = false
    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value
      const target = transform.object as ModelObject3D | undefined
      if (event.value) {
        transformOriginRef.current = target?.position.clone() ?? null
      } else if (target && transformOriginRef.current) {
        skipPointerSelectionRef.current = true
        const origin = transformOriginRef.current
        const restore = () => target.position.copy(origin)
        if (target.userData.objectType === 'structure.column') {
          const deltaX = (target.position.x - origin.x) * 1000
          const deltaY = (target.position.y - origin.y) * 1000
          if (Math.hypot(deltaX, deltaY) < 1
            || !moveColumnRef.current(target.userData.objectId, [target.position.x * 1000, target.position.y * 1000])) {
            restore()
          }
        } else if (target.userData.objectType === 'architecture.wall') {
          const delta: [number, number] = [
            (target.position.x - origin.x) * 1000,
            (target.position.y - origin.y) * 1000,
          ]
          if (Math.hypot(...delta) < 1 || !moveWallRef.current(target.userData.objectId, delta)) {
            restore()
          }
        } else if (target.userData.objectType === 'structure.foundation') {
          const deltaX = (target.position.x - origin.x) * 1000
          const deltaY = (target.position.y - origin.y) * 1000
          if (Math.hypot(deltaX, deltaY) < 1
            || !moveFoundationRef.current(target.userData.objectId, [target.position.x * 1000, target.position.y * 1000])) {
            restore()
          }
        } else if (target.userData.interaction.kind === 'hosted_opening') {
          const { host_start_point_mm: start, host_end_point_mm: end, width_mm: width, offset_along_wall_mm: originalOffset } = target.userData.interaction
          const dx = end[0] - start[0], dy = end[1] - start[1]
          const length = Math.hypot(dx, dy)
          if (Number.isFinite(length) && length > 0 && Number.isFinite(width) && width > 0) {
            const rawOffset = ((target.position.x * 1000 - start[0]) * dx + (target.position.y * 1000 - start[1]) * dy) / length
            const nextOffset = Math.max(width / 2, Math.min(length - width / 2, rawOffset))
            if (Math.abs(nextOffset - originalOffset) < 1
              || !moveOpeningRef.current(target.userData.objectId, nextOffset)) {
              restore()
            }
          } else restore()
        }
      }
      if (!event.value) transformOriginRef.current = null
    })
    scene.add(transform.getHelper())
    transformRef.current = transform

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
      if (transform.dragging) return
      if (skipPointerSelectionRef.current) {
        skipPointerSelectionRef.current = false
        return
      }
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
      transform.detach()
      transform.dispose()
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

  useEffect(() => {
    const selected = selectedId ? meshByIdRef.current.get(selectedId) : undefined
    const transform = transformRef.current
    if (selected?.userData.moveable) transform?.attach(selected)
    else transform?.detach()
  }, [project, selectedId])

  return <div ref={hostRef} style={{ width: '100%', height: '100%', minHeight: 240, position: 'relative', background: '#080f1e' }}>
    <div style={{ position: 'absolute', left: 12, top: 10, zIndex: 1, color: '#94a3b8', background: 'rgba(8,15,30,0.76)', padding: '6px 9px', borderRadius: 4, fontSize: 11, pointerEvents: 'none' }}>
      WebGL 3D · drag to orbit · scroll to zoom · drag columns, hosted foundations, walls or openings to edit
    </div>
  </div>
}
