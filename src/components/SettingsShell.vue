<script setup>
import { computed } from 'vue'
import { COLOR_PRESETS, normalizeColorPreset } from '../theme/presets'
import AccountDialog from './AccountDialog.vue'
import ContactsDialog from './ContactsDialog.vue'
import SignaturesDialog from './SignaturesDialog.vue'

const props = defineProps({
  section: { type: String, default: 'aspetto' },
  settings: { type: Object, required: true },
  accounts: { type: Array, default: () => [] },
  contacts: { type: Array, default: () => [] },
  signatures: { type: Array, default: () => [] },
  editingAccount: { type: Object, default: null },
  accountEditor: { type: Boolean, default: false },
  appVersion: { type: String, default: '' },
  updateChecking: { type: Boolean, default: false },
})

const emit = defineEmits([
  'back',
  'section',
  'save-settings',
  'mark-all-inbox-read',
  'save-account',
  'delete-account',
  'edit-account',
  'new-account',
  'close-account-editor',
  'save-contact',
  'delete-contact',
  'save-signature',
  'delete-signature',
  'check-update',
])

const SECTIONS = [
  { id: 'aspetto', label: 'Aspetto' },
  { id: 'notifiche', label: 'Notifiche e posta' },
  { id: 'account', label: 'Account' },
  { id: 'rubrica', label: 'Rubrica' },
  { id: 'firme', label: 'Firme' },
  { id: 'info', label: 'Informazioni' },
]

const active = computed({
  get: () => props.section || 'aspetto',
  set: (id) => emit('section', id),
})

const showAccountForm = computed(() => props.accountEditor)

function openNewAccount() {
  emit('new-account')
}

function openEditAccount(account) {
  emit('edit-account', account)
}

function closeAccountForm() {
  emit('close-account-editor')
}

function onSaveAccount(form) {
  emit('save-account', form)
}

const theme = computed({
  get: () => props.settings.theme || 'light',
  set: (value) => emit('save-settings', { theme: value }),
})

const colorPreset = computed({
  get: () => normalizeColorPreset(props.settings.colorPreset),
  set: (value) => emit('save-settings', { colorPreset: normalizeColorPreset(value) }),
})

const notificationsEnabled = computed({
  get: () => props.settings.notificationsEnabled !== false,
  set: (value) => emit('save-settings', { notificationsEnabled: Boolean(value) }),
})
</script>

<template>
  <section class="screen">
    <div class="screen-header">
      <div class="screen-header-left">
        <button type="button" class="btn btn-back" @click="emit('back')">← Indietro</button>
        <h2>Impostazioni</h2>
      </div>
    </div>

    <div class="screen-body fill">
      <div class="settings-shell">
        <aside class="settings-nav">
          <button
            v-for="s in SECTIONS"
            :key="s.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: active === s.id }"
            @click="active = s.id"
          >
            {{ s.label }}
          </button>
        </aside>

        <div class="settings-panel">
          <div v-if="active === 'aspetto'" class="form-stack">
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
          </div>

          <div v-else-if="active === 'notifiche'" class="form-stack">
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
              <button class="btn btn-ghost btn-block" @click="emit('mark-all-inbox-read')">
                Segna tutte le email come lette (INBOX)
              </button>
              <p class="status">
                Valido per tutti gli account. Può richiedere tempo su caselle grandi.
              </p>
            </div>
          </div>

          <div v-else-if="active === 'account'" class="settings-embed">
            <AccountDialog
              v-if="showAccountForm"
              embedded
              :account="editingAccount"
              :signatures="signatures"
              @back="closeAccountForm"
              @save="onSaveAccount"
              @delete="(id) => { emit('delete-account', id); closeAccountForm() }"
            />
            <div v-else class="form-stack">
              <div class="form-section">
                <div class="side-pane-head" style="padding: 0 0 12px">
                  <h3 class="block-title" style="margin: 0">Account</h3>
                  <button class="btn btn-primary btn-sm" @click="openNewAccount">Nuovo</button>
                </div>
                <button
                  v-for="a in accounts"
                  :key="a.id"
                  type="button"
                  class="side-item"
                  @click="openEditAccount(a)"
                >
                  <strong>{{ a.name }}</strong>
                  <span>{{ a.email }}</span>
                </button>
                <p v-if="!accounts.length" class="empty">Nessun account. Aggiungine uno.</p>
              </div>
            </div>
          </div>

          <div v-else-if="active === 'rubrica'" class="settings-embed">
            <ContactsDialog
              embedded
              :contacts="contacts"
              @save="(f) => emit('save-contact', f)"
              @delete="(id) => emit('delete-contact', id)"
            />
          </div>

          <div v-else-if="active === 'firme'" class="settings-embed">
            <SignaturesDialog
              embedded
              :signatures="signatures"
              :accounts="accounts"
              @save="(f) => emit('save-signature', f)"
              @delete="(id) => emit('delete-signature', id)"
            />
          </div>

          <div v-else-if="active === 'info'" class="form-stack">
            <div class="form-section">
              <h3 class="block-title">Informazioni</h3>
              <p class="status">Versione app: {{ appVersion || '—' }}</p>
              <button
                class="btn btn-primary"
                :disabled="updateChecking"
                @click="emit('check-update')"
              >
                {{ updateChecking ? 'Controllo…' : 'Controlla aggiornamenti' }}
              </button>
              <p class="status">
                All'avvio l'app verifica automaticamente le nuove release su GitHub.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
