#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { ProjectCommandSession } from '../../packages/command-runtime/dist/index.js'
import { deserializeProject, serializeProject } from '../../packages/project-model/dist/index.js'
import { calculateTakeoff } from '../../packages/takeoff-engine/dist/index.js'
import { evaluateProjectSiteAndLegalCompliance, runCoordination } from '../../packages/clash-engine/dist/index.js'
import { exportProjectToDxf } from '../../packages/cad-adapter/dist/index.js'
import { exportProjectToIfc, serializeRevitTransfer } from '../../packages/bim-adapter/dist/index.js'

function execute(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Request must be a JSON object')
  if (typeof request.project_json !== 'string') throw new Error('project_json must contain the canonical project document JSON')
  const operation = request.operation ?? 'mutate'
  if (operation === 'mutate' && (!Array.isArray(request.commands) || request.commands.length === 0 || request.commands.length > 100)) throw new Error('commands must contain between 1 and 100 command requests')
  const project = deserializeProject(request.project_json)
  const history = readHistory(request.history, project.project.id)
  if (operation === 'query') {
    const { phase, level_id: levelId, category } = request.filters ?? {}
    const limit = request.limit ?? 500
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('limit must be an integer from 1 to 5000')
    const objects = Object.values(project.objects).filter(object =>
      (!phase || object.created_phase === phase)
      && (!levelId || object.level_refs.some(ref => ref.level_id === levelId) || object.module_data.level_id === levelId)
      && (!category || object.object_type.startsWith(category)),
    ).slice(0, limit).map(object => ({
      id: object.id,
      object_type: object.object_type,
      created_phase: object.created_phase,
      removed_phase: object.removed_phase,
      status: object.status,
      level_refs: object.level_refs,
      host_refs: object.host_refs,
      module_data: object.module_data,
    }))
    return { status: 'success', operation, project_id: project.project.id, total_objects: objects.length, objects }
  }
  if (operation === 'takeoff') return { status: 'success', operation, report: calculateTakeoff(project) }
  if (operation === 'coordination') return { status: 'success', operation, report: runCoordination(project) }
  if (operation === 'legal_compliance') {
    return {
      status: 'success',
      operation,
      report: evaluateProjectSiteAndLegalCompliance(project, request.options),
    }
  }
  if (operation === 'export') {
    const format = request.format
    if (format === 'dxf') {
      const result = exportProjectToDxf(project, request.options)
      return {
        status: 'success', operation, format,
        content: result.dxfContent,
        publish_script: result.publishScriptContent,
        layouts_count: result.layoutsCount,
        layers_count: result.layersCount,
      }
    }
    if (format === 'ifc') {
      const result = exportProjectToIfc(project, request.options)
      return { status: 'success', operation, format, content: result.ifcContent, byte_length: result.byteLength }
    }
    if (format === 'revit_transfer') {
      return { status: 'success', operation, format, document: serializeRevitTransfer(project) }
    }
    throw new Error('format must be one of: dxf, ifc, revit_transfer')
  }
  if (operation === 'undo' || operation === 'redo') {
    const session = new ProjectCommandSession(project, history)
    const updatedProject = operation === 'undo' ? session.undo() : session.redo()
    return {
      status: 'success', operation,
      project_json: serializeProject(updatedProject),
      history: writeHistory(session.historySnapshot),
      can_undo: session.canUndo,
      can_redo: session.canRedo,
    }
  }
  if (operation !== 'mutate') throw new Error(`Unsupported standalone operation: ${String(operation)}`)
  const session = new ProjectCommandSession(project, history)
  const result = session.execute(request.commands, 'ai')
  return {
    status: result.status,
    transaction_id: result.transaction_id,
    failed_command_index: result.failed_command_index,
    errors: result.errors ?? [],
    results: result.results,
    project_json: serializeProject(result.updatedProject),
    history: writeHistory(session.historySnapshot),
    can_undo: session.canUndo,
    can_redo: session.canRedo,
    committed: result.status === 'success',
  }
}

function readHistory(value, projectId) {
  if (value === undefined) return { past: [], future: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new Error('history must contain past and future arrays')
  }
  if (value.past.length > 100 || value.future.length > 100) throw new Error('history is limited to 100 snapshots per direction')
  const decode = (snapshots) => snapshots.map((snapshot) => {
    if (typeof snapshot !== 'string') throw new Error('history snapshots must be canonical project JSON strings')
    const decoded = deserializeProject(snapshot)
    if (decoded.project.id !== projectId) throw new Error('history snapshot belongs to a different project')
    return decoded
  })
  return { past: decode(value.past), future: decode(value.future) }
}

function writeHistory(history) {
  return {
    past: history.past.slice(-100).map(serializeProject),
    future: history.future.slice(-100).map(serializeProject),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const request = JSON.parse(readFileSync(0, 'utf8'))
    process.stdout.write(`${JSON.stringify(execute(request))}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'rejected', committed: false, errors: [error instanceof Error ? error.message : String(error)] })}\n`)
    process.exitCode = 1
  }
}

export { execute }
