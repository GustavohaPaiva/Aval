import { supabase } from './supabase'

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 3 * 1024 * 1024 // 3 MB

function extFromFile(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  const fromType = file.type?.split('/').pop()
  return fromType || 'png'
}

/**
 * Faz upload da foto de perfil para o bucket `avatars` e grava a URL
 * pública em user_metadata.avatar_url. Dispara USER_UPDATED, que o
 * AuthProvider já escuta para atualizar o usuário em memória.
 */
export async function uploadAvatar(file) {
  if (!file) return { ok: false, error: 'Selecione uma imagem.' }
  if (!file.type?.startsWith('image/')) {
    return { ok: false, error: 'O arquivo precisa ser uma imagem.' }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: 'A imagem deve ter no máximo 3 MB.' }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const path = `${user.id}/avatar-${Date.now()}.${extFromFile(file)}`

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  })

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return { ok: true, avatarUrl: publicUrl }
}

/**
 * Remove a foto de perfil (limpa user_metadata.avatar_url).
 */
export async function removeAvatar() {
  const { error } = await supabase.auth.updateUser({
    data: { avatar_url: null },
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
