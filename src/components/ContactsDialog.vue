<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  contacts: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'save', 'delete'])

const form = reactive({
  id: null,
  name: '',
  email: '',
  notes: '',
})

const editing = reactive({ active: false })

watch(
  () => props.contacts,
  () => {
    if (!editing.active) resetForm()
  },
)

function resetForm() {
  Object.assign(form, { id: null, name: '', email: '', notes: '' })
  editing.active = false
}

function edit(contact) {
  Object.assign(form, {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    notes: contact.notes || '',
  })
  editing.active = true
}

function submit() {
  if (!form.name.trim() || !form.email.trim()) return
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
        <h2>Rubrica</h2>
      </div>
    </div>

    <div :class="embedded ? 'embed-body fill' : 'screen-body fill'">
      <div class="split-view">
        <aside class="side-pane">
          <div class="side-pane-head">
            <span class="pane-title">{{ contacts.length }} contatti</span>
            <button class="btn btn-ghost btn-sm" @click="resetForm">Nuovo</button>
          </div>
          <div class="side-list">
            <button
              v-for="c in contacts"
              :key="c.id"
              class="side-item"
              :class="{ active: form.id === c.id }"
              @click="edit(c)"
            >
              <strong>{{ c.name }}</strong>
              <span>{{ c.email }}</span>
            </button>
            <p v-if="!contacts.length" class="empty">Nessun contatto</p>
          </div>
        </aside>

        <div class="main-pane">
          <div class="form-stack">
            <div class="form-section">
              <h3 class="block-title">{{ form.id ? 'Modifica' : 'Nuovo contatto' }}</h3>
              <div class="grid-2">
                <div class="field">
                  <label>Nome</label>
                  <input v-model="form.name" placeholder="Mario Rossi" />
                </div>
                <div class="field">
                  <label>Email</label>
                  <input v-model="form.email" type="email" placeholder="mario@dominio.it" />
                </div>
              </div>
              <div class="field">
                <label>Note</label>
                <input v-model="form.notes" placeholder="opzionale" />
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
