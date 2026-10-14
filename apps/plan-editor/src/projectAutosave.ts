import { deserializeProject, type ProjectDocument } from '@constructflow/project-model'
import { validateConstructionProject } from '@constructflow/domain-providers'
import { CommandBus } from './commands/CommandBus.js'
import type { LocalProjectFileHandle } from './projectFileIO.js'

const DATABASE_NAME = 'constructflow-local-projects'
const DATABASE_VERSION = 1
const STORE_NAME = 'snapshots'
const ACTIVE_PROJECT_KEY = 'active-project'

export interface LocalProjectSnapshot {
  projectJson: string
  savedProjectJson: string | null
  replacementBaselineJson: string | null
  fileHandle?: LocalProjectFileHandle | null
  savedAt: number
}

export interface LoadedLocalProjectSnapshot extends LocalProjectSnapshot {
  /** The validated parsed document, reused by the editor instead of parsing the same JSON twice. */
  project: ProjectDocument
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

export async function loadLocalProjectSnapshot(): Promise<LoadedLocalProjectSnapshot | null> {
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
        const project = CommandBus.migrateProject(deserializeProject(value.projectJson))
        validateConstructionProject(project)
        resolve({
          projectJson: value.projectJson,
          project,
          savedProjectJson: typeof value.savedProjectJson === 'string' ? value.savedProjectJson : null,
          replacementBaselineJson: typeof value.replacementBaselineJson === 'string' ? value.replacementBaselineJson : null,
          fileHandle: isProjectFileHandle(value.fileHandle) ? value.fileHandle : null,
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

function isProjectFileHandle(value: unknown): value is LocalProjectFileHandle {
  if (!value || typeof value !== 'object') return false
  const handle = value as Partial<LocalProjectFileHandle>
  return typeof handle.getFile === 'function' && typeof handle.createWritable === 'function'
}

export async function saveLocalProjectSnapshot(snapshot: Omit<LocalProjectSnapshot, 'savedAt'>): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const fileHandle = snapshot.fileHandle ? cloneFileHandle(snapshot.fileHandle) : null
    transaction.objectStore(STORE_NAME).put({ ...snapshot, fileHandle, savedAt: Date.now() } satisfies LocalProjectSnapshot, ACTIVE_PROJECT_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องไม่สำเร็จ')) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('บันทึกงานในเครื่องถูกยกเลิก')) }
  })
}

function cloneFileHandle(handle: LocalProjectFileHandle): LocalProjectFileHandle | null {
  try {
    return typeof structuredClone === 'function' ? structuredClone(handle) : null
  } catch {
    // Test adapters and browsers that cannot persist handles still keep the project snapshot.
    return null
  }
}
