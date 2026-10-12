/** Convert canonical millimetres to the Z-up Three.js scene.
 * Wall extrusion uses local XY for length/height and local Z for thickness:
 * tip it upright first, then rotate it around the WORLD vertical axis.
 */
export function applyRepresentationTransform3D(root, representation) {
  root.position.set(...representation.position_mm.map(value => value / 1000))
  if (representation.shape.kind === 'wall_extrusion')
    root.rotation.set(Math.PI / 2, 0, representation.rotation_rad, 'ZXY')
  else root.rotation.set(0, 0, representation.rotation_rad, 'XYZ')
}
