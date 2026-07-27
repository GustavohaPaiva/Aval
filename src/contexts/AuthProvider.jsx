
import { useCallback, useEffect, useMemo, useState } from 'react'
import { requireSupabase } from '../services/supabase'
import { AuthContext } from './auth-context'

async function fetchProfile(userId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, role, filial')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    nome: data.nome,
    role: data.role,
    filial: data.filial ?? null,
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  const clearAuth = useCallback(() => {
    setSession(null)
    setUser(null)
    setProfile(null)
    setProfileLoading(false)
  }, [])

  const applySession = useCallback(
    async (nextSession ) => {
      if (!nextSession?.user) {
        clearAuth()
        return
      }

      setSession(nextSession)
      setUser(nextSession.user)
      setProfileLoading(true)

      try {
        const p = await fetchProfile(nextSession.user.id)
        setProfile(p)
      } catch {
        setProfile(null)
      } finally {
        setProfileLoading(false)
      }
    },
    [clearAuth],
  )

  useEffect(() => {
    let cancelled = false
    const supabase = requireSupabase()

    void (async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession()

        if (cancelled) return

        if (error) {
          clearAuth()
          return
        }

        if (initialSession?.user) {
          setSession(initialSession)
          setUser(initialSession.user)
          setProfileLoading(true)
          void fetchProfile(initialSession.user.id)
            .then((p) => {
              if (!cancelled) setProfile(p)
            })
            .catch(() => {
              if (!cancelled) setProfile(null)
            })
            .finally(() => {
              if (!cancelled) setProfileLoading(false)
            })
        } else {
          clearAuth()
        }
      } catch {
        if (!cancelled) clearAuth()
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return

      if (event === 'SIGNED_OUT' || !nextSession) {
        clearAuth()
        return
      }

      void applySession(nextSession).catch(() => {
        if (!cancelled) clearAuth()
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applySession, clearAuth])

  const signOut = useCallback(async () => {
    clearAuth()
    try {
      await requireSupabase().auth.signOut()
    } catch {
      // Estado local já foi limpo; SIGNED_OUT pode não disparar em falha de rede.
    }
  }, [clearAuth])

  const refreshProfile = useCallback(async () => {
    const uid = user?.id
    if (!uid) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    try {
      const next = await fetchProfile(uid)
      setProfile(next)
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [user?.id])

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      role: profile?.role ?? null,
      initializing,
      profileLoading,
      clearAuth,
      signOut,
      refreshProfile,
    }),
    [
      user,
      session,
      profile,
      initializing,
      profileLoading,
      clearAuth,
      signOut,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
