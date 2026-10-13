import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { deserializeProject, serializeProject, type ProjectDocument } from '@constructflow/project-model'
import type { CommandEnvelope } from '@constructflow/command-schema'
import { loadLocalProjectSnapshot, saveLocalProjectSnapshot } from '../projectAutosave.js'
import type { LocalProjectFileHandle } from '../projectFileIO.js'

type ProjectSessionRef = { current: { reset: (project: ProjectDocument) => void } | null }

interface UseLocalProjectPersistenceOptions {
  project: ProjectDocument
  sessionRef: ProjectSessionRef
  setProjectState: Dispatch<SetStateAction<ProjectDocument>>
  setCommandQueue: Dispatch<SetStateAction<CommandEnvelope[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
}

/** Owns local snapshot restore/autosave state without taking ownership of the project model. */
export function useLocalProjectPersistence({
  project, sessionRef, setProjectState, setCommandQueue, setSelectedId,
}: UseLocalProjectPersistenceOptions) {
  const projectJson = useMemo(() => serializeProject(project), [project])
  const [savedProjectJson, setSavedProjectJson] = useState<string | null>(projectJson)
  const [replacementBaselineJson, setReplacementBaselineJson] = useState<string | null>(projectJson)
  const [localAutosaveReady, setLocalAutosaveReady] = useState(false)
  const [localAutosaveState, setLocalAutosaveState] = useState<'restoring' | 'saving' | 'saved' | 'error'>('restoring')
  const [activeProjectFileHandle, setActiveProjectFileHandle] = useState<LocalProjectFileHandle | null>(null)
  const [fileFeedback, setFileFeedback] = useState('')
  const activeProjectFileHandleRef = useRef<LocalProjectFileHandle | null>(null)

  const updateActiveProjectFileHandle = (handle: LocalProjectFileHandle | null) => {
    activeProjectFileHandleRef.current = handle
    setActiveProjectFileHandle(handle)
  }

  useEffect(() => {
    let active = true
    void loadLocalProjectSnapshot()
      .then(snapshot => {
        if (!active || !snapshot) return
        const restored = deserializeProject(snapshot.projectJson)
        sessionRef.current!.reset(restored)
        setProjectState(restored)
        setSavedProjectJson(snapshot.savedProjectJson)
        setReplacementBaselineJson(snapshot.replacementBaselineJson)
        updateActiveProjectFileHandle(snapshot.fileHandle ?? null)
        setCommandQueue([])
        setSelectedId(null)
        setFileFeedback(`กู้คืนงานในเครื่องเมื่อ ${new Date(snapshot.savedAt).toLocaleString()}`)
      })
      .catch(error => {
        if (!active) return
        console.error('Unable to restore local ConstructFlow project', error)
        setLocalAutosaveState('error')
        setFileFeedback('กู้คืนงานในเครื่องไม่สำเร็จ')
      })
      .finally(() => {
        if (active) setLocalAutosaveReady(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!localAutosaveReady) return
    setLocalAutosaveState('saving')
    let saving = false
    const persistSnapshot = () => {
      if (saving) return
      saving = true
      void saveLocalProjectSnapshot({ projectJson, savedProjectJson, replacementBaselineJson, fileHandle: activeProjectFileHandle })
        .then(() => setLocalAutosaveState('saved'))
        .catch(error => {
          console.error('Unable to autosave local ConstructFlow project', error)
          setLocalAutosaveState('error')
        })
    }
    const timer = window.setTimeout(persistSnapshot, 350)
    window.addEventListener('pagehide', persistSnapshot)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', persistSnapshot)
    }
  }, [localAutosaveReady, projectJson, savedProjectJson, replacementBaselineJson, activeProjectFileHandle])

  return {
    projectJson,
    savedProjectJson,
    setSavedProjectJson,
    replacementBaselineJson,
    setReplacementBaselineJson,
    localAutosaveReady,
    localAutosaveState,
    setLocalAutosaveState,
    activeProjectFileHandle,
    activeProjectFileHandleRef,
    updateActiveProjectFileHandle,
    fileFeedback,
    setFileFeedback,
  }
}
