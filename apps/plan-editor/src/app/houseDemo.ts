import houseDemoRaw from '../../../../examples/constructflow-reference-house-2storey.cfproj?raw'

/** Keeps the reference-house fixture in a lazy app chunk instead of fetching a .cfproj module at runtime. */
export function loadHouseDemoRaw() {
  return houseDemoRaw
}
