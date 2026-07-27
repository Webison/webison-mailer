<script setup>
import { computed } from 'vue'
import { COLOR_PRESETS, normalizeColorPreset } from '../theme/presets'

const props = defineProps({
  settings: { type: Object, required: true },
  appVersion: { type: String, default: '' },
})

const emit = defineEmits(['back', 'save', 'markAllInboxRead'])

const theme = computed({
  get: () => props.settings.theme || 'light',
  set: (value) => emit('save', { theme: value }),
})

const colorPreset = computed({
  get: () => normalizeColorPreset(props.settings.colorPreset),
  set: (value) => emit('save', { colorPreset: normalizeColorPreset(value) }),
})

const notificationsEnabled = computed({
  get: () => props.settings.notificationsEnabled !== false,
  set: (value) => emit('save', { notificationsEnabled: Boolean(value) }),
})
</script>

<template>
  <section class="screen">
    <div class="screen-header">
      <div class="screen-header-left">
        <button class="btn btn-ghost btn-sm" @click="emit('back')">Indietro</button>
        <h2>Impostazioni</h2>
      </div>
    </div>

    <div class="screen-body narrow">
      <div class="form-stack">
        <div class="form-section">
          <h3 class="block-title">Aspetto</h3>
          <div class="field">
            <label>Tema</label>
            <div class="seg">
              <button
                type="button"
                class="btn btn-ghost"
                :class="{ active: theme === 'light' }"
                @click="theme = 'light'"
              >
                Chiaro
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                :class="{ active: theme === 'dark' }"
                @click="theme = 'dark'"
              >
                Scuro
              </button>
            </div>
          </div>

          <div class="field">
            <label>Colore</label>
            <div class="accent-grid">
              <button
                v-for="preset in COLOR_PRESETS"
                :key="preset.id"
                type="button"
                class="accent-swatch"
                :class="{ active: colorPreset === preset.id }"
                :title="preset.label"
                :aria-label="preset.label"
                :style="{ '--swatch': preset.swatch }"
                @click="colorPreset = preset.id"
              >
                <span class="accent-dot" />
                <span class="accent-name">{{ preset.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="block-title">Notifiche</h3>
          <label class="check">
            <input v-model="notificationsEnabled" type="checkbox" />
            Notifiche nuove email
          </label>
          <p class="status">
            Controlla la Posta in arrivo ogni minuto mentre l'app è aperta.
          </p>
        </div>

        <div class="form-section">
          <h3 class="block-title">Posta</h3>
          <button class="btn btn-ghost btn-block" @click="emit('markAllInboxRead')">
            Segna tutte le email come lette (INBOX)
          </button>
          <p class="status">
            Valido per tutti gli account. Può richiedere tempo su caselle grandi.
          </p>
        </div>
        <div class="form-section">
          <h3 class="block-title">Informazioni</h3>
          <p class="status">Versione app: {{ appVersion || '—' }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
