<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { frameDocument } from '../utils/frameDocument.mjs'
import { buildReplyHtml } from '../utils/reply.mjs'

const props = defineProps({
  model: { type: Object, required: true },
  contacts: { type: Array, default: () => [] },
  loading: Boolean,
  error: String,
})

defineEmits(['back', 'send'])

const editorRef = ref(null)
const quoteDocument = computed(() =>
  frameDocument(buildReplyHtml('', props.model.quoteIntro, props.model.quoteHtml)),
)

function syncEditor() {
  const editor = editorRef.value
  if (!editor || document.activeElement === editor) return
  const html = props.model.html || ''
  if (editor.innerHTML !== html) editor.innerHTML = html
}

function updateModel() {
  props.model.html = editorRef.value?.innerHTML || ''
}

function format(command) {
  editorRef.value?.focus()
  document.execCommand(command, false)
  updateModel()
}

onMounted(() => nextTick(syncEditor))
watch(() => props.model.html, () => nextTick(syncEditor))
</script>

<template>
  <section class="screen">
    <div class="screen-header">
      <div class="screen-header-left">
        <button type="button" class="btn btn-back" @click="$emit('back')">← Indietro</button>
        <h2>Nuovo messaggio</h2>
      </div>
      <div class="screen-header-actions">
        <button
          class="btn btn-primary"
          :disabled="loading || !model.to || !model.subject"
          @click="$emit('send')"
        >
          {{ loading ? 'Invio…' : 'Invia' }}
        </button>
      </div>
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
          <div class="compose-toolbar" aria-label="Formattazione messaggio">
            <span class="status">Formattazione</span>
            <div class="seg">
              <button type="button" class="btn btn-ghost format-btn" title="Grassetto" @mousedown.prevent @click="format('bold')"><strong>G</strong></button>
              <button type="button" class="btn btn-ghost format-btn" title="Corsivo" @mousedown.prevent @click="format('italic')"><em>C</em></button>
              <button type="button" class="btn btn-ghost format-btn" title="Sottolineato" @mousedown.prevent @click="format('underline')"><u>S</u></button>
              <button type="button" class="btn btn-ghost format-btn" title="Elenco puntato" @mousedown.prevent @click="format('insertUnorderedList')">• Elenco</button>
            </div>
          </div>
        </div>

        <div class="compose-body">
          <div
            ref="editorRef"
            class="editor visual-editor"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            data-placeholder="Scrivi il messaggio…"
            @input="updateModel"
            @blur="updateModel"
          />
          <div v-if="model.isReply" class="reply-quote">
            <div class="reply-quote-label">
              Conversazione precedente
              <span>protetta da modifiche</span>
            </div>
            <iframe
              class="reply-quote-frame"
              sandbox=""
              :srcdoc="quoteDocument"
              title="Conversazione precedente"
            />
          </div>
          <p v-if="error" class="status error">{{ error }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
