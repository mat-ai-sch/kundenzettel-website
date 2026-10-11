import assert from 'node:assert/strict'
import { readRuntimeConfig } from './runtimeMode'

const preview = readRuntimeConfig({
  VITE_RUNTIME_MODE: 'unexpected',
  VITE_OPERATOR_API_BASE: 'https://operator.example/api///',
  VITE_OPERATOR_EVENTS: 'true',
  VITE_OPERATOR_MEDIA_ENABLED: 'true',
})
assert.deepEqual(preview, {
  mode: 'preview',
  apiBase: 'https://operator.example/api',
  eventsEnabled: false,
  mediaEnabled: false,
})

const operator = readRuntimeConfig({
  VITE_RUNTIME_MODE: 'operator',
  VITE_OPERATOR_EVENTS: 'false',
  VITE_OPERATOR_MEDIA_ENABLED: 'true',
})
assert.equal(operator.mode, 'operator')
assert.equal(operator.eventsEnabled, false)
assert.equal(operator.mediaEnabled, true)

const textOnlyOperator = readRuntimeConfig({ VITE_RUNTIME_MODE: 'operator' })
assert.equal(textOnlyOperator.apiBase, '/api')
assert.equal(textOnlyOperator.eventsEnabled, true)
assert.equal(textOnlyOperator.mediaEnabled, false)

console.log('runtime mode tests passed')
