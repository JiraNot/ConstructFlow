import { isBeamObject, isColumnObject, isDoorObject, isFoundationObject, isGridObject, isWallObject, isWindowObject } from '@constructflow/project-model'
import { constructionOutputs } from '@constructflow/domain-providers'

export const findPlanHitObject = (
  worldPoint_mm,
  planProject,
  project,
  zoom,
  preferWall = false,
  excluded = new Set(),
) => {
    const [wx, wy] = worldPoint_mm
    const pickObjects = Object.values(planProject.objects).filter(obj => !excluded.has(obj.id))

    const openingTol = Math.max(150, 16 / zoom)

    // Shift-click/drag can target an architectural wall beneath a coincident beam.
    if (preferWall) {
      for (const obj of pickObjects) {
        if (!isWallObject(obj)) continue
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const hitTol = Math.max(obj.module_data.thickness_mm / 2, 12 / zoom)
        const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (lengthSquared <= 0) continue
        const t = Math.max(0, Math.min(1, ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / lengthSquared))
        const nearestX = x1 + t * (x2 - x1)
        const nearestY = y1 + t * (y2 - y1)
        if ((wx - nearestX) ** 2 + (wy - nearestY) ** 2 <= hitTol * hitTol) return obj.id
      }
    }

    // 1. Doors (highest pick priority for openings: wall span + swing arc)
    for (const obj of pickObjects) {
      if (isDoorObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w + openingTol) {
          return obj.id
        }
      }
    }

    // 2. Windows
    for (const obj of pickObjects) {
      if (isWindowObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const w = obj.module_data.width_mm
        const dist = Math.hypot(wx - cx, wy - cy)
        if (dist <= w / 2 + openingTol) {
          return obj.id
        }
      }
    }

    // 3. Columns
    const colTol = Math.max(40, 8 / zoom)
    for (const obj of pickObjects) {
      if (isColumnObject(obj)) {
        const [cx, cy] = obj.module_data.location_mm
        const [w, d] = obj.module_data.section_mm
        if (
          wx >= cx - w / 2 - colTol &&
          wx <= cx + w / 2 + colTol &&
          wy >= cy - d / 2 - colTol &&
          wy <= cy + d / 2 + colTol
        ) {
          return obj.id
        }
      }
    }

    // 4. Foundations
    for (const obj of pickObjects) {
      if (isFoundationObject(obj)) {
        const [cx, cy] = obj.module_data.center_mm
        const [w, l] = obj.module_data.size_mm
        if (
          wx >= cx - w / 2 &&
          wx <= cx + w / 2 &&
          wy >= cy - l / 2 &&
          wy <= cy + l / 2
        ) {
          return obj.id
        }
      }
    }

    // 5. Beams
    for (const obj of pickObjects) {
      if (isBeamObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const [bw] = obj.module_data.section_mm
        const hitTol = Math.max(bw / 2, 12 / zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 6. Walls
    for (const obj of pickObjects) {
      if (isWallObject(obj)) {
        const [x1, y1] = obj.module_data.start_point_mm
        const [x2, y2] = obj.module_data.end_point_mm
        const thick = obj.module_data.thickness_mm
        const hitTol = Math.max(thick / 2, 12 / zoom)
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
        if (l2 > 0) {
          let t = ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / l2
          t = Math.max(0, Math.min(1, t))
          const px = x1 + t * (x2 - x1)
          const py = y1 + t * (y2 - y1)
          const distSq = (wx - px) ** 2 + (wy - py) ** 2
          if (distSq <= hitTol * hitTol) {
            return obj.id
          }
        }
      }
    }

    // 7. Grids
    for (const obj of pickObjects) {
      if (isGridObject(obj)) {
        const { orientation, position_mm } = obj.module_data
        const tol = 12 / zoom
        const start = obj.module_data.start_point_mm ?? (orientation === 'vertical' ? [position_mm, obj.module_data.extent_mm[0]] : [obj.module_data.extent_mm[0], position_mm])
        const end = obj.module_data.end_point_mm ?? (orientation === 'vertical' ? [position_mm, obj.module_data.extent_mm[1]] : [obj.module_data.extent_mm[1], position_mm])
        const dx = end[0] - start[0], dy = end[1] - start[1], lengthSq = dx * dx + dy * dy
        const t = lengthSq ? Math.max(0, Math.min(1, ((wx - start[0]) * dx + (wy - start[1]) * dy) / lengthSq)) : 0
        const distance = Math.hypot(wx - start[0] - t * dx, wy - start[1] - t * dy)
        if (distance <= tol) {
          return obj.id
        }
      }
    }

    for(const out of constructionOutputs(project).filter(v=>!!planProject.objects[v.object_id] && !excluded.has(v.object_id)).reverse()){
      const near=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((wx-a[0])*dx+(wy-a[1])*dy)/len)):0;return Math.hypot(wx-a[0]-t*dx,wy-a[1]-t*dy)<12/zoom}
      if(out.paths.some(path=>path.slice(1).some((v,i)=>near(path[i],v))))return out.object_id
      for(const tr of out.meshes){const signs=tr.map((a,i)=>{const b=tr[(i+1)%3];return (b[0]-a[0])*(wy-a[1])-(b[1]-a[1])*(wx-a[0])});if(Math.abs((tr[1][0]-tr[0][0])*(tr[2][1]-tr[0][1])-(tr[1][1]-tr[0][1])*(tr[2][0]-tr[0][0]))>1&& (signs.every(v=>v>=0)||signs.every(v=>v<=0)))return out.object_id}
    }
    for(const object of [...pickObjects].reverse()){
      const data=object.module_data
      if(object.object_type==='architecture.room_separator'){
        const a=data.start_point_mm,b=data.end_point_mm;if(!a||!b)continue
        const l2=(b[0]-a[0])**2+(b[1]-a[1])**2,t=l2?Math.max(0,Math.min(1,((wx-a[0])*(b[0]-a[0])+(wy-a[1])*(b[1]-a[1]))/l2)):0
        if(Math.hypot(wx-a[0]-t*(b[0]-a[0]),wy-a[1]-t*(b[1]-a[1]))<Math.max(80,10/zoom))return object.id
      }
      if(['architecture.room','architecture.floor','architecture.ceiling'].includes(object.object_type)){
        const ring=data.boundary_mm;if(!ring?.length)continue
        let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>wy)!==(yj>wy))&&(wx<(xj-xi)*(wy-yi)/(yj-yi)+xi))inside=!inside}
        if(inside)return object.id
      }
    }
    return null
  }
