const UNIT_TO_MM = new Map([['mm', 1], ['cm', 10], ['m', 1000]])

function parseRows(source) {
  const rows = []
  let row = [], value = '', quoted = false
  const pushValue = () => { row.push(value); value = '' }
  const pushRow = () => {
    pushValue()
    if (row.some(cell => cell.trim())) rows.push(row)
    row = []
  }
  const input = source.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { value += '"'; index += 1 }
      else if (char === '"') quoted = false
      else value += char
    } else if (char === '"' && value.length === 0) quoted = true
    else if (char === ',') pushValue()
    else if (char === '\n') pushRow()
    else if (char !== '\r') value += char
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field')
  if (row.length || value.length) pushRow()
  return rows
}

function requiredColumn(index, name) {
  const column = index.get(name)
  if (column === undefined) throw new Error(`CSV requires a ${name} column`)
  return column
}

/** Imports explicit survey observations; no coordinate unit or provenance is inferred. */
export function importSiteSurveyCsv(source, { fileName = 'site-survey.csv', id = crypto.randomUUID(), importedAt = new Date().toISOString() } = {}) {
  const rows = parseRows(source)
  if (rows.length < 2) throw new Error('Survey CSV must contain a header and at least one point')
  const headers = rows[0].map(value => value.trim().toLowerCase())
  const columns = new Map(headers.map((header, column) => [header, column]))
  if (new Set(headers).size !== headers.length) throw new Error('Survey CSV column names must be unique')
  const idColumn = requiredColumn(columns, 'id')
  const nameColumn = requiredColumn(columns, 'name')
  const xColumn = requiredColumn(columns, 'x')
  const yColumn = requiredColumn(columns, 'y')
  const sourceColumn = requiredColumn(columns, 'source_status')
  const referenceColumn = requiredColumn(columns, 'source_reference')
  const unitsColumn = requiredColumn(columns, 'units')
  const coordinateSystemColumn = requiredColumn(columns, 'coordinate_system')
  const elevationColumn = columns.get('elevation')
  const boundaryColumn = columns.get('boundary_id')
  const boundaryNameColumn = columns.get('boundary_name')
  const points = []
  const boundaries = new Map()
  let commonUnits = null, coordinateSystem = null
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const cell = column => (row[column] ?? '').trim()
    const line = rowIndex + 1
    const unit = cell(unitsColumn).toLowerCase()
    const factor = UNIT_TO_MM.get(unit)
    if (!factor) throw new Error(`Survey CSV line ${line}: units must be mm, cm, or m`)
    if (commonUnits && commonUnits !== unit) throw new Error(`Survey CSV line ${line}: coordinate units must be consistent`)
    commonUnits = unit
    const reference = cell(coordinateSystemColumn)
    if (!reference) throw new Error(`Survey CSV line ${line}: coordinate_system is required`)
    if (coordinateSystem && coordinateSystem !== reference) throw new Error(`Survey CSV line ${line}: coordinate_system must be consistent`)
    coordinateSystem = reference
    const pointId = cell(idColumn), name = cell(nameColumn)
    if (!pointId || !name) throw new Error(`Survey CSV line ${line}: id and name are required`)
    const xText = cell(xColumn), yText = cell(yColumn)
    const x = Number(xText), y = Number(yText)
    if (!xText || !yText || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Survey CSV line ${line}: x and y must be finite numbers`)
    const sourceStatus = cell(sourceColumn).toLowerCase()
    if (!['measured', 'assumed'].includes(sourceStatus)) throw new Error(`Survey CSV line ${line}: source_status must be measured or assumed`)
    const sourceReference = cell(referenceColumn)
    if (!sourceReference) throw new Error(`Survey CSV line ${line}: source_reference is required`)
    const elevationText = elevationColumn === undefined ? '' : cell(elevationColumn)
    const elevation = elevationText ? Number(elevationText) : null
    if (elevationText && !Number.isFinite(elevation)) throw new Error(`Survey CSV line ${line}: elevation must be a finite number`)
    points.push({
      id: pointId, name, x_mm: x * factor, y_mm: y * factor,
      ...(elevation === null ? {} : { elevation_mm: elevation * factor }),
      source_status: sourceStatus, source_reference: sourceReference,
    })
    const boundaryId = boundaryColumn === undefined ? '' : cell(boundaryColumn)
    if (boundaryId) {
      const boundaryName = boundaryNameColumn === undefined ? boundaryId : cell(boundaryNameColumn) || boundaryId
      const boundary = boundaries.get(boundaryId) ?? { id: boundaryId, name: boundaryName, point_ids: [] }
      if (boundary.name !== boundaryName) throw new Error(`Survey CSV line ${line}: boundary_name must be consistent for ${boundaryId}`)
      boundary.point_ids.push(pointId)
      boundaries.set(boundaryId, boundary)
    }
  }
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return {
    id, name: baseName || 'Site survey', source_file: fileName,
    coordinate_system: coordinateSystem, imported_at: importedAt,
    points, boundaries: [...boundaries.values()],
  }
}
