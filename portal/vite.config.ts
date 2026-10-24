import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = (process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/').trim() || '/'
  // Die öffentliche Website lädt aktuelle GitHub-Dateien. Bestehende Offline-
  // Registrierungen werden durch public/sw.js einmalig abgelöst.
  return { base, plugins: [react()] }
})
