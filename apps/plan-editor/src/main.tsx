import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.js'
import './app.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.warn('ConstructFlow offline support could not be enabled:', error)
    })
  })
}

// Crypto.randomUUID is restricted to secure contexts in browsers. The LAN dev
// server uses plain HTTP, so provide UUID v4 using getRandomValues, which is
// available in insecure contexts as well.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('This browser does not provide the secure random API required to create object IDs.')
  }
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
