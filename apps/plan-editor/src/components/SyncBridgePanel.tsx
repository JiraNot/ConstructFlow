import React, { useState } from 'react'
import { CommandEnvelope } from '@constructflow/command-schema'
import { ArrowRightLeft, CheckCircle2, Copy, Send, Download } from 'lucide-react'

interface SyncBridgePanelProps {
  commandQueue: CommandEnvelope[]
  onClearQueue: () => void
  onExportProject: () => void
}

export const SyncBridgePanel: React.FC<SyncBridgePanelProps> = ({
  commandQueue,
  onClearQueue,
  onExportProject,
}) => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')
  const [syncLog, setSyncLog] = useState<string>('')
  const [copiedScript, setCopiedScript] = useState(false)

  // Generate pure Ruby CommandBus execution script matching ConstructFlow Ruby API
  const generateRubyCommandBusScript = () => {
    let script = `# ConstructFlow Incremental Sync Script (Ruby CommandBus)\n`
    script += `runtime = JiraNot::ConstructFlow.runtime\n`
    script += `project_id = runtime.project.project_id\n`
    script += `model = runtime.active_model\n\n`
    script += `model.start_operation("ConstructFlow Plan Sync", true)\n`
    script += `begin\n`

    for (const cmd of commandQueue) {
      const inputJson = JSON.stringify(cmd.input)
      script += `  # [${cmd.name}] ${cmd.command_id}\n`
      script += `  runtime.commands.execute("${cmd.name}", ${inputJson}, project_id: project_id)\n`
    }

    script += `  model.commit_operation\n`
    script += `  puts "ConstructFlow: Synced ${commandQueue.length} commands successfully."\n`
    script += `rescue => err\n`
    script += `  model.abort_operation\n`
    script += `  puts "ConstructFlow Sync error: \#{err.message}"\n`
    script += `end\n`
    return script
  }

  const handleCopyRubyScript = () => {
    const script = generateRubyCommandBusScript()
    navigator.clipboard.writeText(script)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  const handlePostToBridge = async () => {
    if (commandQueue.length === 0) return
    setSyncStatus('syncing')
    setSyncLog(`Dispatching ${commandQueue.length} semantic commands to bridge...`)

    try {
      // POST to ConstructFlow local bridge server (apps/mcp-server/http_bridge.py)
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
      // Offline fallback: Bridge not currently running in SketchUp
      setSyncStatus('idle')
      setSyncLog(`Bridge offline (port 8000). Use 'Copy Ruby Script' to paste into SketchUp console, or save project.`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontWeight: 600, fontSize: 13 }}>
          <ArrowRightLeft size={16} />
          SKETCHUP SYNC BRIDGE
        </div>
        <span style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
          background: commandQueue.length > 0 ? '#0284c7' : '#334155',
          color: '#ffffff',
          fontWeight: 700,
        }}>
          {commandQueue.length} Pending
        </span>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        Plan Editor is <b>authoritative</b>. Commands sync directly to ConstructFlow's <b>CommandBus</b> in SketchUp preserving object UUIDs.
      </div>

      {/* Sync Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={handlePostToBridge}
          disabled={commandQueue.length === 0 || syncStatus === 'syncing'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: commandQueue.length > 0 ? '#0284c7' : '#334155',
            color: '#ffffff',
            border: 'none',
            padding: '8px 12px',
            borderRadius: 6,
            cursor: commandQueue.length > 0 ? 'pointer' : 'default',
            fontWeight: 600,
            fontSize: 12,
            transition: 'background 0.2s',
          }}
        >
          <Send size={14} />
          {syncStatus === 'syncing' ? 'Syncing to SketchUp...' : 'Sync to SketchUp'}
        </button>

        <button
          onClick={handleCopyRubyScript}
          disabled={commandQueue.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: '#1e293b',
            color: copiedScript ? '#22c55e' : '#cbd5e1',
            border: '1px solid #475569',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: commandQueue.length > 0 ? 'pointer' : 'default',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <Copy size={13} />
          {copiedScript ? 'Copied Ruby CommandBus Script!' : 'Copy Ruby Sync Script'}
        </button>

        <button
          onClick={onExportProject}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #475569',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <Download size={13} />
          Export project.cfproj
        </button>
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

      {/* Command Queue List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>RECENT SYNC EVENTS</div>
        <div style={{
          maxHeight: 160,
          overflowY: 'auto',
          background: '#0f172a',
          borderRadius: 6,
          border: '1px solid #334155',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {commandQueue.length === 0 ? (
            <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', padding: '12px 0' }}>
              No unsynced mutations
            </div>
          ) : (
            commandQueue.slice(-10).reverse().map((cmd, idx) => (
              <div
                key={cmd.command_id || idx}
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  padding: '4px 6px',
                  borderRadius: 4,
                  background: '#1e293b',
                  borderLeft: '3px solid #38bdf8',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{cmd.name}</span>
                <span style={{ color: '#94a3b8' }}>
                  {cmd.input.mark || cmd.input.tag || (cmd.input.object_id ? cmd.input.object_id.slice(0, 6) : '')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
