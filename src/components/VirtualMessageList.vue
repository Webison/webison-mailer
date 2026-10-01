<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { flattenGroups, visibleRows } from '../utils/virtualList.mjs'

const props = defineProps({
  groups: { type: Array, required: true }, selectedUid: [String, Number],
  sent: Boolean, formatDate: Function, hasAttachments: Function,
  hasMore: Boolean, loading: Boolean, viewKey: String,
})
const emit = defineEmits(['select', 'context', 'more', 'close-context'])
const container = ref(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)
const layout = computed(() => flattenGroups(props.groups))
const visible = computed(() => visibleRows(layout.value.rows, scrollTop.value, viewportHeight.value))
let observer
function checkMore() {
  if (props.hasMore && !props.loading && scrollTop.value + viewportHeight.value >= layout.value.height - 400) emit('more')
}
function onScroll() { scrollTop.value = container.value.scrollTop; checkMore() }
watch(() => props.viewKey, () => {
  scrollTop.value = 0
  if (container.value) container.value.scrollTop = 0
})
watch(() => [layout.value.height, props.hasMore, props.loading], async () => {
  await nextTick()
  if (container.value) scrollTop.value = container.value.scrollTop
  checkMore()
})
onMounted(() => {
  observer = new ResizeObserver(entries => { viewportHeight.value = entries[0].contentRect.height; checkMore() })
  observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="container" class="message-list" @scroll="onScroll" @click="emit('close-context')">
    <div v-if="layout.rows.length" class="virtual-message-space" :style="{ height: `${layout.height}px` }">
      <template v-for="row in visible" :key="row.key">
        <div v-if="row.label" class="list-group-label virtual-group" :style="{ top: `${row.top}px`, height: `${row.height}px` }">{{ row.label }}</div>
        <button v-else class="message-row virtual-message-row"
          :style="{ top: `${row.top}px`, height: `${row.height}px` }"
          :class="{ active: row.message.uid === selectedUid, unread: !row.message.seen }"
          @click="emit('select', row.message.uid)" @contextmenu="emit('context', $event, row.message)">
          <div class="top">
            <div class="from">{{ sent ? (row.message.to || '(destinatario)') : (row.message.from || '(mittente)') }}</div>
            <span class="date">{{ formatDate(row.message.date) }}</span>
          </div>
          <div class="subject">
            <span v-if="hasAttachments(row.message)" class="attach-flag" title="Contiene allegati" aria-label="Contiene allegati">A</span>
            {{ row.message.subject }}
          </div>
          <div class="preview">{{ row.message.preview }}</div>
        </button>
      </template>
    </div>
    <slot v-else />
    <p v-if="loading" class="empty">Caricamento…</p>
  </div>
</template>

<style scoped>
.virtual-message-space { position: relative; }
.virtual-message-row, .virtual-group { position: absolute; left: 0; right: 0; box-sizing: border-box; }
.virtual-message-row { overflow: hidden; }
</style>
