const DRAFT_PREFIX = 'syagri:'

export function loadDraft(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${key}`)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveDraft(key, value) {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(value))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${key}`)
  } catch {
    // ignore
  }
}

/**
 * Debounced localStorage writer. Call flush() to write immediately.
 */
export function createDraftSaver(key, delayMs = 300) {
  let timer = null
  let pending = undefined

  function save(value) {
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (pending !== undefined) {
        saveDraft(key, pending)
        pending = undefined
      }
    }, delayMs)
  }

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending !== undefined) {
      saveDraft(key, pending)
      pending = undefined
    }
  }

  function clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending = undefined
    clearDraft(key)
  }

  return { save, flush, clear }
}
