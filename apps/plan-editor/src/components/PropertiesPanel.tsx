import React, { lazy, Suspense } from 'react'
import { EmptySelectionProperties, MultiSelectionProperties } from './SelectionProperties.js'
import { resolvePropertiesSelection } from './propertiesSelection.js'
import type { PropertiesPanelProps } from './PropertiesPanel.types.js'

const SelectedObjectProperties = lazy(() => import('./SelectedObjectProperties.js').then(module => ({ default: module.SelectedObjectProperties })))

export const PropertiesPanel: React.FC<PropertiesPanelProps> = props => {
  const { project, selectedId, selectedIds = selectedId ? [selectedId] : [],
    onAssignTypeMany, onUpdateLevelMany, onDeleteObjects } = props
  const selection = resolvePropertiesSelection(project, selectedId, selectedIds)
  const { selectedObject, selectedObjects, family, familyTypes, commonTypeId, canBulkUpdateLevel } = selection

  if (!selectedObject) {
    return <EmptySelectionProperties />
  }

  if (selectedObjects.length > 1) {
    return <MultiSelectionProperties project={project} selectedObjects={selectedObjects} family={family}
      familyTypes={familyTypes} commonTypeId={commonTypeId} canBulkUpdateLevel={canBulkUpdateLevel}
      onAssignTypeMany={onAssignTypeMany} onUpdateLevelMany={onUpdateLevelMany} onDeleteObjects={onDeleteObjects} />
  }

  return <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังโหลดคุณสมบัติวัตถุ…</div>}>
    <SelectedObjectProperties props={props} selection={selection} />
  </Suspense>
}
