export const COLOR_PRESETS = [
  { id: 'blu', label: 'Blu', swatch: '#005fb8' },
  { id: 'rosa', label: 'Rosa', swatch: '#e73c7e' },
  { id: 'viola', label: 'Viola', swatch: '#4a2ed8' },
]

export const DEFAULT_COLOR_PRESET = 'blu'

export function normalizeColorPreset(value) {
  return COLOR_PRESETS.some((p) => p.id === value) ? value : DEFAULT_COLOR_PRESET
}
