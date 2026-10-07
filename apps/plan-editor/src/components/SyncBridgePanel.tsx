import React, { useState } from 'react'
import { ProjectDocument } from '@constructflow/project-model'
import { CommandEnvelope } from '@constructflow/command-schema'
import { ArrowRightLeft, Copy, Send, Download, Sparkles, HelpCircle } from 'lucide-react'

interface SyncBridgePanelProps {
  project: ProjectDocument
  commandQueue: CommandEnvelope[]
  onClearQueue: () => void
  onExportProject: () => void
}

export const SyncBridgePanel: React.FC<SyncBridgePanelProps> = ({
  project,
  commandQueue,
  onClearQueue,
  onExportProject,
}) => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')
  const [syncLog, setSyncLog] = useState<string>('')
  const [copiedFullScript, setCopiedFullScript] = useState(false)
  const [copiedIncrementalScript, setCopiedIncrementalScript] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Generate pure, self-contained Ruby script that generates the ENTIRE current 2D plan as 3D in SketchUp
  const generateFullProjectRubyScript = () => {
    const jsonStr = JSON.stringify(project, null, 2)
    let script = `# ─────────────────────────────────────────────────────────────────────────────\n`
    script += `# ConstructFlow: Full 2D Plan -> SketchUp 3D Model Sync Script\n`
    script += `# Instructions: Open SketchUp -> Window -> Ruby Console -> Paste & press Enter\n`
    script += `# ─────────────────────────────────────────────────────────────────────────────\n\n`
    script += `require 'json'\n\n`
    script += `project_json = <<-'CF_PROJECT_JSON_DATA'\n`
    script += `${jsonStr}\n`
    script += `CF_PROJECT_JSON_DATA\n\n`
    script += `runtime = defined?(JiraNot::ConstructFlow::Runtime) ? JiraNot::ConstructFlow::Runtime : nil\n`
    script += `unless runtime\n`
    script += `  puts "❌ Error: ConstructFlow runtime is not running in SketchUp."\n`
    script += `  return\n`
    script += `end\n\n`
    script += `model = (runtime&.active_model) || Sketchup.active_model\n\n`
    script += `# Ensure PlanEditorSync is loaded\n`
    script += `begin\n`
    script += `  require 'constructflow/core/plan_editor_sync'\n`
    script += `rescue LoadError\n`
    script += `  # Fallback to direct execution\n`
    script += `end\n\n`
    script += `if defined?(JiraNot::ConstructFlow::Core::PlanEditorSync)\n`
    script += `  JiraNot::ConstructFlow::Core::PlanEditorSync.sync_project_json(project_json, runtime)\n`
    script += `else\n`
    script += `  # Self-contained direct execution fallback\n`
    script += `  doc = JSON.parse(project_json)\n`
    script += `  objects = doc['objects'] || {}\n`
    script += `  project_id = doc.dig('project', 'id') || 'CF-PROJ'\n`
    script += `  stats = { cols: 0, fnds: 0, bms: 0, walls: 0, openings: 0 }\n\n`
    script += `  model.start_operation("ConstructFlow: Build 3D from Plan", true)\n`
    script += `  begin\n`
    script += `    # 0. Levels\n`
    script += `    levels = doc['levels'] || [{ 'id' => 'GF', 'name' => 'Ground Floor', 'elevation_mm' => 0 }, { 'id' => 'L2', 'name' => 'First Floor', 'elevation_mm' => 3000 }]\n`
    script += `    levels.each do |lvl|\n`
    script += `      lvl_id = lvl['id'].to_s\n`
    script += `      next if runtime.levels.registered?(lvl_id) rescue false\n`
    script += `      runtime.commands.execute('CreateLevel', {\n`
    script += `        id: lvl_id, name: lvl['name'] || lvl_id,\n`
    script += `        elevation_mm: Float(lvl['elevation_mm'] || 0), kind: 'floor'\n`
    script += `      }, project_id: project_id)\n`
    script += `    end\n\n`
    script += `    # 1. Columns\n`
    script += `    objects.each_value do |o|\n`
    script += `      next unless o['object_type'] == 'structure.column'\n`
    script += `      m = o['module_data'] || {}\n`
    script += `      loc = m['location_mm'] || [0, 0, 0]\n`
    script += `      loc_3d = [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)]\n`
    script += `      res = runtime.commands.execute('CreateColumn', {\n`
    script += `        id: o['id'], mark: m['mark'] || 'C1',\n`
    script += `        location_mm: loc_3d,\n`
    script += `        section_mm: m['section_mm'] || [200, 200],\n`
    script += `        height_mm: Float(m['height_mm'] || 3000),\n`
    script += `        base_level_id: m['base_level_id'] || 'GF',\n`
    script += `        top_level_id: m['top_level_id'] || 'L2'\n`
    script += `      }, project_id: project_id)\n`
    script += `      if res[:status] == 'success'\n`
    script += `        stats[:cols] += 1\n`
    script += `      else\n`
    script += `        puts \"❌ Column rejected (\#{m['mark']}): \#{res[:errors]&.join('; ')}\"\n`
    script += `      end\n`
    script += `    end\n\n`
    script += `    # 2. Footings\n`
    script += `    objects.each_value do |o|\n`
    script += `      next unless o['object_type'] == 'structure.foundation'\n`
    script += `      m = o['module_data'] || {}\n`
    script += `      loc = m['center_mm'] || m['location_mm']\n`
    script += `      loc_3d = loc ? [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)] : nil\n`
    script += `      fnd_input = {\n`
    script += `        id: o['id'], mark: m['mark'] || 'F1',\n`
    script += `        supported_column_id: m['supported_column_id'],\n`
    script += `        size_mm: m['size_mm'] || [800, 800, 300]\n`
    script += `      }\n`
    script += `      fnd_input[:location_mm] = loc_3d if loc_3d\n`
    script += `      res = runtime.commands.execute('CreateFoundation', fnd_input, project_id: project_id)\n`
    script += `      if res[:status] == 'success'\n`
    script += `        stats[:fnds] += 1\n`
    script += `      else\n`
    script += `        puts \"❌ Foundation rejected (\#{m['mark']}): \#{res[:errors]&.join('; ')}\"\n`
    script += `      end\n`
    script += `    end\n\n`
    script += `    # 3. Beams\n`
    script += `    objects.each_value do |o|\n`
    script += `      next unless o['object_type'] == 'structure.beam'\n`
    script += `      m = o['module_data'] || {}\n`
    script += `      p1 = m['start_point_mm'] || [0, 0, 0]\n`
    script += `      p2 = m['end_point_mm'] || [4000, 0, 0]\n`
    script += `      p1_3d = [Float(p1[0]), Float(p1[1]), Float(p1[2] || 0)]\n`
    script += `      p2_3d = [Float(p2[0]), Float(p2[1]), Float(p2[2] || 0)]\n`
    script += `      res = runtime.commands.execute('CreateBeam', {\n`
    script += `        id: o['id'], mark: m['mark'] || 'B1',\n`
    script += `        path_mm: [p1_3d, p2_3d], section_mm: m['section_mm'] || [200, 400],\n`
    script += `        level_id: m['level_id'] || 'GF'\n`
    script += `      }, project_id: project_id)\n`
    script += `      if res[:status] == 'success'\n`
    script += `        stats[:bms] += 1\n`
    script += `      else\n`
    script += `        puts \"❌ Beam rejected (\#{m['mark']}): \#{res[:errors]&.join('; ')}\"\n`
    script += `      end\n`
    script += `    end\n\n`
    script += `    # 4. Walls\n`
    script += `    objects.each_value do |o|\n`
    script += `      next unless o['object_type'] == 'architecture.wall'\n`
    script += `      m = o['module_data'] || {}\n`
    script += `      p1 = m['start_point_mm'] || [0, 0, 0]\n`
    script += `      p2 = m['end_point_mm'] || [4000, 0, 0]\n`
    script += `      p1_3d = [Float(p1[0]), Float(p1[1]), Float(p1[2] || 0)]\n`
    script += `      p2_3d = [Float(p2[0]), Float(p2[1]), Float(p2[2] || 0)]\n`
    script += `      res = runtime.commands.execute('CreateWall', {\n`
    script += `        id: o['id'], mark: m['mark'] || 'W1',\n`
    script += `        path_mm: [p1_3d, p2_3d], thickness_mm: Float(m['thickness_mm'] || 100),\n`
    script += `        height_mm: Float(m['height_mm'] || 2800),\n`
    script += `        level_id: m['level_id'] || 'GF'\n`
    script += `      }, project_id: project_id)\n`
    script += `      if res[:status] == 'success'\n`
    script += `        stats[:walls] += 1\n`
    script += `      else\n`
    script += `        puts \"❌ Wall rejected (\#{m['mark']}): \#{res[:errors]&.join('; ')}\"\n`
    script += `      end\n`
    script += `    end\n\n`
    script += `    # 5. Doors & Windows\n`
    script += `    objects.each_value do |o|\n`
    script += `      is_door = o['object_type'] == 'door_window.door'\n`
    script += `      is_win = o['object_type'] == 'door_window.window'\n`
    script += `      next unless is_door || is_win\n`
    script += `      m = o['module_data'] || {}\n`
    script += `      wall_id = m['wall_id'] || (o['host_refs'] && o['host_refs'][0])\n`
    script += `      next unless wall_id\n`
    script += `      loc = m['location_mm'] || [0, 0, 0]\n`
    script += `      loc_3d = [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)]\n`
    script += `      res = runtime.commands.execute('PlaceDoorWindowOnWall', {\n`
    script += `        id: o['id'], host_object_id: wall_id,\n`
    script += `        point_mm: loc_3d,\n`
    script += `        width_mm: Float(m['width_mm'] || (is_door ? 800 : 1200)),\n`
    script += `        height_mm: Float(m['height_mm'] || (is_door ? 2000 : 1200)),\n`
    script += `        sill_mm: Float(m['sill_height_mm'] || (is_door ? 0 : 900)),\n`
    script += `        handing: m['handing'] || 'left_in',\n`
    script += `        category: is_door ? 'door' : 'window',\n`
    script += `        schedule_mark: m['mark'] || (is_door ? 'D1' : 'W1')\n`
    script += `      }, project_id: project_id)\n`
    script += `      if res[:status] == 'success'\n`
    script += `        stats[:openings] += 1\n`
    script += `      else\n`
    script += `        puts \"❌ Opening rejected (\#{m['mark']}): \#{res[:errors]&.join('; ')}\"\n`
    script += `      end\n`
    script += `    end\n\n`
    script += `    model.commit_operation\n`
    script += `    puts \"🎉 ConstructFlow: 3D Model Synced! [\#{stats.inspect}]\"\n`
    script += `  rescue => err\n`
    script += `    model.abort_operation\n`
    script += `    puts \"❌ ConstructFlow Sync Error: \#{err.message}\"\n`
    script += `  end\n`
    script += `end\n`
    return script
  }

  // Generate pure Ruby incremental execution script for pending mutations
  const generateIncrementalRubyScript = () => {
    let script = `# ConstructFlow Incremental Sync Script (Pending Events)\n`
    script += `runtime = JiraNot::ConstructFlow::Runtime\n`
    script += `model = runtime.active_model || Sketchup.active_model\n`
    script += `project_id = runtime.project.project_id rescue 'CF-PROJ'\n\n`
    script += `model.start_operation("ConstructFlow Incremental Sync", true)\n`
    script += `begin\n`

    for (const cmd of commandQueue) {
      const inputJson = JSON.stringify(cmd.input)
      script += `  # [${cmd.name}] ${cmd.command_id}\n`
      script += `  runtime.commands.execute("${cmd.name}", ${inputJson}, project_id: project_id)\n`
    }

    script += `  model.commit_operation\n`
    script += `  puts "ConstructFlow: Incremental sync completed for ${commandQueue.length} commands."\n`
    script += `rescue => err\n`
    script += `  model.abort_operation\n`
    script += `  puts "ConstructFlow Incremental error: \#{err.message}"\n`
    script += `end\n`
    return script
  }

  const handleCopyFullScript = () => {
    const script = generateFullProjectRubyScript()
    navigator.clipboard.writeText(script)
    setCopiedFullScript(true)
    setTimeout(() => setCopiedFullScript(false), 2500)
  }

  const handleCopyIncrementalScript = () => {
    const script = generateIncrementalRubyScript()
    navigator.clipboard.writeText(script)
    setCopiedIncrementalScript(true)
    setTimeout(() => setCopiedIncrementalScript(false), 2500)
  }

  const handlePostToBridge = async () => {
    if (commandQueue.length === 0) return
    setSyncStatus('syncing')
    setSyncLog(`Dispatching ${commandQueue.length} semantic commands to bridge...`)

    try {
      const res = await fetch('http://localhost:8000/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: commandQueue }),
      })

      if (res.ok) {
        setSyncStatus('synced')
        setSyncLog(`Successfully committed ${commandQueue.length} commands into SketchUp CommandBus!`)
        onClearQueue()
      } else {
        throw new Error(`Bridge returned HTTP ${res.status}`)
      }
    } catch (err: any) {
      setSyncStatus('idle')
      setSyncLog(`Bridge offline (port 8000). Use 'Copy Full Plan Ruby Script' to paste into SketchUp console, or export file.`)
    }
  }

  const totalElements = Object.keys(project.objects || {}).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600, fontSize: 13 }}>
          <ArrowRightLeft size={16} />
          SKETCHUP 3D SYNC BRIDGE
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          title="ดูวิธีใช้งานการซิงค์"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <HelpCircle size={15} />
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
        ConstructFlow คำนวณโมเดล 3D และ BOQ ได้ในตัว Bridge นี้ใช้ส่งออกไป SketchUp โดยรักษา UUID
      </div>

      {/* Instructions Accordion */}
      {showHelp && (
        <div style={{
          background: '#090d16',
          border: '1px solid #1e293b',
          borderRadius: 6,
          padding: 10,
          fontSize: 11,
          color: '#cbd5e1',
          lineHeight: 1.5,
        }}>
          <b style={{ color: '#38bdf8' }}>วิธีนำผังไปสร้างเป็นโมเดล 3D ใน SketchUp:</b>
          <ol style={{ paddingLeft: 18, marginTop: 4, marginBottom: 4 }}>
            <li>
              <b>วิธีที่ 1 (เร็วที่สุด):</b> คลิกปุ่ม <i>"Copy Full Plan Ruby Script"</i> ด้านล่าง ➔ เปิด SketchUp ➔ เปิดเมนู <code>Window &gt; Ruby Console</code> ➔ กด <code>Ctrl+V</code> วางแล้วกด Enter
            </li>
            <li>
              <b>วิธีที่ 2 (ผ่านไฟล์):</b> คลิกปุ่ม <i>"Export project.cfproj"</i> ➔ ใน SketchUp เปิดเมนู <code>Extensions &gt; ConstructFlow &gt; นำเข้าผังจาก Plan Editor...</code>
            </li>
          </ol>
        </div>
      )}

      {/* Primary Action: Full Plan 3D Generation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={handleCopyFullScript}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            background: copiedFullScript ? '#16a34a' : '#0284c7',
            color: '#ffffff',
            border: 'none',
            padding: '9px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 12,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'background 0.2s',
          }}
        >
          <Sparkles size={15} />
          {copiedFullScript ? '✓ Copied! Paste into SketchUp Ruby Console' : `Copy Full 3D Script (${totalElements} ชิ้น)`}
        </button>

        <button
          onClick={onExportProject}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #3b82f6',
            padding: '7px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Download size={13} />
          Export project.cfproj (นำเข้าใน SketchUp)
        </button>
      </div>

      {/* Secondary Actions: Incremental Sync & Events */}
      <div style={{
        marginTop: 4,
        paddingTop: 8,
        borderTop: '1px dashed #334155',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>MUTATION STREAM</span>
          <span style={{
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 4,
            background: commandQueue.length > 0 ? '#38bdf8' : '#334155',
            color: commandQueue.length > 0 ? '#0f172a' : '#ffffff',
            fontWeight: 700,
          }}>
            {commandQueue.length} Pending
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleCopyIncrementalScript}
            disabled={commandQueue.length === 0}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: '#0f172a',
              color: commandQueue.length > 0 ? (copiedIncrementalScript ? '#22c55e' : '#cbd5e1') : '#475569',
              border: '1px solid #334155',
              padding: '5px 8px',
              borderRadius: 5,
              cursor: commandQueue.length > 0 ? 'pointer' : 'default',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            <Copy size={11} />
            {copiedIncrementalScript ? 'Copied Pending!' : 'Copy Pending Events'}
          </button>

          <button
            onClick={handlePostToBridge}
            disabled={commandQueue.length === 0 || syncStatus === 'syncing'}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: '#0f172a',
              color: commandQueue.length > 0 ? '#38bdf8' : '#475569',
              border: '1px solid #334155',
              padding: '5px 8px',
              borderRadius: 5,
              cursor: commandQueue.length > 0 ? 'pointer' : 'default',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            <Send size={11} />
            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync HTTP Bridge'}
          </button>
        </div>
      </div>

      {syncLog && (
        <div style={{
          fontSize: 10,
          fontFamily: 'monospace',
          background: '#020617',
          padding: '6px 8px',
          borderRadius: 4,
          color: syncStatus === 'synced' ? '#4ade80' : '#94a3b8',
          border: '1px solid #1e293b',
          maxHeight: 60,
          overflowY: 'auto',
        }}>
          {syncLog}
        </div>
      )}

      {/* Recent Sync Events Log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          maxHeight: 120,
          overflowY: 'auto',
          background: '#0a0f1d',
          borderRadius: 6,
          border: '1px solid #1e293b',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}>
          {commandQueue.length === 0 ? (
            <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: '8px 0' }}>
              No unsynced mutations
            </div>
          ) : (
            commandQueue.slice(-8).reverse().map((cmd, idx) => (
              <div
                key={cmd.command_id || idx}
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  padding: '3px 6px',
                  borderRadius: 4,
                  background: '#131d31',
                  borderLeft: '2px solid #38bdf8',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{cmd.name}</span>
                <span style={{ color: '#94a3b8' }}>
                  {typeof cmd.input.mark === 'string'
                    ? cmd.input.mark
                    : typeof cmd.input.tag === 'string'
                      ? cmd.input.tag
                      : typeof cmd.input.object_id === 'string'
                        ? cmd.input.object_id.slice(0, 6)
                        : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
