import { getSupabase } from './supabase'
import { colorFromString, genInviteCode } from './types'
import type { Channel, DmMessage, DmThreadWithOther, MemberRole, Message, Profile, Role, RolePermission, Server, ServerEmoji, Sticker } from './types'
import { err, friendlyError } from './api/errors'

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

/**
 * Envia o e-mail de redefinição de senha (Supabase Auth).
 * O link do e-mail leva o usuário a definir uma nova senha; depois ele entra
 * no app normalmente com a senha nova. Não revelamos se o e-mail existe ou
 * não (evita enumeração de contas): a UI mostra a mesma mensagem de sucesso.
 *
 * Não passamos `redirectTo` porque o app roda em Electron (file://) e o
 * usuário abre o link no navegador — o link usa a URL de redirecionamento
 * configurada no projeto Supabase (Authentication → URL Configuration).
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = getSupabase()
  const redirect = import.meta.env.VITE_PASSWORD_RESET_REDIRECT
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    redirect ? { redirectTo: redirect } : { redirectTo: 'callvortex://reset' }
  )
  if (error) {
    throw friendlyError('Não foi possível enviar o e-mail de redefinição', error)
  }
}

/**
 * Consome a URL de deep-link (`callvortex://reset#access_token=...&type=recovery`),
 * estabelece a sessão temporária de recuperação e retorna true se for válida.
 * O Supabase, ao verificar o token, redireciona para o app com os tokens no
 * fragmento (#) — aqui os aplicamos para permitir trocar a senha.
 */
export async function applyRecoveryLink(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    const params = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash)
    // Também aceita tokens na query string (alguns SOs normalizam a URL)
    parsed.searchParams.forEach((v, k) => {
      if (!params.has(k)) params.set(k, v)
    })
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')
    if (type && type !== 'recovery') return false
    if (!accessToken || !refreshToken) return false
    const supabase = getSupabase()
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) {
      console.error('[api] applyRecoveryLink setSession ->', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[api] applyRecoveryLink ->', e)
    return false
  }
}

/** Define a nova senha do usuário autenticado (sessão de recuperação ativa). */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('at least') || msg.includes('password')) {
      throw new Error('A nova senha não atende aos requisitos (mínimo de 6 caracteres).')
    }
    throw friendlyError('Não foi possível salvar a nova senha', error)
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

/**
 * Canais de TODOS os servidores de que sou membro (a RLS de channels
 * permite select para membros). Usado para mapear channel_id -> server_id
 * nos contadores de não lidas e nas assinaturas globais de mensagens.
 */
export async function fetchAllChannels(serverIds: string[]): Promise<Channel[]> {
  const supabase = getSupabase()
  if (serverIds.length === 0) return []
  const { data, error } = await supabase
    .from('channels')
    .select('id, server_id, name, type, created_at')
    .in('server_id', serverIds)
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

export async function renameChannel(channelId: string, name: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('channels')
    .update({ name: name.trim().replace(/\s+/g, '-').toLowerCase() })
    .eq('id', channelId)
    .select('id')
    .maybeSingle()
  if (error) throw err('Erro ao renomear canal', error)
  if (!data) {
    // PostgREST retorna 0 linhas SEM erro quando o RLS bloqueia o update.
    // Se isso acontecer, a política "channels_update" não existe no banco.
    throw new Error(
      'Não foi possível renomear o canal (nenhuma linha alterada). Verifique se você é o dono do servidor e rode o supabase/schema.sql (ou supabase/migration-realtime-profiles.sql) no SQL Editor do Supabase para garantir as políticas de canal.'
    )
  }
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

// ------------------------------------------------------------
// CARGOS (estilo Discord)
// ------------------------------------------------------------

/** Cargos de um servidor, do mais alto para o mais baixo. */
export async function fetchRoles(serverId: string): Promise<Role[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('roles')
    .select('id, server_id, name, color, position, permissions')
    .eq('server_id', serverId)
    .order('position', { ascending: true })
    .order('name')
  if (error) throw err('Erro ao carregar cargos', error)
  return (data ?? []) as unknown as Role[]
}

/** Atribuições de cargos dos membros de um servidor. */
export async function fetchMemberRoles(serverId: string): Promise<MemberRole[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('member_roles')
    .select('server_id, role_id, user_id')
    .eq('server_id', serverId)
  if (error) throw err('Erro ao carregar atribuições', error)
  return (data ?? []) as unknown as MemberRole[]
}

export async function createRole(
  serverId: string,
  fields: { name: string; color: string | null; permissions: RolePermission[] }
): Promise<Role> {
  const supabase = getSupabase()
  // novos cargos nascem na base da hierarquia (0) — a UI os move para cima
  const { data, error } = await supabase
    .from('roles')
    .insert({ ...fields, server_id: serverId, position: 0 })
    .select('id, server_id, name, color, position, permissions')
    .single()
  if (error) throw err('Erro ao criar cargo', error)
  return data as unknown as Role
}

export async function updateRole(
  roleId: string,
  fields: { name?: string; color?: string | null; permissions?: RolePermission[]; position?: number }
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('roles').update(fields).eq('id', roleId)
  if (error) throw err('Erro ao salvar cargo', error)
}

export async function deleteRole(roleId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('roles').delete().eq('id', roleId)
  if (error) throw err('Erro ao excluir cargo', error)
}

/** Atribui/edita os cargos de um membro: grava o conjunto completo. */
export async function setMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<void> {
  const supabase = getSupabase()
  const { data: current, error: e1 } = await supabase
    .from('member_roles')
    .select('role_id')
    .eq('server_id', serverId)
    .eq('user_id', userId)
  if (e1) throw err('Erro ao ler cargos do membro', e1)
  const currentIds = new Set((current ?? []).map((r) => r.role_id as string))
  const target = new Set(roleIds)
  const toAdd = roleIds.filter((id) => !currentIds.has(id))
  const toRemove = [...currentIds].filter((id) => !target.has(id))
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('member_roles')
      .insert(toAdd.map((role_id) => ({ server_id: serverId, role_id, user_id: userId })))
    if (error) throw err('Erro ao atribuir cargo', error)
  }
  for (const role_id of toRemove) {
    const { error } = await supabase
      .from('member_roles')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId)
      .eq('role_id', role_id)
    if (error) throw err('Erro ao remover cargo', error)
  }
}

/** Expulsa membro do servidor (exige kick_members + hierarquia no banco). */
export async function kickMember(serverId: string, userId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('server_members')
    .delete()
    .eq('server_id', serverId)
    .eq('user_id', userId)
  if (error) throw err('Erro ao remover membro', error)
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

// ------------------------------------------------------------
// FIGURINHAS / GIFS (personais e de servidor)
// ------------------------------------------------------------

/** Minhas figurinhas pessoais + as do servidor ativo (numa lista só). */
export async function fetchStickers(serverId: string | null): Promise<Sticker[]> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('stickers')
    .select('id, server_id, owner_user_id, name, url, created_at')
    .or(`owner_user_id.eq.${user.id},server_id.eq.${serverId ?? '00000000-0000-0000-0000-000000000000'}`)
    .order('created_at', { ascending: true })
  if (error) throw err('Erro ao carregar figurinhas', error)
  return (data as Sticker[]) ?? []
}

/** Extensão canônica a partir do MIME (não do filename — arquivos sem ponto
 *  ou com nome estranho geravam extensão inválida e o Storage recusava). */
function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
  }
  return map[mime.toLowerCase()] ?? null
}

/**
 * Envia a figurinha para o Storage e registra na tabela.
 * @param scope null = pessoal ('user/<meuId>/…'); string = servidor ('server/<id>/…')
 */
export async function addSticker(scope: 'user' | string, name: string, file: File): Promise<void> {
  const supabase = getSupabase()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Você precisa estar logado.')

  // extensão canônica via MIME; tipos fora da lista são recusados ANTES de
  // enviar (o Storage só aceita png/jpg/jpeg/webp/gif por política).
  const ext = extFromMime(file.type)
  if (!ext) {
    throw new Error('Formato não suportado: use PNG, JPG, WebP ou GIF.')
  }
  const safeName = name.toLowerCase()
  const isServer = scope !== 'user'
  const insert = isServer
    ? { server_id: scope, owner_user_id: null, name: safeName, url: '' }
    : { server_id: null, owner_user_id: user.id, name: safeName, url: '' }
  const path = isServer
    ? `stickers/server/${scope}/${crypto.randomUUID()}.${ext}`
    : `stickers/user/${user.id}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage.from('stickers').upload(path, file, { upsert: false, contentType: file.type })
  if (upErr) throw stickerUploadError(upErr)
  const { data } = supabase.storage.from('stickers').getPublicUrl(path)

  const { error: insertError } = await supabase.from('stickers').insert({ ...insert, url: data.publicUrl })
  if (insertError) {
    await supabase.storage.from('stickers').remove([path])
    throw stickerInsertError(insertError)
  }
}

/** Mensagem clara para falhas de ENVIO no Storage (bucket/policy/extensão). */
function stickerUploadError(error: { message?: string }): Error {
  const detail = String(error.message ?? '')
  if (/row-level security|permission denied|new row violates/i.test(detail)) {
    console.error('[api] upload figurinha ->', detail)
    return new Error(
      'Sem permissão para enviar aqui. Se as figurinhas foram recém-criadas, ' +
        'rode a migração supabase/migrations/20261019000000_stickers.sql no painel do Supabase.'
    )
  }
  if (/not found|bucket/i.test(detail)) {
    return new Error('Bucket "stickers" não existe. Rode a migração de figurinhas no painel do Supabase.')
  }
  return new Error('Erro ao enviar a figurinha.')
}

/** Mensagem clara para falhas de REGISTRO na tabela (duplicado/check/RLS). */
function stickerInsertError(error: { message?: string }): Error {
  const detail = String(error.message ?? '')
  if (/duplicate key|violates unique constraint/i.test(detail)) {
    console.error('[api] insert figurinha (duplicada) ->', detail)
    return new Error('Você já tem uma figurinha com esse nome. Escolha outro.')
  }
  if (/stickers_name_check/i.test(detail)) {
    return new Error('Nome inválido: use apenas letras, números, _ ou - (máx. 32).')
  }
  if (/row-level security|permission denied|pgrst|new row violates/i.test(detail)) {
    console.error('[api] insert figurinha ->', detail)
    return new Error('Não foi possível salvar a figurinha. Verifique se a migração de figurinhas foi aplicada.')
  }
  return new Error('Erro ao salvar a figurinha.')
}

export async function removeSticker(stickerId: string): Promise<void> {
  const supabase = getSupabase()
  const { data } = await supabase.from('stickers').select('url').eq('id', stickerId).maybeSingle()
  const { error } = await supabase.from('stickers').delete().eq('id', stickerId)
  if (error) throw err('Erro ao excluir a figurinha', error)
  if (data?.url) {
    const path = data.url.split('/stickers/')[1]
    if (path) await supabase.storage.from('stickers').remove([decodeURIComponent(path)]).then(
      () => undefined,
      () => undefined
    )
  }
}

// ------------------------------------------------------------
// ATIVIDADE DE VOZ (sessões ativas por canal)
// ------------------------------------------------------------

export async function fetchVoiceSessions(channelIds: string[]): Promise<Record<string, string>> {
  const supabase = getSupabase()
  if (channelIds.length === 0) return {}
  const { data, error } = await supabase
    .from('voice_sessions')
    .select('channel_id, started_at')
    .in('channel_id', channelIds)
  if (error) throw err('Erro ao carregar atividade de voz', error)
  const sessions: Record<string, string> = {}
  for (const row of (data ?? []) as { channel_id: string; started_at: string }[]) {
    sessions[row.channel_id] = row.started_at
  }
  return sessions
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
