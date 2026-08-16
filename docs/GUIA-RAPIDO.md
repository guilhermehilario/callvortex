# ⚡ Guia Rápido — do zero até conversar com o amigo

Resumo executivo de tudo que você precisa saber para rodar o app e testar a
conexão com seu amigo. Detalhes em cada guia específico.

---

## O que é o projeto

**Discord Clone** — app desktop (Electron + React) de chat por texto e voz
estilo Discord, para conversar com amigos. O "servidor" invisível é um projeto
**Supabase grátis** (contas, dados, mensagens em tempo real); o **áudio é ponto
a ponto** (WebRTC), com STUN + TURN público já configurados.

## Pasta do projeto

`C:\Users\guilherme hilario\Documents\Projetos\discord-clone`

## Arquivos importantes

| Arquivo | Para quê |
|---|---|
| `.env` | Chaves do Supabase (NÃO compartilhar / não vai pro git) |
| `supabase/schema.sql` | Cria tabelas + segurança + realtime (rodar 1x no SQL Editor) |
| `supabase/migration-avatars-emojis.sql` | Fotos de perfil + emojis (se já rodou o schema antigo) |
| `supabase/migration-voice.sql` | Canais de voz (se já rodou o schema antigo) |
| `release/Discord Clone 0.1.2.exe` | **O arquivo para enviar ao amigo** (87 MB, portátil) |

## Comandos

```bash
npm install        # 1ª vez
npm run dev        # rodar em desenvolvimento (lê o .env)
npm run typecheck  # checar erros de tipo
npm run dist       # gerar o .exe (release/Discord Clone 0.1.2.exe)
```

> ⚠️ O `.exe` grava as chaves do `.env` **dentro dele** no momento do build.
> Sempre que o `.env` mudar → rode `npm run dist` de novo.

## Plano de teste com o amigo (5 minutos)

1. **Você**: abra o app (`npm run dev` ou o `.exe`) → crie sua conta
   (e-mail + senha + username).
2. **Você**: botão **＋** → **Criar servidor** → copie o código de convite
   (menu do servidor → **Copiar convite**) e mande para o amigo.
3. **Amigo**: abre o `.exe` que você enviou → **Criar conta** → **＋** →
   **Entrar em servidor (código)** → cola o código.
4. **Você**: menu do servidor → **Criar canal** → **Voz** → clique no canal
   para entrar.
5. **Amigo**: clica no mesmo canal de voz → conversem! 🎙️

## Se algo der errado

| Sintoma | Causa | Solução |
|---|---|---|
| Tela "Falta configurar o Supabase" | `.env` vazio/ausente | Preencher (ver `CONFIGURACAO.md`) |
| "Failed to fetch" no login | Chaves erradas ou `.exe` antigo | Conferir `.env`; enviar `.exe` novo |
| Windows bloqueia o `.exe` | Smart App Control | Windows Security → App & browser control → Smart App Control → Off |
| Tela em branco | Processos órfãos do app | Encerrar e rodar `npm run dev` de novo (ver `RESOLUCAO-DE-PROBLEMAS.md`) |
| Áudio não conecta | NAT restrito | Reiniciar; o app já usa TURN público |

## Documentos

- `CONFIGURACAO.md` — onde achar as chaves no Supabase
- `docs/COMO-FUNCIONA.md` — arquitetura (nuvem + P2P, papel do criador)
- `docs/GUIA-DO-CRIADOR.md` — passo a passo completo do criador
- `docs/GUIA-DO-AMIGO.md` — o que enviar/ensinar ao amigo
- `docs/RESOLUCAO-DE-PROBLEMAS.md` — todos os erros já encontrados e como resolver
- `docs/ESTADO-DO-PROJETO.md` — o que está implementado e verificado
- `docs/SELF-HOSTED.md` — opção avançada (sua máquina como servidor)
