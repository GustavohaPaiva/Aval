import { useEffect, useRef, useState } from 'react'
import { createDraftSaver, loadDraft } from '../utils/uiDraftStorage'

/**
 * Persists a filters object in localStorage under `syagri:<storageKey>`.
 * Returns [filters, setFilters, patchFilters].
 */
export function usePersistedFilters(storageKey, defaults) {
  const [filters, setFilters] = useState(() => {
    const saved = loadDraft(storageKey, null)
    if (!saved || typeof saved !== 'object') return { ...defaults }
    return { ...defaults, ...saved }
  })

  const saverRef = useRef(null)
  if (saverRef.current == null) {
    saverRef.current = createDraftSaver(storageKey)
  }

  useEffect(() => {
    saverRef.current.save(filters)
  }, [filters])

  function patchFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return [filters, setFilters, patchFilters]
}
