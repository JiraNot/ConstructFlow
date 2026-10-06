import React from 'react'
import { SyncDeltaEvent } from '../types/model'
import { Activity, CheckCircle2, RefreshCw } from 'lucide-react'

interface SketchUpSyncPanelProps {
  events: SyncDeltaEvent[]
  onClearEvents: () => void
}

export const SketchUpSyncPanel: React.FC<SketchUpSyncPanelProps> = ({
  events,
  onClearEvents,
}) => {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Activity size={14} color="#10b981" />
        <span style={styles.title}>SketchUp Sync Bridge</span>
        <span style={styles.statusPill}>
          <span style={styles.pulseDot} /> CONNECTED
        </span>
        <button style={styles.clearBtn} onClick={onClearEvents} title="Clear sync log">
          <RefreshCw size={11} />
        </button>
      </div>

      <div style={styles.list}>
        {events.length === 0 ? (
          <div style={styles.empty}>
            No changes yet. Create a column, move geometry, or alter phases to emit incremental delta events.
          </div>
        ) : (
          events.slice(-10).reverse().map((ev, idx) => (
            <div key={idx} style={styles.item}>
              <div style={styles.itemHeader}>
                <span style={badgeStyle(ev.op)}>{ev.op}</span>
                <span style={styles.idMono}>{ev.id}</span>
                <span style={styles.timeMono}>
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <pre style={styles.payload}>
                {JSON.stringify(ev.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>

      <div style={styles.footer}>
        <CheckCircle2 size={13} color="#10b981" />
        <span>Incremental delta sync ready. No full-model teardown.</span>
      </div>
    </div>
  )
}

function badgeStyle(op: string): React.CSSProperties {
  let bg = '#0284c7'
  let color = '#e0f2fe'
  if (op === 'CREATE') {
    bg = 'rgba(16, 185, 129, 0.2)'
    color = '#34d399'
  } else if (op === 'UPDATE') {
    bg = 'rgba(14, 165, 233, 0.2)'
    color = '#38bdf8'
  } else if (op === 'DEMOLISH') {
    bg = 'rgba(239, 68, 68, 0.2)'
    color = '#f87171'
  } else if (op === 'DELETE') {
    bg = 'rgba(148, 163, 184, 0.2)'
    color = '#94a3b8'
  }
  return {
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: '3px',
    background: bg,
    color: color,
    fontFamily: 'JetBrains Mono, monospace',
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '170px',
    background: '#090d16',
    borderTop: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  },
  header: {
    height: '32px',
    borderBottom: '1px solid #1e293b',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#cbd5e1',
  },
  statusPill: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#34d399',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '2px 6px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: '6px',
  },
  pulseDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#10b981',
  },
  clearBtn: {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '3px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  empty: {
    fontSize: '11px',
    color: '#475569',
    padding: '12px 0',
    fontStyle: 'italic',
  },
  item: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '4px',
    padding: '6px 8px',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
  },
  idMono: {
    fontFamily: 'JetBrains Mono, monospace',
    color: '#f3f4f6',
    fontWeight: 600,
  },
  timeMono: {
    marginLeft: 'auto',
    fontSize: '10px',
    color: '#6b7280',
    fontFamily: 'JetBrains Mono, monospace',
  },
  payload: {
    margin: '4px 0 0 0',
    fontSize: '10px',
    color: '#9ca3af',
    fontFamily: 'JetBrains Mono, monospace',
    overflowX: 'auto',
    maxHeight: '60px',
  },
  footer: {
    height: '24px',
    background: '#0b1120',
    borderTop: '1px solid #172033',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#94a3b8',
  },
}
