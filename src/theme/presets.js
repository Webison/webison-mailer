export const COLOR_PRESETS = [
  { id: 'blu', label: 'Blu', swatch: '#005fb8' },
  { id: 'azzurro', label: 'Azzurro', swatch: '#0078d4' },
  { id: 'turchese', label: 'Turchese', swatch: '#038387' },
  { id: 'verde', label: 'Verde', swatch: '#107c10' },
  { id: 'oliva', label: 'Oliva', swatch: '#6b8e23' },
  { id: 'ambra', label: 'Ambra', swatch: '#c19c00' },
  { id: 'arancio', label: 'Arancio', swatch: '#ca5010' },
  { id: 'rosso', label: 'Rosso', swatch: '#c42b1c' },
  { id: 'ardesia', label: 'Ardesia', swatch: '#5b5b5b' },
]

export const DEFAULT_COLOR_PRESET = 'blu'

export function normalizeColorPreset(value) {
  return COLOR_PRESETS.some((p) => p.id === value) ? value : DEFAULT_COLOR_PRESET
}
