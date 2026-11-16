# EscalaJeru — Funcionalidades

**EscalaJeru** é o aplicativo de escalas, agenda e comunicação da **Igreja JERU**.
Disponível no navegador e instalável no celular (PWA), com login seguro e
notificações por WhatsApp, SMS ou dentro do app.

Site: https://escalajeru.netlify.app

---

## Para todos (líderes e membros)

- **Painel inicial** com saudação, próximo encontro, sua próxima escala e
  confirmações pendentes.
- **Agenda** em calendário mensal com detalhes do encontro (horário, local,
  tipo), exportação `.ics` e link para Google Agenda / Apple Calendar / Outlook.
- **Escalas** com quem serve em cada encontro, por ministério, com
  confirmação de presença (“Confirmar” / “Não poderá”).
- **Chat interno** em tempo real: canal **Geral** + um canal por ministério,
  com histórico, menções de autor e controle de mensagens não lidas.
- **Notificações** dentro do app (sino) para novas escalas e lembretes.
- **Ajustes de conta**: nome, telefone, aniversário, preferências de aviso
  (WhatsApp/SMS), tema claro/escuro/sistema, link individual da agenda e
  instalação do app.
- **Modo escuro/claro** com detecção automática do sistema.

## Para líderes (administradores)

- **Cadastro de pessoas** com nome completo, telefone (obrigatório), e-mail,
  papel (líder ou membro), aniversário e cor de avatar.
- **Senha provisória** gerada automaticamente no cadastro, com envio por
  WhatsApp e obrigatoriedade de troca no primeiro acesso.
- **Reset de senha** de qualquer pessoa com um clique, registrando o histórico.
- **Ministérios**: criar/editar times, definir líder responsável, cor e
  descrição; adicionar/remover membros; promover a líder do ministério.
- **Agenda**: criar, editar e excluir encontros (cultos, ensaios, reuniões,
  eventos, especiais) com data, horário, local e observações.
- **Escalas**: montar equipes por ministério e encontro, com busca de pessoa,
  filtros por período/ministério e visão de conflitos.
- **Substituição de membro** em uma escala, notificando automaticamente o
  novo escalado e registrando o histórico.
- **Notificar escalas** manualmente (botão “Notificar”) ou automaticamente
  (cron a cada hora, para encontros das próximas 24 h).
- **Desativar cadastro** de uma pessoa (remove de escalas futuras e bloqueia
  o acesso, mantendo o histórico).
- **Diretório da igreja** com busca por nome/telefone e visualização de
  contato (telefone visível apenas para a própria pessoa e líderes).

## Regras de negócio garantidas

- **Uma pessoa por ministério, por dia.** O sistema bloqueia automaticamente
  qualquer tentativa de escalar a mesma pessoa em dois ministérios no mesmo
  dia (validado no app e no banco de dados).
- **Só líderes cadastram e escalam.** A permissão é verificada no servidor
  (RLS), não apenas na interface.
- **Telefone obrigatório** no cadastro, normalizado em formato internacional
  (E.164).
- **Primeiro acesso vira administrador.** Os demais entram apenas por
  convite/senha provisória criada pela liderança.
- **Aviso com até 24 horas de antecedência** por WhatsApp, SMS ou dentro do
  app (com fallback automático se o provedor não estiver configurado).

## Segurança

- Autenticação por e-mail e senha (Supabase Auth, senhas com hash bcrypt).
- Permissões controladas no banco (Row Level Security em todas as tabelas).
- Papel (líder/membro) definido pelo servidor, não falsificável pelo cliente.
- View `people_directory` expõe apenas nome, papel e cor — telefone e e-mail
  restritos à liderança.
- Chat com validação de acesso ao canal e limite de 12 mensagens/minuto por
  pessoa (anti-flood).
- Link da agenda individual por token UUID, revogável (gerar novo link).
- Tokens de convite de uso único, com validade de 7 dias.
- HTTPS automático (Netlify) + HSTS, CSP, `X-Frame-Options: DENY`,
  `nosniff` e `Permissions-Policy`.
- Rate limit de autenticação e validação própria nas Edge Functions.

## Tecnologia

- **React 19 + TypeScript + Vite 7** — CSS próprio, sem framework de UI.
- **Supabase** — Auth, Postgres com RLS, Realtime e Edge Functions (Deno).
- **Netlify** — build, CDN, HTTPS automático e cabeçalhos de segurança.
- **PWA** — instalável, cache offline do app shell, atualização automática.
- **GitHub Actions** — typecheck + build a cada push.

---

Feito para servir melhor. **Soli Deo Gloria.**
