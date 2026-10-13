import React from 'react'
import { Copy, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { isGridObject, type SmartObject } from '@constructflow/project-model'

interface PlanCanvasObjectContextMenuProps {
  object: SmartObject
  position: { x: number; y: number }
  containerSize: { width: number; height: number }
  onStartGridCopy: (objectId: string) => void
  onCopy: (objectId: string) => void
  onEditProperties: (objectId: string) => void
  onDelete: (objectId: string) => void
}

export const PlanCanvasObjectContextMenu: React.FC<PlanCanvasObjectContextMenuProps> = ({
  object, position, containerSize, onStartGridCopy, onCopy, onEditProperties, onDelete,
}) => (
  <div
    className="cf-object-context-menu"
    role="menu"
    aria-label="คำสั่งวัตถุ"
    onPointerDown={event => event.stopPropagation()}
    style={{
      left: Math.max(8, Math.min(position.x, containerSize.width - 184)),
      top: Math.max(8, Math.min(position.y, containerSize.height - 92)),
    }}
  >
    {isGridObject(object) && !object.module_data.system_id && <button type="button" role="menuitem" onClick={() => onStartGridCopy(object.id)}>
      <PlusCircle size={15} />ทำสำเนาแล้ววาง
    </button>}
    <button type="button" role="menuitem" onClick={() => onCopy(object.id)}><Copy size={15} />คัดลอก · Ctrl+C</button>
    <button type="button" role="menuitem" onClick={() => onEditProperties(object.id)}><Pencil size={15} />แก้ไขคุณสมบัติ</button>
    <button type="button" role="menuitem" className="is-danger" onClick={() => onDelete(object.id)}><Trash2 size={15} />ลบวัตถุ</button>
  </div>
)
