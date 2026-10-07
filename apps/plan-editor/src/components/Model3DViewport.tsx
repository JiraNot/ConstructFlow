import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { ProjectDocument } from '@constructflow/project-model'
import { buildProjectRepresentations3D, type ObjectRepresentation3D, type RepresentationInteraction } from '@constructflow/representation-engine'

type ModelMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> & { userData: { objectId: string; objectType: string; moveable: boolean; interaction: RepresentationInteraction } }
const mmToM = (value: number) => value / 1000

function phaseColor(phase: ObjectRepresentation3D['display_phase']): THREE.ColorRepresentation {
  if (phase === 'existing') return '#94a3b8'
  if (phase === 'demolition') return '#ef4444'
  return '#38bdf8'
}

function makeObjectMesh(representation: ObjectRepresentation3D): ModelMesh {
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
    geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1 })
    geometry.translate(0, 0, -thickness / 2)
  } else {
    const [width, depth, height] = representation.shape.size_mm.map(mmToM)
    geometry = new THREE.BoxGeometry(Math.max(width, 0.01), Math.max(depth, 0.01), Math.max(height, 0.01))
  }
  const displayPhase = representation.display_phase
  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    color: phaseColor(displayPhase),
    roughness: 0.76,
    metalness: representation.object_type === 'structure.beam' && representation.material === 'steel' ? 0.72 : 0.05,
    transparent: displayPhase !== 'new_construction',
    opacity: displayPhase === 'demolition' ? 0.48 : displayPhase === 'existing' ? 0.62 : 1,
    depthWrite: displayPhase === 'new_construction',
  })
  const mesh = new THREE.Mesh(geometry, material) as ModelMesh
  mesh.position.set(...representation.position_mm.map(mmToM) as [number, number, number])
  if (representation.shape.kind === 'wall_extrusion') mesh.rotation.set(Math.PI / 2, 0, representation.rotation_rad)
  else mesh.rotation.z = representation.rotation_rad
  mesh.userData = {
    objectId: representation.object_id,
    objectType: representation.object_type,
    interaction: representation.interaction,
    moveable: representation.interaction.kind !== 'select_only',
  }
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
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
  const meshByIdRef = useRef(new Map<string, ModelMesh>())
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
    camera.position.set(12, -16, 13)
    cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
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
      const target = transform.object as ModelMesh | undefined
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

    scene.add(new THREE.HemisphereLight('#dbeafe', '#172033', 2.1))
    const sun = new THREE.DirectionalLight('#ffffff', 2.4)
    sun.position.set(-8, -10, 15); sun.castShadow = true
    scene.add(sun)
    const grid = new THREE.GridHelper(40, 40, '#334155', '#1e293b')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.015
    scene.add(grid)
    scene.add(new THREE.AxesHelper(1.5))

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
      const hits = raycaster.intersectObjects([...meshByIdRef.current.values()], false)
      selectRef.current(hits.length ? (hits[0].object as ModelMesh).userData.objectId : null)
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
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    meshByIdRef.current.clear()
    const representationResult = buildProjectRepresentations3D(project)
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
      cameraRef.current?.position.set(center.x + radius * 1.55, center.y - radius * 1.8, center.z + radius * 1.35)
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
