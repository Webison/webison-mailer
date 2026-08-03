<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { frameDocument } from '../utils/frameDocument.mjs'
import { buildReplyHtml } from '../utils/reply.mjs'

const props = defineProps({
  model: { type: Object, required: true },
  contacts: { type: Array, default: () => [] },
  loading: Boolean,
  error: String,
})

defineEmits(['back', 'send', 'pick-attachments', 'remove-attachment'])

const editorRef = ref(null)
const quoteFrameRef = ref(null)
const quoteExpanded = ref(true)
const quoteHeight = ref(180)
let quoteResizeObserver = null
let quoteInitialized = false
const quoteDocument = computed(() =>
  frameDocument(buildReplyHtml('', props.model.quoteIntro, props.model.quoteHtml)),
)

const composeTitle = computed(() => (props.model.isReply ? 'Rispondi' : 'Nuovo messaggio'))
const quoteFrameStyle = computed(() => ({ height: `${quoteHeight.value}px` }))
const composeAttachments = computed(() =>
  Array.isArray(props.model.attachments) ? props.model.attachments : [],
)

function formatSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function syncEditor(force = false) {
  const editor = editorRef.value
  if (!editor || (!force && document.activeElement === editor)) return
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

function focusEditorStart() {
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function resizeQuoteFrame(resetToEditor = false) {
  const frame = quoteFrameRef.value
  const doc = frame?.contentDocument
  if (!frame || !doc) return
  const scroller = frame.closest('[data-compose-scroll]')
  const previousScrollTop = resetToEditor ? 0 : (scroller?.scrollTop || 0)
  const height = Math.max(
    doc.documentElement?.scrollHeight || 0,
    doc.body?.scrollHeight || 0,
    120,
  )
  quoteHeight.value = height + 2
  frame.style.height = `${quoteHeight.value}px`
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTop = previousScrollTop
  })
}

function observeQuoteFrame() {
  quoteResizeObserver?.disconnect()
  quoteResizeObserver = null
  resizeQuoteFrame(!quoteInitialized)
  quoteInitialized = true
  const body = quoteFrameRef.value?.contentDocument?.body
  if (body && window.ResizeObserver) {
    quoteResizeObserver = new ResizeObserver(() => resizeQuoteFrame(false))
    quoteResizeObserver.observe(body)
  }
}

function toggleQuote() {
  quoteExpanded.value = !quoteExpanded.value
}

onMounted(() => nextTick(() => {
  syncEditor(true)
  focusEditorStart()
}))
watch(() => props.model.html, () => nextTick(syncEditor))
onBeforeUnmount(() => quoteResizeObserver?.disconnect())
</script>

<template>
  <section class="screen">
    <div class="screen-header">
      <div class="screen-header-left">
        <button type="button" class="btn btn-back" @click="$emit('back')">← Indietro</button>
        <h2>{{ composeTitle }}</h2>
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
            <button type="button" class="format-btn" title="Grassetto" aria-label="Grassetto" @mousedown.prevent @click="format('bold')"><strong>B</strong></button>
            <button type="button" class="format-btn" title="Corsivo" aria-label="Corsivo" @mousedown.prevent @click="format('italic')"><em>I</em></button>
            <button type="button" class="format-btn" title="Sottolineato" aria-label="Sottolineato" @mousedown.prevent @click="format('underline')"><u>U</u></button>
            <span class="format-separator" aria-hidden="true" />
            <button type="button" class="format-btn format-btn-wide" title="Elenco puntato" aria-label="Elenco puntato" @mousedown.prevent @click="format('insertUnorderedList')">☷</button>
            <span class="format-separator" aria-hidden="true" />
            <button
              type="button"
              class="format-btn format-btn-wide"
              title="Allega file"
              aria-label="Allega file"
              :disabled="loading || composeAttachments.length >= 20"
              @click="$emit('pick-attachments')"
            >
              Allega
            </button>
          </div>
          <div v-if="composeAttachments.length" class="compose-attachments">
            <div
              v-for="att in composeAttachments"
              :key="att.stagingId"
              class="compose-attachment-chip"
            >
              <span class="compose-attachment-name">{{ att.filename }}</span>
              <span class="compose-attachment-size">{{ formatSize(att.size) }}</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="loading"
                @click="$emit('remove-attachment', att.stagingId)"
              >
                Rimuovi
              </button>
            </div>
          </div>
        </div>

        <div class="compose-body" data-compose-scroll>
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
            <button
              type="button"
              class="reply-quote-toggle"
              :aria-expanded="quoteExpanded"
              @click="toggleQuote"
            >
              <span class="reply-quote-chevron" :class="{ expanded: quoteExpanded }">›</span>
              Messaggio originale
              <span class="reply-quote-action">{{ quoteExpanded ? 'Nascondi' : 'Mostra' }}</span>
            </button>
            <iframe
              v-if="quoteExpanded"
              class="reply-quote-frame"
              ref="quoteFrameRef"
              sandbox="allow-same-origin"
              scrolling="no"
              :style="quoteFrameStyle"
              :srcdoc="quoteDocument"
              title="Messaggio originale"
              @load="observeQuoteFrame"
            />
          </div>
          <p v-if="error" class="status error">{{ error }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
