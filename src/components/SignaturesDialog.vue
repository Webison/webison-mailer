<script setup>
import { computed, reactive } from 'vue'

const props = defineProps({
  signatures: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'save', 'delete'])

const form = reactive({
  id: null,
  name: '',
  body: '',
  isHtml: false,
  isDefault: false,
})

function accountsFor(sigId) {
  return props.accounts.filter((a) => a.signatureId === sigId)
}

const linkedLabel = computed(() => {
  if (!form.id) return ''
  const list = accountsFor(form.id)
  if (!list.length) return 'Nessun account collegato'
  return list.map((a) => a.email || a.name).join(', ')
})

function resetForm() {
  Object.assign(form, { id: null, name: '', body: '', isHtml: false, isDefault: false })
}

function edit(sig) {
  Object.assign(form, {
    id: sig.id,
    name: sig.name,
    body: sig.body,
    isHtml: Boolean(sig.isHtml),
    isDefault: Boolean(sig.isDefault),
  })
}

function submit() {
  if (!form.name.trim() || !form.body.trim()) return
  emit('save', { ...form })
  resetForm()
}

function remove() {
  if (!form.id) return
  emit('delete', form.id)
  resetForm()
}
</script>

<template>
  <section :class="embedded ? 'embed-panel' : 'screen'">
    <div v-if="!embedded" class="screen-header">
      <div class="screen-header-left">
        <button type="button" class="btn btn-back" @click="emit('back')">← Indietro</button>
        <h2>Firme</h2>
      </div>
    </div>

    <div :class="embedded ? 'embed-body fill' : 'screen-body fill'">
      <div class="split-view">
        <aside class="side-pane">
          <div class="side-pane-head">
            <span class="pane-title">{{ signatures.length }} firme</span>
            <button class="btn btn-ghost btn-sm" @click="resetForm">Nuova</button>
          </div>
          <div class="side-list">
            <button
              v-for="s in signatures"
              :key="s.id"
              class="side-item"
              :class="{ active: form.id === s.id }"
              @click="edit(s)"
            >
              <strong>
                {{ s.name }}
                <span v-if="s.isDefault" class="badge">Default</span>
              </strong>
              <span>
                {{ s.isHtml ? 'HTML' : 'Testo' }}
                <template v-if="accountsFor(s.id).length">
                  · {{ accountsFor(s.id).length }} account
                </template>
              </span>
            </button>
            <p v-if="!signatures.length" class="empty">Nessuna firma</p>
          </div>
        </aside>

        <div class="main-pane">
          <div class="form-stack">
            <div class="form-section">
              <h3 class="block-title">{{ form.id ? 'Modifica' : 'Nuova firma' }}</h3>
              <div class="field">
                <label>Nome</label>
                <input v-model="form.name" placeholder="Lavoro" />
              </div>
              <div class="field-row">
                <div class="seg">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    :class="{ active: !form.isHtml }"
                    @click="form.isHtml = false"
                  >
                    Testo
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    :class="{ active: form.isHtml }"
                    @click="form.isHtml = true"
                  >
                    HTML
                  </button>
                </div>
                <label class="check">
                  <input v-model="form.isDefault" type="checkbox" />
                  Predefinita (fallback globale)
                </label>
              </div>

              <p v-if="form.id" class="status">Account collegati: {{ linkedLabel }}</p>

              <div v-if="!form.isHtml" class="field">
                <label>Contenuto</label>
                <textarea v-model="form.body" rows="9" placeholder="Cordiali saluti,&#10;Nome Cognome" />
              </div>
              <div v-else class="html-split tall">
                <div class="field grow">
                  <label>HTML</label>
                  <textarea v-model="form.body" class="mono editor" placeholder="<p>Cordiali saluti</p>" />
                </div>
                <div class="field grow">
                  <label>Anteprima</label>
                  <iframe class="preview-frame" sandbox="" :srcdoc="form.body || ''" title="Anteprima firma" />
                </div>
              </div>

              <div class="row-actions">
                <button class="btn btn-primary" @click="submit">
                  {{ form.id ? 'Salva' : 'Aggiungi' }}
                </button>
                <button v-if="form.id" class="btn btn-danger" @click="remove">Elimina</button>
                <button v-if="form.id" class="btn btn-ghost" @click="resetForm">Annulla</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
