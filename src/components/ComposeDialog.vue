<script setup>
import { computed, ref } from 'vue'
import { useResizableLayout } from '../composables/useResizableLayout'
import { frameDocument } from '../utils/frameDocument.mjs'

const props = defineProps({
  model: { type: Object, required: true },
  contacts: { type: Array, default: () => [] },
  loading: Boolean,
  error: String,
})

defineEmits(['back', 'send'])

const previewDocument = computed(() => frameDocument(props.model.html))
const htmlSplitRef = ref(null)
const SPLITTER_SIZE = 10
const PREVIEW_MIN = 260
const {
  isCompact,
  createStoredSize,
  startHorizontalResize,
} = useResizableLayout('compose-html', htmlSplitRef)
const { size: editorWidth, setSize: setEditorWidth } = createStoredSize('editor', {
  defaultValue: 440,
  min: 260,
  max: ({ containerWidth }) => Math.max(260, containerWidth - PREVIEW_MIN - SPLITTER_SIZE),
})

const htmlSplitStyle = computed(() => ({
  '--html-split-editor-width': `${editorWidth.value}px`,
}))

function startHtmlResize(event) {
  startHorizontalResize(event, {
    getValue: () => editorWidth.value,
    setValue: setEditorWidth,
    min: 260,
    max: ({ containerWidth }) => Math.max(260, containerWidth - PREVIEW_MIN - SPLITTER_SIZE),
  })
}
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
          <div
            v-else
            ref="htmlSplitRef"
            class="html-split resizable-layout"
            :style="htmlSplitStyle"
          >
            <textarea
              v-model="model.html"
              class="editor mono"
              placeholder="<p>Ciao</p>"
            />
            <button
              v-if="!isCompact"
              type="button"
              class="splitter"
              aria-label="Ridimensiona editor HTML"
              @pointerdown="startHtmlResize"
            />
            <iframe class="preview-frame" sandbox="" :srcdoc="previewDocument" title="Anteprima" />
          </div>
          <p v-if="error" class="status error">{{ error }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
