# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Corrigido
- Termo de Responsabilidade não imprime mais com imagem quebrada: usa o componente `PrintLogo` (logo customizado local → placeholder → texto) e o nome da empresa sai de `VITE_COMPANY_NAME` (padrão `Ferreira Costa`).

### Adicionado
- `.env.portable.example` versionado no repositório.
- `CHANGELOG.md`.

### Removido
- Tabela `authorized_devices` e header `x-device-secret` (código morto desde a remoção do modo offline legado).
- Arquivo órfão `preview_012_reclassification.sql` movido para `docs/archive/`.

### Segurança
- Rate limit do login por IP além de por usuário; falhas de login registradas no log.
- Bypass de troca de senha obrigatória por sufixo de URL corrigido (rotas exatas).

## [1.0.0] — 2026-09

Lançamento inicial operacional da plataforma: armários, colaboradores, pendências, achados e perdidos, auditorias com relatório para gestão, importações TI e carga inicial por planilha, dashboard com KPIs, histórico com exportação CSV, administração de filiais e acessos, troca de senha, tema claro/escuro, build portátil para Windows, backup automatizado via Docker e testes de integração + E2E.
