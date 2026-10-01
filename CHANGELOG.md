# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.2.0] — 2026-10-01

### Adicionado
- **Controle de chave como movimento:** novo registro de empréstimos por armário (quem pegou, quando devolveu, quem registrou), com bloqueio de chave emprestada duas vezes, histórico no armário, filtro "Chave emprestada" na lista e alerta na Central para empréstimos abertos há 7 dias ou mais.
- **Lembretes de prazo:** faixa urgente a partir de 5 dias em Achados e Perdidos, alerta de custódia vencida/vencendo na Central e **Resumo do dia** imprimível (vencidos, vencimentos da semana, chaves emprestadas, pendências por tipo).
- **Tendência de ocupação:** painel com as últimas 8 semanas de posições ocupadas e capacidade, reconstruído das alocações.
- **Regras de vínculo configuráveis:** as palavras-chave que classificam o painel "Pessoas por vínculo" passam a ser editáveis em Administração por filial (padrão preserva o comportamento anterior).
- Rotas documentadas no OpenAPI; testes de integração e E2E para todos os fluxos.

### Alterado
- A consulta de pendências virou somente-leitura: a reconciliação roda nas operações de escrita e a cada 15 minutos em segundo plano (pendências puramente temporais podem levar até 15 minutos para aparecer).

## [1.1.0] — 2026-10-01

### Corrigido
- Termo de Responsabilidade não imprime mais com imagem quebrada: usa o componente `PrintLogo` (logo customizado local → placeholder → texto) e o nome da empresa sai de `VITE_COMPANY_NAME` (padrão `Ferreira Costa`).
- Sessão expirada devolve ao acesso com aviso claro em vez de acumular falhas genéricas na tela.
- Troca de senha com senha atual inválida não encerra mais a sessão (401 de confirmação não é tratado como expiração).
- O indicador do cabeçalho reflete a conexão real (eventos `online`/`offline` + verificação em `/api/health`).

### Adicionado
- CI no GitHub Actions: lint, typecheck, build, testes de integração e E2E com PostgreSQL de serviço; Dependabot semanal.
- Cobertura de testes (`npm run test:coverage`).
- Navegação por hash (`#/rota`): deep-link, recarga mantém a tela, página **Página não encontrada** para rotas desconhecidas e redirecionamento de abas administrativas para perfis sem permissão.
- Foco preso e restaurado em todos os modais e diálogos globais, com `Escape` nos de aviso/Confirmação.
- Backup automático no modo portátil: `pg_dump` diário, no encerramento e sob demanda (`BACKUP.bat`), com retenção de 30 dias; `PORTABLE_GUIDE.md` documentando restauração.
- Limpeza periódica no servidor: sessões expiradas e operações com mais de 30 dias.
- `/api/health` verifica o banco e responde 503 quando indisponível; healthchecks para `api` e `web` no Compose.
- Log de falhas/sucessos de login e das requisições de escrita; aviso no boot quando o cookie roda sem `Secure`.
- Ícones PNG do PWA (192/512 e maskable) e `apple-touch-icon`, gerados a partir do `icon.svg` por `scripts/generate-icons.mjs`.
- OpenAPI com body schemas para todas as rotas de escrita.
- `.env.portable.example` versionado no repositório.
- `CHANGELOG.md`.

### Alterado
- Testes E2E usam o Chromium empacotado por padrão (`E2E_BROWSER_CHANNEL` vazio; `'chrome'`/`'msedge'` mantêm os navegadores do sistema).

### Removido
- Tabela `authorized_devices` e header `x-device-secret` (código morto desde a remoção do modo offline legado).
- Arquivo órfão `preview_012_reclassification.sql` movido para `docs/archive/`.

### Segurança
- Rate limit do login por IP além de por usuário; falhas de login registradas no log.
- Bypass de troca de senha obrigatória por sufixo de URL corrigido (rotas exatas).
- Índices novos: `import_sources(entity_type, entity_id)`, `sessions(user_id)`, `sessions(expires_at)`, `users(branch_id)`, `memberships(branch_id)`.
- Vulnerabilidades moderadas do `uuid` resolvidas com override `^11.1.1` (`npm audit --omit=dev` limpo); dependências atualizadas dentro da faixa semver.

## [1.0.0] — 2026-09

Lançamento inicial operacional da plataforma: armários, colaboradores, pendências, achados e perdidos, auditorias com relatório para gestão, importações TI e carga inicial por planilha, dashboard com KPIs, histórico com exportação CSV, administração de filiais e acessos, troca de senha, tema claro/escuro, build portátil para Windows, backup automatizado via Docker e testes de integração + E2E.
