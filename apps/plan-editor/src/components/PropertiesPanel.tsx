import React from 'react'
import { EmptySelectionProperties, MultiSelectionProperties } from './SelectionProperties.js'
import { resolvePropertiesSelection } from './propertiesSelection.js'
import { SelectedObjectProperties } from './SelectedObjectProperties.js'
import type { PropertiesPanelProps } from './PropertiesPanel.types.js'

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

  return <SelectedObjectProperties props={props} selection={selection} />
}
