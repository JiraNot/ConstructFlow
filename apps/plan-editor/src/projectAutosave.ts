import { deserializeProject, serializeProject } from '@constructflow/project-model'
import { validateConstructionProject } from '@constructflow/domain-providers'

const DATABASE_NAME = 'constructflow-local-projects'
const DATABASE_VERSION = 1
const STORE_NAME = 'snapshots'
const ACTIVE_PROJECT_KEY = 'active-project'

export interface LocalProjectSnapshot {
  projectJson: string
  savedProjectJson: string | null
  replacementBaselineJson: string | null
  savedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('เบราว์เซอร์นี้ไม่รองรับ IndexedDB'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('เปิดพื้นที่บันทึกในเครื่องไม่สำเร็จ'))
    request.onblocked = () => reject(new Error('พื้นที่บันทึกในเครื่องกำลังถูกใช้งานจากแท็บอื่น'))
  })
}

export async function loadLocalProjectSnapshot(): Promise<LocalProjectSnapshot | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_PROJECT_KEY)
    request.onsuccess = () => {
      const value = request.result as LocalProjectSnapshot | undefined
      if (!value || typeof value.projectJson !== 'string') {
        resolve(null)
        return
      }
      try {
        // Never let an invalid/stale browser snapshot replace the valid current document.
        const project = deserializeProject(value.projectJson)
        validateConstructionProject(project)
        resolve({
          projectJson: serializeProject(project),
          savedProjectJson: typeof value.savedProjectJson === 'string' ? value.savedProjectJson : null,
          replacementBaselineJson: typeof value.replacementBaselineJson === 'string' ? value.replacementBaselineJson : null,
          savedAt: Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
        })
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('อ่านงานที่บันทึกในเครื่องไม่สำเร็จ'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error ?? new Error('อ่านงานที่บันทึกในเครื่องไม่สำเร็จ'))
  })
}

export async function saveLocalProjectSnapshot(snapshot: Omit<LocalProjectSnapshot, 'savedAt'>): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({ ...snapshot, savedAt: Date.now() } satisfies LocalProjectSnapshot, ACTIVE_PROJECT_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องถูกยกเลิก')) }
  })
}
