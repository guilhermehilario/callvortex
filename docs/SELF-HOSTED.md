# 🖥️ Opção avançada: sua máquina como servidor de verdade (self-hosted)

Este documento analisa o cenário em que **a sua máquina é o host do backend**
— sem depender da nuvem do Supabase. É possível, mas tem custos de
confiabilidade e configuração. Leia com calma antes de decidir.

---

## Comparação rápida

| | Modelo atual (nuvem grátis) | Self-hosted na sua máquina |
|---|---|---|
| "Servidor" | Supabase na nuvem | Supabase local (Docker) no seu PC |
| Amigo precisa de internet | ✅ Sim | ✅ Sim (para chegar até você) |
| Seu PC precisa estar ligado | ❌ Não | ✅ **Sim, sempre** |
| Configuração de rede | ❌ Nenhuma | ⚠️ Portas/túnel ou mesma rede |
| Confiabilidade | Alta | Baixa (seu PC desliga = app para) |
| Custo | Grátis | Grátis (mas seu PC vira servidor) |
| Complexidade | Baixa | Alta |

---

## Cenário A — Mesma rede Wi-Fi (LAN)

Funciona sem internet externa, mas só dentro da sua casa.

1. **Instale o Docker Desktop** (Windows) e deixe rodando.
2. **Instale o Supabase CLI** (`supabase` via Scoop/Chocolatey ou npm) e rode:
   ```bash
   supabase init
   supabase start        # baixa e sobe o Postgres + API + Realtime localmente
   ```
   - Requisitos: **4 GB de RAM mínimos (8 GB recomendados)** e ~40 GB de disco.
   - Ao terminar, ele imprime a **URL da API** (`http://localhost:54321` ou
     `http://SEU-IP-LOCAL:54321`) e a **anon key**.
3. Aplique o `supabase/schema.sql` no SQL Editor local.
4. **Recompile o app apontando para o seu IP local**: coloque no `.env`
   `VITE_SUPABASE_URL=http://SEU-IP-LOCAL:54321` + a anon key local e rode
   `npm run dist`. **Gere um `.exe` novo para cada rede** (a URL fica embutida).
5. O amigo (na mesma rede) instala esse `.exe` e usa normalmente.

**Limitações:** seu PC precisa ficar **ligado e com o Docker rodando**; o
amigo só funciona na mesma rede; a URL embutida no `.exe` é fixa (se seu IP
mudar, precisa rebuildar).

---

## Cenário B — Pela internet (amigo em outra cidade)

Para o amigo alcançar sua máquina de fora, você precisa de uma destas opções:

| Opção | Como | Fragilidade |
|---|---|---|
| **Túnel** (ngrok / cloudflared) | Roda um comando que cria um link público temporário para o seu localhost | O link muda a cada execução (plano grátis) → precisa rebuildar o `.exe` toda hora |
| **Port forwarding + DDNS** | Abre a porta no roteador e aponta um domínio dinâmico (ex: no-ip) | Configuração delicada; provedor de internet pode usar CG-NAT (impede port forwarding) |
| **VPS barata** (DigitalOcean/Hetzner) | Sobe o Docker com Supabase num servidor alugado (~US$ 5/mês) | Não é mais "sua máquina", mas é o jeito confiável de self-host |

> ⚠️ O Supabase local é feito para **desenvolvimento**, não para expor na
> internet sem segurança. Para uso real, o caminho seguro é uma **VPS**.

---

## E a voz (áudio)?

- **Mesma rede:** o WebRTC se conecta direto entre as máquinas — funciona bem.
- **Pela internet:** mesma situação de sempre — STUN ajuda, mas em NATs
  restritos precisa de **TURN**. Um servidor TURN pode rodar na sua própria
  máquina/VPS também.

---

## E o "host do áudio" (sua máquina repassando o som de todos)?

O app hoje usa **malha (mesh)**: todos conectam com todos, sem host central.
Se você quiser que **sua máquina seja o hub de áudio** (topologia em estrela,
estilo servidor do Discord oficial), isso é uma **mudança de código** (SFU ou
relay via RTCPeerConnection na sua máquina) — não é configuração. Dá para
planejar como melhoria futura, mas hoje o modelo mesh atende salas pequenas
(2–6 pessoas) sem host.

---

## Recomendação

Para **"só eu e meu amigo, agora"**, o modelo atual (projeto Supabase grátis)
é **muito mais simples e confiável**: o "servidor" fica na nuvem, seu PC não
precisa ficar ligado, não exige Docker, roteador ou IP público, e o amigo só
precisa do `.exe` + internet.

Escolha o self-hosted apenas se você quiser **independência total da nuvem**
(privacidade radical, sem terceiros) e topar administrar a infraestrutura.

---

Veja também:
- `COMO-FUNCIONA.md` — como o app funciona hoje (nuvem + P2P)
- `GUIA-DO-CRIADOR.md` — o passo a passo recomendado (nuvem grátis)
