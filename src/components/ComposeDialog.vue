<script setup>
defineProps({
  model: { type: Object, required: true },
  contacts: { type: Array, default: () => [] },
  loading: Boolean,
  error: String,
})

defineEmits(['back', 'send'])
</script>

<template>
  <section class="screen">
    <div class="screen-header">
      <div class="screen-header-left">
        <button class="btn btn-ghost btn-sm" @click="$emit('back')">Indietro</button>
        <h2>Nuovo messaggio</h2>
      </div>
      <button
        class="btn btn-primary"
        :disabled="loading || !model.to || !model.subject"
        @click="$emit('send')"
      >
        {{ loading ? 'Invio…' : 'Invia' }}
      </button>
    </div>

    <div class="screen-body fill">
      <div class="compose-shell">
        <div class="compose-fields">
          <div class="compose-line">
            <label>A</label>
            <input v-model="model.to" list="contacts-to" placeholder="destinatario@dominio.it" />
            <datalist id="contacts-to">
              <option v-for="c in contacts" :key="c.id" :value="c.email">{{ c.name }}</option>
            </datalist>
          </div>
          <div class="compose-line">
            <label>Cc</label>
            <input v-model="model.cc" list="contacts-cc" placeholder="opzionale" />
            <datalist id="contacts-cc">
              <option v-for="c in contacts" :key="'cc-' + c.id" :value="c.email">{{ c.name }}</option>
            </datalist>
          </div>
          <div class="compose-line">
            <label>Oggetto</label>
            <input v-model="model.subject" placeholder="Oggetto del messaggio" />
          </div>
          <div class="compose-toolbar">
            <span class="status">Formato</span>
            <div class="seg">
              <button
                type="button"
                class="btn btn-ghost"
                :class="{ active: !model.useHtml }"
                @click="model.useHtml = false"
              >
                Testo
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                :class="{ active: model.useHtml }"
                @click="model.useHtml = true"
              >
                HTML
              </button>
            </div>
          </div>
        </div>

        <div class="compose-body">
          <textarea
            v-if="!model.useHtml"
            v-model="model.text"
            class="editor"
            placeholder="Scrivi il messaggio…"
          />
          <div v-else class="html-split">
            <textarea
              v-model="model.html"
              class="editor mono"
              placeholder="<p>Ciao</p>"
            />
            <iframe class="preview-frame" sandbox="" :srcdoc="model.html || ''" title="Anteprima" />
          </div>
          <p v-if="error" class="status error">{{ error }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
