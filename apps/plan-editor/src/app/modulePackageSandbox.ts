import type { CommandHandlerContext } from '@constructflow/command-schema'
import type {
  ConstructFlowModule,
  ModuleContribution,
  ModuleHostApi,
  ModuleManifest,
} from '@constructflow/module-sdk'

const RESPONSE_MAX_BYTES = 64 * 1024 * 1024
const CALL_TIMEOUT_MS = 10_000

const sandboxWorkerSource = String.raw`
let sandboxModule;
let sandboxContribution;
let sandboxPort;
const blocked = () => { throw new Error('Network and nested workers are disabled for ConstructFlow extensions'); };
for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'BroadcastChannel', 'Worker', 'SharedWorker', 'importScripts', 'indexedDB', 'caches']) {
  try { Object.defineProperty(globalThis, key, { configurable: false, writable: false, value: blocked }); } catch {}
  try { if (typeof WorkerGlobalScope !== 'undefined') Object.defineProperty(WorkerGlobalScope.prototype, key, { configurable: false, writable: false, value: blocked }); } catch {}
}
try { Object.defineProperty(navigator, 'sendBeacon', { configurable: false, writable: false, value: blocked }); } catch {}
function describeModule(module, contribution) {
  return {
    manifest: module.manifest,
    commandNames: Object.keys(contribution.commands ?? {}),
    commandDescriptors: contribution.commandDescriptors ?? [],
    ui: contribution.ui ?? [],
  };
}
async function initialize(source, port) {
  sandboxPort = port;
  try {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const namespace = await import(url);
      sandboxModule = namespace.default;
    } finally { URL.revokeObjectURL(url); }
    if (!sandboxModule || typeof sandboxModule !== 'object' || typeof sandboxModule.activate !== 'function') throw new Error('Extension package must export a module with activate(api)');
    sandboxContribution = sandboxModule.activate({ apiVersion: '1', moduleId: sandboxModule.manifest?.id });
    if (!sandboxContribution || typeof sandboxContribution !== 'object' || !sandboxContribution.commands) throw new Error('Extension activate(api) must return a commands registry');
    if (Object.keys(sandboxContribution.providers ?? {}).length || Object.keys(sandboxContribution.validators ?? {}).length || (sandboxContribution.migrations ?? []).length) {
      throw new Error('Sandboxed packages currently support command handlers and declarative UI actions; providers, validators, and migrations require synchronous callbacks and are not supported');
    }
    sandboxPort.onmessage = async event => {
      const request = event.data;
      if (!request || request.type !== 'invoke') return;
      try {
        let value;
        if (request.kind === 'command') value = sandboxContribution.commands[request.name]?.(...request.args);
        else if (request.kind === 'deactivate') { value = sandboxModule.deactivate?.(...request.args); sandboxModule = null; sandboxContribution = null; }
        else throw new Error('Unknown extension sandbox operation');
        value = await value;
        const encoded = JSON.stringify(value === undefined ? null : value);
        if (encoded && new TextEncoder().encode(encoded).byteLength > 64 * 1024 * 1024) throw new Error('Extension response exceeds the 64 MB limit');
        sandboxPort.postMessage({ type: 'result', request_id: request.request_id, result: value === undefined ? null : value, wasUndefined: value === undefined });
      } catch (error) {
        sandboxPort.postMessage({ type: 'result', request_id: request.request_id, sandboxError: String(error?.message ?? error).slice(0, 1000) });
      }
    };
    sandboxPort.postMessage({ type: 'ready', description: describeModule(sandboxModule, sandboxContribution) });
  } catch (error) {
    sandboxPort.postMessage({ type: 'error', error: String(error?.message ?? error).slice(0, 1000) });
  }
}
self.onmessage = event => {
  if (event.data?.type === 'initialize' && event.ports?.[0]) void initialize(event.data.source, event.ports[0]);
};
`

interface SandboxDescription {
  manifest: ModuleManifest
  commandNames: string[]
  commandDescriptors: ModuleContribution['commandDescriptors']
  ui: ModuleContribution['ui']
}

interface SandboxResponse {
  result?: unknown
  wasUndefined?: boolean
  sandboxError?: string
}

function serializeArgs(args: unknown[]): string {
  const serialized = JSON.stringify(args)
  if (serialized === undefined) throw new Error('Extension sandbox input is not serializable')
  return serialized
}

function invokeSandbox(worker: Worker, port: MessagePort, pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>, kind: string, name: string, args: unknown[], index?: number): Promise<unknown> {
  const inputBytes = new TextEncoder().encode(serializeArgs(args)).byteLength
  if (inputBytes > RESPONSE_MAX_BYTES / 2) throw new Error('Extension sandbox input exceeds the 32 MB limit')
  return new Promise((resolve, reject) => {
    const requestId = ++sandboxRequestSequence
    const timeout = window.setTimeout(() => {
      pending.delete(requestId)
      worker.terminate()
      reject(new Error('Extension sandbox callback exceeded 10 seconds and was terminated'))
    }, CALL_TIMEOUT_MS)
    pending.set(requestId, { resolve: value => { window.clearTimeout(timeout); resolve(value) }, reject: error => { window.clearTimeout(timeout); reject(error) } })
    port.postMessage({ type: 'invoke', request_id: requestId, kind, name, args, index })
  })
}

let sandboxRequestSequence = 0

/** Loads and runs third-party module code in a network-disabled worker with synchronous, bounded RPC. */
export async function loadSandboxedModulePackage(source: string): Promise<ConstructFlowModule> {
  if (!globalThis.crossOriginIsolated) {
    throw new Error('Extension sandbox requires Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers')
  }
  const workerUrl = URL.createObjectURL(new Blob([sandboxWorkerSource], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl, { name: 'constructflow-extension-sandbox' })
  URL.revokeObjectURL(workerUrl)
  const channel = new MessageChannel()
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  channel.port1.onmessage = event => {
    if (event.data?.type !== 'result' || typeof event.data.request_id !== 'number') return
    const callbacks = pending.get(event.data.request_id)
    if (!callbacks) return
    pending.delete(event.data.request_id)
    const response = event.data as SandboxResponse
    if (response.sandboxError) callbacks.reject(new Error(response.sandboxError))
    else callbacks.resolve(response.wasUndefined ? undefined : response.result)
  }
  const descriptionReady = new Promise<SandboxDescription>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Extension sandbox initialization timed out')), CALL_TIMEOUT_MS)
    channel.port1.addEventListener('message', event => {
      if (event.data?.type === 'ready') {
        window.clearTimeout(timeout)
        resolve(event.data.description as SandboxDescription)
      } else if (event.data?.type === 'error') {
        window.clearTimeout(timeout)
        reject(new Error(String(event.data.error ?? 'Extension sandbox initialization failed')))
      }
    })
    channel.port1.start()
  })
  worker.postMessage({ type: 'initialize', source, port: channel.port2 }, [channel.port2])
  let description: SandboxDescription
  try {
    description = await descriptionReady
  } catch (error) {
    worker.terminate()
    channel.port1.close()
    URL.revokeObjectURL(workerUrl)
    throw error
  }

  let active = true
  const invoke = (kind: string, name: string, args: unknown[], index?: number) => {
    if (!active) throw new Error('Extension sandbox is no longer active')
    return invokeSandbox(worker, channel.port1, pending, kind, name, args, index)
  }
  const module: ConstructFlowModule = {
    manifest: description.manifest,
    activate(_api: ModuleHostApi): ModuleContribution {
      return {
        commands: Object.fromEntries(description.commandNames.map(name => [name, (context: CommandHandlerContext) =>
          invoke('command', name, [context]) as ReturnType<NonNullable<ModuleContribution['commands'][string]>>,
        ])),
        commandDescriptors: description.commandDescriptors,
        ui: description.ui,
      }
    },
    deactivate() {
      if (!active) return
      active = false
      void invokeSandbox(worker, channel.port1, pending, 'deactivate', '', []).catch(() => undefined).finally(() => {
        channel.port1.close()
        worker.terminate()
      })
    },
  }
  return module
}
