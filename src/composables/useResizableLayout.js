import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const MOBILE_BREAKPOINT = 960

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function resolveLimit(limit, context, fallback) {
  if (typeof limit === 'function') return limit(context)
  if (typeof limit === 'number' && Number.isFinite(limit)) return limit
  return fallback
}

function readStoredSize(key, fallback, min, max) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return clamp(fallback, min, max)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return clamp(fallback, min, max)
    return clamp(parsed, min, max)
  } catch {
    return clamp(fallback, min, max)
  }
}

export function useResizableLayout(namespace, containerRef) {
  const containerWidth = ref(0)
  const viewportWidth = ref(typeof window === 'undefined' ? MOBILE_BREAKPOINT + 1 : window.innerWidth)
  const isCompact = computed(() => viewportWidth.value <= MOBILE_BREAKPOINT)
  let resizeObserver = null
  let cleanupDrag = null

  function syncViewport() {
    viewportWidth.value = window.innerWidth
  }

  function syncContainerWidth() {
    containerWidth.value = containerRef.value?.getBoundingClientRect?.().width || 0
  }

  function getContext() {
    return {
      containerWidth: containerWidth.value,
      viewportWidth: viewportWidth.value,
      isCompact: isCompact.value,
    }
  }

  function clampSize(entry, value) {
    const context = getContext()
    const min = resolveLimit(entry.min, context, 0)
    const max = resolveLimit(entry.max, context, Number.MAX_SAFE_INTEGER)
    return clamp(value, min, max)
  }

  function persistSize(entry, value) {
    try {
      window.localStorage.setItem(entry.storageKey, String(value))
    } catch {
      // Ignora storage non disponibile.
    }
  }

  function createStoredSize(name, { defaultValue, min, max }) {
    const storageKey = `webison-mailer:${namespace}:${name}`
    const initialContext = getContext()
    const initialMin = resolveLimit(min, initialContext, 0)
    const initialMax = resolveLimit(max, initialContext, Number.MAX_SAFE_INTEGER)
    const size = ref(readStoredSize(storageKey, defaultValue, initialMin, initialMax))
    const entry = { storageKey, size, min, max, defaultValue }

    function setSize(nextValue) {
      const safeValue = clampSize(entry, nextValue)
      size.value = safeValue
      persistSize(entry, safeValue)
    }

    watch([containerWidth, viewportWidth], () => {
      const safeValue = clampSize(entry, size.value)
      if (safeValue !== size.value) {
        size.value = safeValue
        persistSize(entry, safeValue)
      }
    })

    return { size, setSize }
  }

  function startHorizontalResize(event, { getValue, setValue, min, max }) {
    if (isCompact.value || event.button !== 0) return
    cleanupDrag?.()

    const initialValue = getValue()
    const startX = event.clientX
    const pointerTarget = event.currentTarget

    event.preventDefault()
    pointerTarget?.setPointerCapture?.(event.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function stopDrag() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
      pointerTarget?.releasePointerCapture?.(event.pointerId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      cleanupDrag = null
    }

    function handleMove(moveEvent) {
      syncContainerWidth()
      const context = getContext()
      const minValue = resolveLimit(min, context, 0)
      const maxValue = resolveLimit(max, context, Number.MAX_SAFE_INTEGER)
      const delta = moveEvent.clientX - startX
      setValue(clamp(initialValue + delta, minValue, maxValue))
    }

    cleanupDrag = stopDrag
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }

  onMounted(() => {
    syncViewport()
    syncContainerWidth()
    window.addEventListener('resize', syncViewport)
    window.addEventListener('resize', syncContainerWidth)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncContainerWidth()
      })
      if (containerRef.value) resizeObserver.observe(containerRef.value)
    }
  })

  onBeforeUnmount(() => {
    cleanupDrag?.()
    window.removeEventListener('resize', syncViewport)
    window.removeEventListener('resize', syncContainerWidth)
    resizeObserver?.disconnect()
  })

  return {
    containerWidth,
    isCompact,
    createStoredSize,
    startHorizontalResize,
  }
}
