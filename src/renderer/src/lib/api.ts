import { getSupabase } from './supabase'
import { colorFromString, genInviteCode } from './types'
import type { Channel, DmMessage, DmThreadWithOther, Message, Profile, Server, ServerEmoji } from './types'

function err(message: string, error: unknown): Error {
  const detail = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : String(error)
  return new Error(`${message}${detail ? `: ${detail}` : ''}`)
}

/**
 * Converte erros de rede/API em mensagens amigáveis.
 * "Failed to fetch" normalmente significa que a URL do Supabase está errada,
 * sem internet, ou o projeto não existe — nada que o usuário possa resolver
 * dentro do app.
 */
function friendlyError(prefix: string, error: unknown): Error {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : String(error)
  if (/failed to fetch|networkerror|network error|fetch failed|socket hang/i.test(raw)) {
    return new Error(
      `${prefix}. Não foi possível conectar ao servidor — verifique sua internet e se as chaves no arquivo .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) estão corretas.`
    )
  }
  if (/rate limit|over_email_send_rate_limit|too many requests/i.test(raw)) {
    return new Error(
      `${prefix}: o Supabase atingiu o limite temporário de e-mails/cadastros (o plano grátis permite poucos por hora). Aguarde cerca de 1 hora e tente de novo, ou desative a confirmação de e-mail no painel do Supabase (Authentication → Providers → Email → desmarque "Confirm email").`
    )
  }
  return err(prefix, error)
}

// ------------------------------------------------------------
// AUTH + PERFIL
// ------------------------------------------------------------

export async function signUp(email: string, password: string, username: string): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw friendlyError('Não foi possível criar a conta', error)
  const user = data.user
  if (!user) throw new Error('Não foi possível criar a conta.')

  const profile: Profile = {
    id: user.id,
    username: username.trim(),
    avatar_color: colorFromString(username.trim()),
    created_at: new Date().toISOString()
  }
  const { error: profileError } = await supabase.from('profiles').insert(profile)
  if (profileError) {
    // username já existe
    throw err('Esse nome de usuário já está em uso', profileError)
  }
  return profile
}

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('invalid login')) throw new Error('E-mail ou senha incorretos.')
    throw friendlyError('Não foi possível entrar', error)
  }
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_color, avatar_url, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw err('Erro ao carregar perfil', error)
  if (!data) {
    // Perfil não criado (ex.: conta criada fora do app) — cria na hora
    const username = `usuario_${userId.slice(0, 5)}`
    const profile: Profile = { id: userId, username, avatar_color: colorFromString(username), created_at: new Date().toISOString() }
    const { error: insertError } = await supabase.from('profiles').insert(profile)
    if (insertError) throw err('Erro ao criar perfil', insertError)
    return profile
  }
  return data as Profile
}

// ------------------------------------------------------------
// SERVIDORES
// ------------------------------------------------------------

export async function fetchMyServers(): Promise<Server[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('servers')
    .select('id, name, owner_id, icon_color, invite_code, created_at')
    .order('created_at', { ascending: true })
  if (error) throw err('Erro ao carregar servidores', error)
  return (data as Server[]) ?? []
}

export async function createServer(name: string): Promise<Server> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Você precisa estar logado.')

  const server: Omit<Server, 'created_at'> & { created_at: string } = {
    id: crypto.randomUUID(),
    name: name.trim(),
    owner_id: user.id,
    icon_color: colorFromString(name.trim()),
    invite_code: genInviteCode(),
    created_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from('servers').insert(server).select().single()
  if (error) throw err('Erro ao criar servidor', error)

  await supabase.from('server_members').insert({ server_id: data.id, user_id: user.id })
  await supabase.from('channels').insert({ server_id: data.id, name: 'geral' })
  return data as Server
}

export async function joinServerByCode(code: string): Promise<Server> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('join_server', { code })
  if (error) throw err('Não foi possível entrar no servidor', error)
  if (!data) throw new Error('Código de convite inválido.')
  return data as Server
}

export async function deleteServer(serverId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('servers').delete().eq('id', serverId)
  if (error) throw err('Erro ao excluir servidor', error)
}

// ------------------------------------------------------------
// CANAIS
// ------------------------------------------------------------

export async function fetchChannels(serverId: string): Promise<Channel[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('channels')
    .select('id, server_id, name, type, created_at')
    .eq('server_id', serverId)
    .order('created_at', { ascending: true })
  if (error) throw err('Erro ao carregar canais', error)
  return (data as Channel[]) ?? []
}

export async function createChannel(serverId: string, name: string, type: 'text' | 'voice' = 'text'): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('channels')
    .insert({ server_id: serverId, name: name.trim().replace(/\s+/g, '-').toLowerCase(), type })
  if (error) throw err('Erro ao criar canal', error)
}

export async function deleteChannel(channelId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('channels').delete().eq('id', channelId)
  if (error) throw err('Erro ao excluir canal', error)
}

// ------------------------------------------------------------
// MENSAGENS DE CANAL
// ------------------------------------------------------------

export interface MessageWithAuthor extends Message {
  author: Profile
}

export async function fetchMessages(channelId: string, limit = 200): Promise<MessageWithAuthor[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('messages')
    .select('id, channel_id, author_id, content, created_at, author:author_id (id, username, avatar_color, avatar_url)')
    .eq('channel_id', channelId)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw err('Erro ao carregar mensagens', error)
  const rows = (data ?? []) as {
    id: number
    channel_id: string
    author_id: string
    content: string
    created_at: string
    author: Profile | Profile[]
  }[]
  return rows.map((r) => ({ ...r, author: Array.isArray(r.author) ? r.author[0] : r.author }))
}

export async function sendChannelMessage(channelId: string, content: string): Promise<void> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('messages').insert({ channel_id: channelId, author_id: user.id, content })
  if (error) throw err('Erro ao enviar mensagem', error)
}

export async function deleteMessage(messageId: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('messages').delete().eq('id', messageId)
  if (error) throw err('Erro ao excluir mensagem', error)
}

// ------------------------------------------------------------
// MENSAGENS DIRETAS
// ------------------------------------------------------------

export async function fetchDmThreads(): Promise<DmThreadWithOther[]> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('dm_threads')
    .select('*, participants:dm_participants (user_id, profile:user_id (id, username, avatar_color, avatar_url))')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) throw err('Erro ao carregar conversas', error)

  const threads: DmThreadWithOther[] = []
  for (const row of data ?? []) {
    const participants = (row.participants ?? []) as { user_id: string; profile: Profile | Profile[] }[]
    const otherRaw = participants.find((p) => p.user_id !== user.id)?.profile
    const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw
    if (!other) continue
    threads.push({
      id: row.id,
      last_message: row.last_message,
      last_message_author: row.last_message_author,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      other
    })
  }
  return threads
}

export async function getOrCreateDmThread(otherUserId: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('create_dm_thread', { other_user: otherUserId })
  if (error) throw err('Erro ao abrir conversa', error)
  return (data as { id: string }).id
}

export interface DmMessageWithAuthor extends DmMessage {
  author: Profile
}

export async function fetchDmMessages(threadId: string, limit = 200): Promise<DmMessageWithAuthor[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dm_messages')
    .select('id, thread_id, author_id, content, created_at, author:author_id (id, username, avatar_color, avatar_url)')
    .eq('thread_id', threadId)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw err('Erro ao carregar mensagens', error)
  const rows = (data ?? []) as {
    id: number
    thread_id: string
    author_id: string
    content: string
    created_at: string
    author: Profile | Profile[]
  }[]
  return rows.map((r) => ({ ...r, author: Array.isArray(r.author) ? r.author[0] : r.author }))
}

export async function sendDmMessage(threadId: string, content: string): Promise<void> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('dm_messages').insert({ thread_id: threadId, author_id: user.id, content })
  if (error) throw err('Erro ao enviar mensagem', error)

  await supabase
    .from('dm_threads')
    .update({ last_message: content, last_message_author: user.id, last_message_at: new Date().toISOString() })
    .eq('id', threadId)
}

export async function deleteDmMessage(messageId: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('dm_messages').delete().eq('id', messageId)
  if (error) throw err('Erro ao excluir mensagem', error)
}

// ------------------------------------------------------------
// MEMBROS E BUSCA
// ------------------------------------------------------------

export async function fetchMembers(serverId: string): Promise<Profile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('server_members')
    .select('user_id, profile:user_id (id, username, avatar_color, avatar_url)')
    .eq('server_id', serverId)
  if (error) throw err('Erro ao carregar membros', error)
  const members: Profile[] = []
  for (const row of data ?? []) {
    const profile = row.profile
    if (Array.isArray(profile) ? profile[0] : profile) {
      members.push(Array.isArray(profile) ? profile[0] : (profile as Profile))
    }
  }
  return members
}

export async function searchUsers(query: string): Promise<Profile[]> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_color, avatar_url')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', user.id)
    .limit(10)
  if (error) throw err('Erro na busca', error)
  return (data as Profile[]) ?? []
}

// ------------------------------------------------------------
// FOTO DE PERFIL
// ------------------------------------------------------------

export async function uploadAvatar(file: File): Promise<string> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Você precisa estar logado.')

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${user.id}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw err('Erro ao enviar a imagem', error)

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = data.publicUrl
  const { error: upErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
  if (upErr) throw err('Erro ao salvar a foto', upErr)
  return url
}

// ------------------------------------------------------------
// EMOJIS PERSONALIZADOS DO SERVIDOR
// ------------------------------------------------------------

export async function fetchServerEmojis(serverId: string): Promise<ServerEmoji[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('server_emojis')
    .select('id, server_id, name, url')
    .eq('server_id', serverId)
    .order('created_at', { ascending: true })
  if (error) throw err('Erro ao carregar emojis', error)
  return (data as ServerEmoji[]) ?? []
}

export async function addServerEmoji(serverId: string, name: string, file: File): Promise<void> {
  const supabase = getSupabase()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${serverId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('emojis').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw err('Erro ao enviar o emoji', error)

  const { data } = supabase.storage.from('emojis').getPublicUrl(path)
  const { error: insertError } = await supabase.from('server_emojis').insert({ server_id: serverId, name: name.toLowerCase(), url: data.publicUrl })
  if (insertError) {
    await supabase.storage.from('emojis').remove([path])
    throw err('Erro ao salvar o emoji', insertError)
  }
}

export async function removeServerEmoji(emojiId: string): Promise<void> {
  const supabase = getSupabase()
  const { data } = await supabase.from('server_emojis').select('url').eq('id', emojiId).maybeSingle()
  const { error } = await supabase.from('server_emojis').delete().eq('id', emojiId)
  if (error) throw err('Erro ao excluir o emoji', error)
  // melhor esforço: apagar o arquivo do storage também
  if (data?.url) {
    const path = data.url.split('/emojis/')[1]
    if (path) await supabase.storage.from('emojis').remove([decodeURIComponent(path)])
  }
}
