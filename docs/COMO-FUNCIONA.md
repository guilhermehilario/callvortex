# 🧠 Como o app funciona (análise)

Este documento explica **quem é o "servidor"**, o que roda na nuvem, o que é
ponto a ponto (P2P) e o que exatamente significa "o criador ser o host da sala"
no jeito que o app foi construído hoje.

---

## 1. Visão geral da arquitetura atual

O app tem **duas partes** que se misturam:

### ☁️ Parte na nuvem (Supabase — projeto grátis)
Tudo que é *dado* e *sinalização* passa pelo projeto Supabase que você criou.
Ele é o "servidor invisível" que faz o app funcionar:

| O quê | Onde vive | Detalhe |
|---|---|---|
| Contas (e-mail/senha) | Supabase Auth | Login e criação de conta |
| Servidores, canais, mensagens, DMs, emojis | Postgres | Banco de dados |
| Mensagens em tempo real | Supabase Realtime | O chat atualiza ao vivo |
| Fotos de perfil e emojis | Supabase Storage | Upload de imagens |
| Sinalização de voz (quem entrou, oferta/resposta, ICE) | Supabase Realtime | Só "aperto de mão" do WebRTC |

### 🔗 Parte ponto a ponto (WebRTC — entre as máquinas)
O **áudio da voz** não passa pela nuvem. Quando você e seu amigo entram num
canal de voz, as máquinas de vocês se conectam **diretamente entre si** (malha:
cada um conecta com todos os outros). A nuvem só ajuda a "apresentar" as duas
máquinas (sinalização) e a descobrir o IP (servidor STUN público).

---

## 2. Onde está o "servidor" da sala?

Resposta curta: **a sala (o canal de voz/texto) vive no banco da nuvem** — não
na sua máquina. O criador do servidor é quem *controla* a sala (cria canais,
exclui, gerencia emojis, dá o código de convite), mas a infraestrutura que
mantém a sala de pé é o projeto Supabase compartilhado.

Sobre o **áudio**: no modo atual (malha/mesh) **não existe host central** —
todos os participantes se conectam entre si. O "host" que você mencionou só
existiria em dois cenários diferentes:

1. **SFU/relay**: uma máquina (ou servidor) que recebe e repassa o áudio de
   todos (como o Discord oficial faz com servidores deles). Dá para fazer a sua
   máquina assumir esse papel, mas é um desenvolvimento futuro (ver
   `SELF-HOSTED.md`).
2. **Servidor de dados na sua máquina**: rodar o próprio Supabase localmente.
   Também documentado em `SELF-HOSTED.md` — funciona, mas tem custos de
   confiabilidade.

**Para o seu objetivo de hoje ("só eu e meu amigo, eu sendo o criador"), o
desenho atual já resolve:** você cria o servidor → seu amigo entra pelo código
de convite → vocês se encontram e conversam por texto e voz, sem mais ninguém
conseguindo entrar (só quem tem o código ou o username).

---

## 3. Como um amigo "te encontra"

Há **dois caminhos**, e ambos passam pela nuvem compartilhada — por isso
funciona de qualquer máquina, em qualquer rede, só com internet:

| Caminho | Como | Quando usar |
|---|---|---|
| 🔍 **Buscar por nome de usuário** | Botão `＋` em "Mensagens diretas" → digita o username → clica | Iniciar conversa privada (DM) |
| 🔗 **Código de convite** | Você cria o servidor → menu do servidor → **Copiar convite** → manda para o amigo → ele cola em **Entrar em servidor** | Amigo entrar na sua sala |

> Requisito: os dois precisam ter **conta criada** no app (e-mail + senha) e
> **internet**. Não é preciso estar na mesma rede, nem ter IP público, nem
> configurar roteador.

---

## 4. Requisitos reais para "só entre minha máquina e a do meu amigo"

| Item | Necessário? | Por quê |
|---|---|---|
| Projeto Supabase (grátis) | ✅ Sim | É o "servidor" invisível (dados + contas + sinalização) |
| Internet nos dois | ✅ Sim | Nuvem + sinalização de voz |
| Sua máquina ligada para o amigo usar? | ❌ Não | A nuvem fica no Supabase, não no seu PC |
| IP público / porta no roteador | ❌ Não | Não é necessário no modelo atual |
| Amigo ter o código-fonte | ❌ Não | Só o `.exe` instalado |
| `.exe` gerado **depois** do `.env` correto | ✅ Sim | As chaves ficam gravadas dentro do executável no build |
| Áudio funcionar em qualquer rede | ⚠️ Talvez | Precisa de STUN (já incluso). Em redes com NAT restrito (ex.: Wi-Fi de empresa, 4G de algumas operadoras) pode precisar de um servidor TURN (ver seção 5) |

---

## 5. Limitação conhecida da voz: NAT restrito e TURN

O WebRTC usa servidores **STUN públicos** (já configurados no app) para
descobrir o IP. Isso funciona na maioria das redes domésticas. Porém, quando as
duas máquinas estão atrás de NATs restritos (alguns roteadores, redes de
empresa, 4G/5G com CG-NAT), a conexão direta **não consegue ser estabelecida**
e o áudio não conecta.

Solução: um servidor **TURN** — um "ponte" que repassa o áudio quando o P2P
direto falha. Existem opções com plano gratuito (Metered, Xirsys, Cloudflare
Calls) ou self-hosted. **Isso é uma melhoria futura do app**; quando
implementada, a voz passa a funcionar em praticamente qualquer rede.

> Se o amigo estiver na **mesma rede Wi-Fi** que você, o áudio funciona sem
> TURN — as máquinas se falam diretamente na rede local.

---

## 6. Resumo

- O app **já é feito para "só você e seus amigos"**: contas, servidor com
  código de convite e busca por username já limitam o acesso a quem você
  convidar.
- O "servidor da sala" hoje é o **projeto Supabase** (nuvem grátis) + **P2P**
  no áudio. Sua máquina não hospeda nada.
- Para o seu amigo usar: **basta o `.exe`** (gerado com as chaves corretas) +
  conta criada + internet. Nada de configurar rede, roteador ou IP.
- Se você quiser que **sua máquina seja o servidor de verdade** (independência
  total da nuvem), veja `SELF-HOSTED.md` — é possível, porém bem mais frágil e
  trabalhoso.

---

Veja também:
- `GUIA-DO-CRIADOR.md` — o passo a passo para você (quem cria a sala)
- `GUIA-DO-AMIGO.md` — o passo a passo para enviar ao seu amigo
- `SELF-HOSTED.md` — a opção avançada de hospedar tudo na sua máquina
