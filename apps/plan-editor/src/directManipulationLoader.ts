type DirectManipulationModule = typeof import('./directManipulation.mjs')

let modulePromise: Promise<DirectManipulationModule> | null = null

/** Loads drag-only geometry helpers after the user starts manipulating a model object. */
export function loadDirectManipulation() {
  modulePromise ??= import('./directManipulation.mjs')
  return modulePromise
}
