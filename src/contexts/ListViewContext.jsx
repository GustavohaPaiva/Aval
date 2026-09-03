import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from '../hooks/useAuth'
import { loadDraft, saveDraft } from '../utils/uiDraftStorage'

const ListViewContext = createContext(null)

function storageKeyForUser(userId) {
  return `list-view:${userId}`
}

export function ListViewProvider({ children }) {
  const { user, role } = useAuth()
  const isGestor = role === 'gestor'
  const userId = user?.id ?? null

  const [storedEnabled, setStoredEnabled] = useState(false)

  useEffect(() => {
    if (!userId || !isGestor) {
      setStoredEnabled(false)
      return
    }
    const saved = loadDraft(storageKeyForUser(userId), false)
    setStoredEnabled(saved === true)
  }, [userId, isGestor])

  const setEnabled = useCallback(
    (next) => {
      if (!isGestor || !userId) return
      const value = Boolean(next)
      setStoredEnabled(value)
      saveDraft(storageKeyForUser(userId), value)
    },
    [isGestor, userId],
  )

  const enabled = isGestor && storedEnabled

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      isGestor,
    }),
    [enabled, setEnabled, isGestor],
  )

  return (
    <ListViewContext.Provider value={value}>{children}</ListViewContext.Provider>
  )
}

export function useListView() {
  const ctx = useContext(ListViewContext)
  if (!ctx) {
    throw new Error('useListView deve ser usado dentro de ListViewProvider')
  }
  return ctx
}
