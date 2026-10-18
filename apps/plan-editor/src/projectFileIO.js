/** Read and canonicalize a local ConstructFlow project file before it replaces editor state. */
export async function readProjectFile(file) {
  const { readProjectFile: read } = await import('./projectFileRead.js')
  return read(file)
}

/** Persist one complete project snapshot through the browser's local file handle. */
export async function writeProjectFile(handle, serializedProject) {
  const permission = await handle.queryPermission?.({ mode: 'readwrite' })
  if (permission && permission !== 'granted') {
    const requested = await handle.requestPermission?.({ mode: 'readwrite' })
    if (requested !== 'granted') throw new Error('เบราว์เซอร์ยังไม่ได้อนุญาตให้เขียนไฟล์โครงการ')
  }
  const writable = await handle.createWritable()
  try {
    await writable.write(serializedProject)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort?.()
    } catch {
      // Preserve the original write/close error; an abort may fail after a partial close.
    }
    throw error
  }
}
