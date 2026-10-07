import type { ProjectDocument } from '@constructflow/project-model'

export interface LocalProjectFile {
  name: string
  text: () => Promise<string>
}

export interface LocalProjectWritable {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>
}

export interface LocalProjectFileHandle {
  getFile: () => Promise<File>
  createWritable: () => Promise<LocalProjectWritable>
}

export interface ReadProjectFileResult {
  project: ProjectDocument
  serialized: string
  name: string
}

export function readProjectFile(file: LocalProjectFile): Promise<ReadProjectFileResult>
export function writeProjectFile(handle: LocalProjectFileHandle, serializedProject: string): Promise<void>
