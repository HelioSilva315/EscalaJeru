# EscalaJeru

Escalas, agenda e comunicação da **Igreja JERU** em um só lugar.

Aplicativo web instalável (PWA), feito para líderes e membros organizarem quem
serve em cada encontro, confirmarem presença e conversarem por ministério — com
lembrete por WhatsApp ou SMS até 24 horas antes.

---

## O que tem dentro

| Área | Para quem | O que faz |
| --- | --- | --- |
| Painel | todos | Próximo encontro, sua próxima escala, pendências e visão geral |
| Agenda | todos | Calendário mensal, detalhes do encontro, exportação `.ics` e Google Agenda |
| Escalas | líderes editam / membros confirmam | Monte a equipe por ministério, acompanhe confirmações e envie lembretes |
| Pessoas | líderes | Cadastro de líderes e membros, telefone obrigatório, convite de acesso |
| Ministérios | líderes | Times, líder responsável, cor e canal de conversa |
| Chat | todos | Canal Geral + um canal por ministério, em tempo real |
| Ajustes | todos | Perfil, telefone, preferências de aviso, tema, link da agenda e instalação |

### Regras de negócio garantidas no banco

- **Uma pessoa por ministério, por dia.** Índice único parcial em
  `schedules (profile_id, event_date)` — escalas recusadas não bloqueiam.
- **Só líderes cadastram e escalam.** Verificado por RLS no Postgres, não apenas
  na interface.
- **Telefone obrigatório** no cadastro, normalizado em E.164 (`+55DDDnumero`).
- **Primeiro acesso vira líder.** Os seguintes entram por convite de uso único.
- **Aviso até 24 h antes** por WhatsApp/SMS, com fallback para o aviso no app.

---

## Stack

- **React 19 + TypeScript + Vite 7** — CSS próprio, sem framework de UI.
- **Supabase** — Auth, Postgres com RLS, Realtime e Edge Functions (Deno).
- **Netlify** — build, CDN, HTTPS automático e cabeçalhos de segurança.
- **PWA** — instalável, cache offline do app shell e atualização automática.
- **GitHub Actions** — typecheck + build a cada push.

---

## Rodar localmente

```bash
npm install
npm run dev
```

Sem variáveis de ambiente o app abre em **modo demonstração**, com dados de
exemplo e duas personas (líder e membro). Nada sai do navegador.

```bash
npm run build      # typecheck + build de produção
npm run preview    # serve o build
npm run icons      # regenera os ícones do PWA
```

Para conectar ao Supabase:

```bash
cp .env.example .env
# edite VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

> A chave `anon` é pública por design — a proteção real vem do RLS.
> **Nunca** coloque a `service_role` no `.env` do front-end.

---

## 1. Configurar o Supabase

1. Acesse <https://supabase.com> → **New project**.
   - Região: `South America (São Paulo)` se disponível.
   - Guarde a senha do banco em local seguro.
2. Em **Project Settings → API**, copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_ANON_KEY`
3. Em **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   e clique em **Run**. Isso cria tabelas, índices, triggers, RLS, a view
   `people_directory` e o canal **Geral**.
4. Em **Authentication → Providers → Email**, mantenha habilitado.
5. Em **Authentication → URL Configuration**:
   - **Site URL**: `https://SEU-SITE.netlify.app`
   - **Redirect URLs**: `https://SEU-SITE.netlify.app/**` e
     `http://localhost:5173/**`
6. Em **Authentication → Emails**, ajuste o remetente para o nome da igreja.
7. O **primeiro cadastro** feito em `/login` (opção “Comece por aqui”) vira
   líder automaticamente. Depois disso, cadastros só entram por convite.
8. Depois de criar o primeiro líder, você pode desativar novos cadastros
   públicos em **Authentication → Sign In / Providers → Email** (opção
   *Allow new users to sign up*). Os convites continuam funcionando, porque
   usam a API administrativa com a `service_role`.

### Edge Functions

Instale a CLI e vincule o projeto:

```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

Publique as funções:

```bash
supabase functions deploy admin
supabase functions deploy accept-invite
supabase functions deploy notify-schedules
supabase functions deploy calendar --no-verify-jwt
```

Configure os segredos (veja [`supabase/.env.example`](supabase/.env.example)):

```bash
supabase secrets set APP_URL=https://SEU-SITE.netlify.app
supabase secrets set APP_ORIGIN=https://SEU-SITE.netlify.app
supabase secrets set CRON_SECRET="uma-string-longa-e-aleatoria"

# WhatsApp (escolha um provedor)
supabase secrets set WHATSAPP_PROVIDER=cloud
supabase secrets set WHATSAPP_TOKEN=...
supabase secrets set WHATSAPP_PHONE_ID=...

# ou Z-API
# supabase secrets set WHATSAPP_PROVIDER=zapi
# supabase secrets set ZAPI_INSTANCE=...
# supabase secrets set ZAPI_TOKEN=...
# supabase secrets set ZAPI_CLIENT_TOKEN=...

# SMS (opcional)
supabase secrets set TWILIO_ACCOUNT_SID=...
supabase secrets set TWILIO_AUTH_TOKEN=...
supabase secrets set TWILIO_FROM_NUMBER=+1...
```

Sem provedor configurado, o sistema continua funcionando: o lembrete aparece
dentro do app e o envio externo é marcado como `skipped`.

### Lembrete automático (24 h)

Agende a função a cada hora usando `pg_cron` + `pg_net` no SQL Editor:

```sql
select cron.schedule(
  'escalajeru-lembretes',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/notify-schedules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'O-MESMO-CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

A função envia apenas para escalas das próximas 24 h ainda não avisadas.

---

## 2. Publicar no Netlify

1. Crie o repositório no GitHub (veja abaixo) e faça o push.
2. Em <https://app.netlify.com> → **Add new site → Import an existing project**.
3. Autorize o GitHub e escolha o repositório `EscalaJeru`.
4. Configurações de build (o `netlify.toml` já define, confirme):
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Node version**: 22
5. Em **Site configuration → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CHURCH_NAME` (opcional, padrão `Igreja JERU`)
6. Clique em **Deploy site**. O HTTPS é emitido automaticamente.
7. Copie a URL final e atualize no Supabase:
   - **Authentication → URL Configuration** (Site URL e Redirect URLs)
   - Segredo `APP_URL` / `APP_ORIGIN` das Edge Functions

### GitHub

```bash
git init
git add .
git commit -m "EscalaJeru: escalas, agenda e chat da Igreja JERU"
gh repo create EscalaJeru --private --source=. --remote=origin --push
```

A cada push na `main`, o Netlify publica e o GitHub Actions roda
`npm run typecheck` e `npm run build`.

---

## Segurança

- **RLS em todas as tabelas** — o cliente nunca decide permissão.
- **Papel não é falsificável**: convidados recebem `role` em `app_metadata`,
  que só o servidor escreve.
- **View `people_directory`** expõe apenas nome, papel e cor — telefone e e-mail
  ficam restritos à liderança.
- **Chat** valida acesso ao canal e limita 12 mensagens por minuto por pessoa.
- **Convites** são códigos aleatórios de uso único, com validade de 7 dias.
- **Link da agenda** é um token UUID individual e revogável: em **Ajustes →
  Agenda no celular → Gerar novo link**, o endereço antigo para de funcionar.
- **Netlify** aplica HSTS, CSP, `X-Frame-Options: DENY`, `nosniff` e
  `Permissions-Policy`.
- **DDoS**: a borda do Netlify absorve volumetria; o Supabase aplica rate limit
  de autenticação e as funções têm validação própria.

> Ajuste a CSP em `netlify.toml` se um dia usar domínio próprio no Supabase.

---

## Estrutura

```
src/
  components/    Layout, ícones SVG, UI (modal, toast, campos)
  context/       Auth, dados da igreja, tema
  lib/           api.ts (Supabase/demo), types, datas, telefone, ICS, demo
  pages/         Login, Dashboard, Agenda, Schedules, People, Ministries, Chat, Settings, More
  styles/        tokens, base, componentes e páginas
supabase/
  schema.sql     tabelas, triggers, RLS, view e seed
  functions/     admin, accept-invite, notify-schedules, calendar
scripts/
  icons.mjs      geração dos ícones PWA
```

O modo demonstração fica isolado em `src/lib/demo.ts`; a interface consome
apenas `src/lib/api.ts`, então trocar de backend não exige mexer nas páginas.

---

Feito para servir melhor. **Soli Deo Gloria.**
