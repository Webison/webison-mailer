<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  account: { type: Object, default: null },
  signatures: { type: Array, default: () => [] },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'save', 'delete'])

const form = reactive({
  id: null,
  name: '',
  email: '',
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  leaveOnServer: true,
  signatureId: '',
})

watch(
  () => props.account,
  (a) => {
    Object.assign(form, {
      id: a?.id || null,
      name: a?.name || '',
      email: a?.email || '',
      username: a?.username || a?.email || '',
      password: '',
      imapHost: a?.imapHost || '',
      imapPort: a?.imapPort || 993,
      imapSecure: a?.imapSecure !== false,
      smtpHost: a?.smtpHost || '',
      smtpPort: a?.smtpPort || 587,
      smtpSecure: Boolean(a?.smtpSecure),
      leaveOnServer: a?.leaveOnServer !== false,
      signatureId: a?.signatureId || '',
    })
  },
  { immediate: true },
)

function onEmailBlur() {
  if (!form.username) form.username = form.email
  const domain = form.email.split('@')[1]
  if (!domain) return
  if (!form.imapHost) form.imapHost = `imap.${domain}`
  if (!form.smtpHost) form.smtpHost = `smtp.${domain}`
  if (!form.name) form.name = form.email.split('@')[0]
}

function submit() {
  if (!form.name || !form.email || !form.imapHost || !form.smtpHost) return
  if (!props.account && !form.password) return
  emit('save', {
    ...form,
    signatureId: form.signatureId || null,
  })
}
</script>

<template>
  <section :class="embedded ? 'embed-panel' : 'screen'">
    <div v-if="!embedded" class="screen-header">
      <div class="screen-header-left">
        <button type="button" class="btn btn-back" @click="emit('back')">← Indietro</button>
        <h2>{{ account ? 'Modifica account' : 'Nuovo account' }}</h2>
      </div>
      <div class="screen-header-actions">
        <button v-if="account" class="btn btn-danger" @click="emit('delete', account.id)">Elimina</button>
        <button class="btn btn-primary" @click="submit">Salva</button>
      </div>
    </div>
    <div v-else class="embed-toolbar">
      <button class="btn btn-ghost btn-sm" @click="emit('back')">Elenco</button>
      <h3 class="block-title" style="margin: 0">{{ account ? 'Modifica account' : 'Nuovo account' }}</h3>
      <span class="spacer" />
      <button v-if="account" class="btn btn-danger btn-sm" @click="emit('delete', account.id)">Elimina</button>
      <button class="btn btn-primary btn-sm" @click="submit">Salva</button>
    </div>

    <div :class="embedded ? 'embed-body' : 'screen-body narrow'">
      <div class="form-stack">
        <div class="form-section">
          <h3 class="block-title">Identità</h3>
          <div class="grid-2">
            <div class="field">
              <label>Nome</label>
              <input v-model="form.name" placeholder="Lavoro" />
            </div>
            <div class="field">
              <label>Email</label>
              <input v-model="form.email" type="email" placeholder="tu@dominio.it" @blur="onEmailBlur" />
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Username</label>
              <input v-model="form.username" placeholder="Di solito uguale all'email" />
            </div>
            <div class="field">
              <label>Password {{ account ? '(invariata se vuota)' : '' }}</label>
              <input v-model="form.password" type="password" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label>Firma</label>
            <select v-model="form.signatureId">
              <option value="">Predefinita / nessuna</option>
              <option v-for="s in signatures" :key="s.id" :value="s.id">
                {{ s.name }}{{ s.isDefault ? ' (default globale)' : '' }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-section">
          <h3 class="block-title">IMAP</h3>
          <div class="grid-2">
            <div class="field">
              <label>Host</label>
              <input v-model="form.imapHost" placeholder="imap.dominio.it" />
            </div>
            <div class="field">
              <label>Porta</label>
              <input v-model.number="form.imapPort" type="number" />
            </div>
          </div>
          <div class="field-row">
            <label class="check">
              <input v-model="form.imapSecure" type="checkbox" />
              SSL/TLS
            </label>
            <label class="check">
              <input v-model="form.leaveOnServer" type="checkbox" />
              Lascia copia sul server
            </label>
          </div>
        </div>

        <div class="form-section">
          <h3 class="block-title">SMTP</h3>
          <div class="grid-2">
            <div class="field">
              <label>Host</label>
              <input v-model="form.smtpHost" placeholder="smtp.dominio.it" />
            </div>
            <div class="field">
              <label>Porta</label>
              <input v-model.number="form.smtpPort" type="number" />
            </div>
          </div>
          <label class="check">
            <input v-model="form.smtpSecure" type="checkbox" />
            SSL su 465 (con 587 lascia spento)
          </label>
        </div>
      </div>
    </div>
  </section>
</template>
