# Lockeris

[![CI](https://github.com/elton-marques/Lockeris/actions/workflows/ci.yml/badge.svg)](https://github.com/elton-marques/Lockeris/actions/workflows/ci.yml)

**Gestão integrada e controle de armários para Prevenção de Perdas.**

O Lockeris centraliza a gestão de armários, ocupantes e alocações por filial. Desenvolvido para a operação de Prevenção de Perdas, reúne controle de chaves, importação de planilhas, conferência de pendências, auditorias e histórico de movimentações em uma aplicação interna.

A interface e a API estão em português brasileiro. A aplicação utiliza **React, Fastify e PostgreSQL**, com instalação via **Docker Compose**.

## Sumário

- [Recursos](#recursos)
- [Fluxo de operação](#fluxo-de-operação)
- [Importação de planilhas](#importação-de-planilhas)
- [Regras de ocupação](#regras-de-ocupação)
- [Auditorias e achados e perdidos](#auditorias-e-achados-e-perdidos)
- [Administração e acessos](#administração-e-acessos)
- [Histórico e rastreabilidade](#histórico-e-rastreabilidade)
- [Instalação](#instalação)
- [Desenvolvimento](#desenvolvimento)
- [Testes](#testes)
- [Banco de dados e backup](#banco-de-dados-e-backup)
- [Arquitetura](#arquitetura)
- [Interface e identidade visual](#interface-e-identidade-visual)
- [Autoria](#autoria)

## Recursos

| Área | Funcionalidades |
| --- | --- |
| **Dashboard** | Ocupação total, pessoas sem armário, pendências, utilização de duplos, controle de chaves e movimentações dos últimos 7 ou 30 dias. |
| **Armários** | Consulta em cards ou tabela, filtros combinados e painel lateral de detalhes. |
| **Colaboradores** | Busca por matrícula, cadastro, atribuição e transferência de armários, reativação e seleção em lote. |
| **Pendências** | Conferência de pessoas e armários, acesso às linhas originais da importação e histórico de resoluções. |
| **Transferências** | Consulta de ocupações ativas e encerradas, além das trocas de armário com origem, destino e motivo. |
| **Auditorias** | Inspeções por armário, registro de irregularidades e relatório de gestão para impressão em A4. |
| **Achados e Perdidos** | Registro de itens, acompanhamento do prazo de custódia, devolução e destinação. |
| **Administração** | Gestão de filiais, acessos, armários, classificação de duplos e higienização de cadastros. |
| **Histórico** | Trilha de eventos com contexto da operação e exportação em CSV. |

O cabeçalho reúne o seletor de filial, o menu da conta e a **Central de Alertas**, atualizada a cada minuto. Os alertas apontam colaboradores sem armário, pendências cadastrais e armários duplos subutilizados, com atalhos para as respectivas listas filtradas.

## Fluxo de operação

1. **Prepare a filial:** cadastre a filial e configure os acessos em Administração.
2. **Importe os colaboradores:** envie a planilha e confira a prévia de inclusões, alterações e ausências.
3. **Faça a carga inicial dos armários:** importe a planilha de armários uma vez por filial.
4. **Confira as pendências:** resolva ocupações sem identificação e divergências cadastrais.
5. **Opere pela tela Colaboradores:** abra os detalhes da pessoa para atribuir ou transferir um armário.
6. **Acompanhe a operação:** consulte o Dashboard, a Central de Alertas, as auditorias e o histórico.

### Atribuição, transferência e desocupação

A atribuição e a transferência ficam no bloco **Atribuir ou transferir armário**, dentro do diálogo de detalhes da pessoa na tela **Colaboradores**. A transferência exige motivo e fica registrada no histórico de trocas.

Na tela **Armários**, clicar em um registro abre o painel lateral com situação, capacidade, vagas, cópia da chave e ocupantes. Nesse painel é possível consultar os vínculos, imprimir o Termo de Responsabilidade e **Desocupar armário**. A administração também pode corrigir dados do armário e dos ocupantes.

**Excluir cadastro** remove a pessoa da base ativa. **Desocupar armário** encerra a ocupação. Essas ações têm finalidades distintas e não devem ser usadas como substitutas uma da outra.

## Importação de planilhas

### Colaboradores

A planilha XLSX deve conter **matrícula, nome, setor e cargo ou função**.

- Cada matrícula identifica uma única pessoa.
- Matrículas repetidas e linhas incompletas são recusadas.
- A prévia mostra inclusões, alterações e ausências antes da confirmação.
- A planilha confirmada passa a representar a base de colaboradores ativos.

Quando uma matrícula deixa de aparecer na nova planilha, o cadastro sai da base ativa. Se a pessoa ainda tiver uma ocupação, o armário permanece ocupado e é criada uma pendência para conferir a devolução. O histórico é preservado.

### Carga inicial de armários

A planilha XLSX deve ter **uma única aba**, com o cabeçalho na primeira linha.

| Coluna | Conteúdo |
| --- | --- |
| `N°` | Número do armário. Também aceita `NÚMERO` ou `ARMÁRIO`. |
| `NOME` | Nome do ocupante, quando houver. |
| `MATRÍCULA` | Matrícula do ocupante, quando houver. |
| `SETOR` | Setor da pessoa ou setor ocupante, conforme a identificação da linha. |
| `FUNÇÃO` | Função do ocupante. Também aceita `CARGO`. |
| `STATUS` | `OCUPADO` ou `DISPONÍVEL`. |
| `DUPLO` | Quando utilizada, aceita `verdadeiro`/`falso`, `true`/`false` ou `sim`/`não`. |

Regras da carga inicial:

- Duas linhas ocupadas com o mesmo número representam **um único armário duplo com duas pessoas**. Repetições em outras condições são recusadas.
- Um armário duplo também pode estar vazio ou ter apenas uma pessoa.
- Sem nome e matrícula, o valor de `SETOR` identifica uma ocupação direta por setor.
- Ocupantes sem matrícula e armários ocupados sem identificação ficam pendentes de conferência.
- O sistema não associa automaticamente uma pessoa à base de colaboradores apenas pela semelhança do nome.
- Se a matrícula existir na base ativa, são usados o nome, o setor e a função oficiais, mesmo que o nome na planilha de armários esteja vazio ou diferente.

Matrículas numéricas são comparadas sem espaços, pontos, barras ou hífens, **preservando zeros à esquerda**.

A carga inicial acontece uma vez por filial. Depois dela, novos armários podem ser cadastrados individualmente em **Administração**.

## Regras de ocupação

| Regra | Comportamento |
| --- | --- |
| **Número permanente** | O número do armário não pode ser alterado depois do cadastro. |
| **Tipo físico** | Padrão ou duplo, definido na carga inicial e alterado somente em Administração. |
| **Situação** | `Disponível` ou `Ocupado`, determinada pela ocupação. O painel operacional não oferece as opções legadas Manutenção e Bloqueado. |
| **Cópia da chave** | Todo armário começa marcado como tendo cópia. Altere para `Não` ao identificar uma exceção. |
| **Ocupação por setor** | Conta como ocupação e impede a atribuição a pessoas enquanto o setor estiver registrado. |
| **Setores oficiais** | Os campos de setor usam departamentos ativos e setores já registrados na filial. |
| **Dados oficiais** | A matrícula encontrada na base ativa fornece nome, setor e função oficiais. |

### Armários duplos de uso individual

Armários duplos de **Transporte Pesado**, **Conservação e Manutenção** e das variações de **Conservação, Limpeza e Manutenção** são considerados totalmente ocupados quando têm uma única pessoa, por serem utilizados para EPIs e equipamentos.

Esses armários não oferecem uma segunda vaga e não entram na contagem de duplos parcialmente ocupados.

### Indicadores do Dashboard

- **Ocupação Total:** posições ocupadas divididas pela capacidade efetiva.
- **Colaboradores sem Armário:** pessoas ativas da filial sem ocupação vigente.
- **Pendências Críticas:** total de pendências abertas, com destaque por quantidade: zero, de 1 a 10 e acima de 10.
- **Armários Duplos:** utilização das vagas duplas e quantidade de duplos totalmente ocupados, respeitando as exceções de uso individual.
- **Controle de Chaves:** quantidade de armários sem cópia da chave cadastrada, com as chaves emprestadas em aberto na legenda.

O painel também apresenta o ranking de ocupação por setor, a distribuição de pessoas por vínculo, a **tendência de ocupação das últimas 8 semanas** e as movimentações do período. Os indicadores abrem as telas correspondentes com filtros aplicados.

Os rótulos de vínculo são **Colaborador**, **Promotor(a)**, **Terceirizado** e **Pendência Cadastral**. Jovens aprendizes são classificados como colaboradores. Promotores identificados pelo cadastro ou pelo setor/função entram em Promotor(a); o cargo promotor não é tratado como setor no ranking de ocupação. As palavras-chave dessa classificação são editáveis por filial em **Administração → Regras de vínculo** (sem configuração, vale o padrão do sistema).

### Movimentos de chave e resumo do dia

Cada armário registra **empréstimos de chave**: quem pegou (busca por nome ou matrícula na base ativa), quando e quem registrou; a devolução é anotada no mesmo lugar, com histórico recente no drawer. Um empréstimo aberto há 7 dias ou mais vira alerta na Central. Em **Achados e Perdidos**, itens vencendo em até 5 dias ganham destaque urgente, e o cartão **Resumo do dia** (imprimível) reúne vencidos, vencimentos da semana, chaves emprestadas e pendências abertas por tipo.

A lista de pendências é somente-leitura: a reconciliação acontece nas próprias operações e a cada 15 minutos em segundo plano — pendências que vencem pelo relógio podem levar até 15 minutos para aparecer.

## Auditorias e achados e perdidos

### Auditorias

Para iniciar uma inspeção, selecione um colaborador ativo da **Prevenção de Perdas**, inclusive do setor **PP**. A auditoria é identificada pela data e hora e permite registrar irregularidades por armário.

Cada ocorrência preserva os dados dos ocupantes no momento do registro: nome completo, matrícula e setor. Quando não há ocupação, o registro indica **Armário desocupado**.

Ao concluir, **Gerar Relatório para Gestão** apresenta o responsável, a data, o índice de conformidade e as ocorrências com providências recomendadas, em formato de impressão A4. O índice utiliza a quantidade de armários registrada no início da inspeção.

A administração pode excluir auditorias mediante confirmação.

### Achados e Perdidos

Itens podem ser registrados ao desocupar um armário, marcando **Pertences deixados no armário?**, ou diretamente pelo botão **+ Registrar Item**.

O formulário reúne categoria, data e hora do achado, responsável, local onde o item foi encontrado e descrição. O local de guarda não é obrigatório.

- Categorias: roupa, calçado, celular, relógio, óculos e outro, com nome personalizado.
- Data e hora: `DD/MM/AAAA HH:mm`, sem segundos.
- Prazo de custódia: **30 dias a partir da data e hora do achado**.
- Acompanhamento por categoria, situação e busca, com registro de devolução ou destinação após o prazo.

## Administração e acessos

As ações administrativas respeitam o perfil do usuário e a filial selecionada. Importações e o registro técnico de eventos ficam restritos aos administradores.

### Filiais

A **Administração geral** pode criar e excluir filiais. O cadastro exige apenas o nome; não há campo de cidade nem ação de arquivamento.

> **Exclusão permanente:** excluir uma filial remove seus armários, vínculos, usuários e históricos associados. A ação exige confirmação e é executada em uma única transação. Ao excluir a filial em uso, a aplicação seleciona a primeira filial restante, quando houver.

### Usuários e senhas

A seção **Acessos** permite ativar ou desativar usuários, redefinir senhas e excluir acessos.

- A exclusão exige confirmação, encerra as sessões do usuário e registra o evento na trilha de auditoria.
- A própria conta ativa não pode ser excluída.
- As ações respeitam as permissões administrativas e o escopo da filial.
- A troca da própria senha fica no menu da conta, no cabeçalho.
- A nova senha deve ter **pelo menos 12 caracteres** e ser diferente da atual.
- Ao alterar a própria senha, as demais sessões são encerradas; a sessão em uso é mantida.
- Senhas temporárias exigem troca no primeiro acesso.

A autenticação usa sessão por cookie e verificação de senha com **Argon2**.

### Higienização de base

A seção **Higienização de base** lista cadastros ativos sem armário e sem movimentação na janela escolhida: de **30 a 3650 dias**, com padrão de **90 dias** e até **500 registros** por consulta.

A exclusão pode ser individual ou em lote, exige confirmação e gera um evento no histórico. Vínculos com ocupação aberta são recusados; a operação usa a mesma trava transacional da atribuição para evitar conflitos.

## Histórico e rastreabilidade

A trilha de auditoria registra o contexto da operação: número do armário, nome e matrícula da pessoa, setor ocupante, descrição e detalhes da alteração, quando aplicáveis.

O histórico permite consultar eventos e exportar os detalhes em CSV. Registros anteriores à inclusão das colunas de contexto continuam legíveis pelo resumo disponível.

### Limpeza de históricos

**Limpar históricos antigos** exige perfil administrativo e confirmação. A operação remove os eventos da filial que atendam a **pelo menos um** destes critérios:

- Sem número do armário, nome da pessoa, setor e descrição, considerados legados ou incompletos.
- Anteriores a **365 dias**.
- Eventos de importação ou migração identificados por `entity_type='import'`.

> A limpeza também alcança eventos operacionais com mais de 365 dias e eventos de importação, independentemente da idade. Exporte os registros que precisar conservar antes de confirmar.

A própria limpeza gera o evento `historico_limpo`, com a quantidade removida. Ocupações, transferências e cadastros não são apagados por essa ação de limpeza de eventos.

## Instalação

### Pré-requisitos

- Docker Desktop em execução, com suporte a Docker Compose.
- PowerShell para executar os exemplos abaixo.
- Uma senha forte para o PostgreSQL.

Execute os comandos na raiz do projeto.

### 1. Configure o ambiente

```powershell
Copy-Item .env.example .env
```

Edite `.env` e defina `POSTGRES_PASSWORD`. Para testes locais em HTTP, use `COOKIE_SECURE=false` — em produção, sirva por HTTPS (proxy com TLS) e defina `COOKIE_SECURE=true`; a API registra um aviso no log quando o cookie roda sem o flag `Secure`. O login é limitado por usuário e por IP (5 e 30 tentativas por 15 minutos por padrão; ajuste com `AUTH_LOGIN_MAX_USER`, `AUTH_LOGIN_MAX_IP` e `AUTH_LOGIN_RATE_MINUTES`), e a identidade impressa no Termo de Responsabilidade sai de `VITE_COMPANY_NAME` e `VITE_COMPANY_LOGO_URL` no build do web.

```powershell
Copy-Item .env.example .env
```

Edite `.env` e defina `POSTGRES_PASSWORD`. Para testes locais em HTTP, use `COOKIE_SECURE=false`.

### 2. Inicie os serviços

```powershell
docker compose up -d --build
```

As migrations são aplicadas automaticamente quando o container da API inicia.

| Serviço | Endereço |
| --- | --- |
| Aplicação | [http://localhost:8080](http://localhost:8080) |
| Saúde da API | [http://localhost:8080/api/health](http://localhost:8080/api/health) |
| Documentação OpenAPI | [http://localhost:8080/api/docs](http://localhost:8080/api/docs) |

As portas diretas do banco e da API escutam apenas em `127.0.0.1`.

### 3. Crie o primeiro administrador

Em um banco novo, execute o bootstrap uma única vez. A senha temporária deve ter pelo menos 12 caracteres e será trocada no primeiro acesso.

```powershell
$bootstrapUsername = Read-Host 'Nome de usuário do administrador'
$bootstrapPassword = Read-Host 'Senha temporária (12+ caracteres)' -AsSecureString
$bootstrapPlain = [System.Net.NetworkCredential]::new('', $bootstrapPassword).Password
docker compose exec -e "BOOTSTRAP_USERNAME=$bootstrapUsername" -e "BOOTSTRAP_PASSWORD=$bootstrapPlain" api npm run db:bootstrap
Remove-Variable bootstrapPlain,bootstrapPassword
```

Se já houver um usuário, o bootstrap não será executado novamente.

### Dados de demonstração, opcionais

O comando abaixo cria dados fictícios em uma filial separada. Execute apenas se quiser carregar a demonstração.

```powershell
docker compose exec -e DEMO_SEED=true api npm run db:seed
```

### Redefinição de senha pelo terminal

Para recuperar o acesso de um usuário existente:

```powershell
$resetUsername = Read-Host 'Nome de usuário existente'
$resetPassword = Read-Host 'Nova senha temporária (12+ caracteres)' -AsSecureString
$resetPlain = [System.Net.NetworkCredential]::new('', $resetPassword).Password
docker compose exec -e "RESET_USERNAME=$resetUsername" -e "RESET_PASSWORD=$resetPlain" api npm run db:reset-password
Remove-Variable resetPlain,resetPassword
```

A redefinição encerra as sessões desse usuário e exige a troca da senha temporária no próximo acesso.

## Desenvolvimento

Para desenvolver fora dos containers da aplicação, tenha **Node.js, npm** e o PostgreSQL do Compose disponíveis.

```powershell
npm ci
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios'
$env:COOKIE_SECURE = 'false'
npm run db:migrate
npm run dev
```

Substitua `<senha-configurada>` pela senha definida no ambiente. Se ela contiver caracteres especiais, codifique-os para uso na URL de conexão.

O Vite abre em [http://localhost:5173](http://localhost:5173) e encaminha `/api` para `localhost:3001`.

### Comandos principais

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Iniciar o ambiente de desenvolvimento. |
| `npm run typecheck` | Checar os tipos de todos os pacotes com `tsc -b`. |
| `npm run lint` | Executar a análise estática. |
| `npm run build` | Compilar contracts, API e web, nessa ordem. |
| `npm run db:migrate` | Aplicar as migrations no banco configurado. |
| `npm run test` | Executar os testes do projeto. |
| `npm run test:e2e` | Executar os testes de navegador. |

## Testes

> **Use bancos isolados:** os testes de integração e de navegador limpam dados. Nunca aponte `DATABASE_URL` ou `E2E_DATABASE_URL` para o banco operacional ao executar esses testes.

### Integração

Crie o banco de teste uma vez e aplique as migrations antes da execução:

```powershell
docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_test;'
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios_test'
npm run db:migrate
npm run test
```

### Navegador

```powershell
docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_e2e;'
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios_e2e'
npm run db:migrate
$env:E2E_DATABASE_URL = $env:DATABASE_URL
npm run test:e2e
```

Com cobertura de testes, use `npm run test:coverage` (relatório em `coverage/`).

A navegação da SPA sincroniza as abas com a URL por hash (`/#/pessoas`, `/#/pendencias`…): deep-link e recarga mantêm a tela atual, rotas desconhecidas abrem a página **Página não encontrada** e abas administrativas redirecionam perfis sem permissão ao painel.

O teste de navegador usa o Chromium empacotado do Playwright por padrão. Para usar o Chrome ou o Edge do sistema, configure antes de executar:

```powershell
$env:E2E_BROWSER_CHANNEL = 'msedge'
```

As capturas ficam em `test-results/visual/`. Os cenários de navegador estão em [`e2e/flows.spec.ts`](e2e/flows.spec.ts), incluindo seleção em lote e alinhamento da tabela de colaboradores.

Após os testes, restaure `DATABASE_URL` para o banco de desenvolvimento antes de executar `npm run dev`.

## Banco de dados e backup

### Migrations

As migrations ficam em [`apps/api/migrations`](apps/api/migrations) e podem ser aplicadas manualmente:

```powershell
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios'
npm run db:migrate
```

O executor usa `pg_advisory_lock` para impedir execuções simultâneas, registra os arquivos aplicados em `schema_migrations` e executa cada migration em uma transação. Arquivos já aplicados são ignorados.

### Backup e validação de restauração

O serviço `backup` gera dumps do PostgreSQL em `backups/` a cada **24 horas**, com retenção de **30 dias**. Mantenha também uma cópia em armazenamento protegido fora da máquina.

Para consultar o serviço e testar a restauração do dump mais recente:

```powershell
docker compose logs backup
$backup = Get-ChildItem .\backups -Filter *.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1
.\scripts\restore-test.ps1 -BackupFile $backup.FullName -DatabaseName armarios_restore_test
```

O teste utiliza outro banco. Antes de restaurar dados operacionais, preserve uma cópia e valide o backup separadamente.

## Arquitetura

O projeto é um **monorepo com workspaces npm**, organizados em `apps/*` e `packages/*`.

| Diretório | Pacote | Responsabilidade |
| --- | --- | --- |
| [`apps/api`](apps/api) | `@armarios/api` | API Fastify, autenticação por cookie, operações com idempotência, importações, pendências, OpenAPI e acesso ao PostgreSQL. |
| [`apps/web`](apps/web) | `@armarios/web` | SPA React com Vite, telas operacionais e design system em CSS. |
| [`packages/contracts`](packages/contracts) | `@armarios/contracts` | Esquemas, identificadores, estruturas de dados e utilitários compartilhados entre API e web. |

A build segue a ordem **contracts → api → web**. A checagem de tipos na raiz cobre os três pacotes.

As operações que exigem idempotência utilizam `operationId`. As rotas administrativas validam perfil e escopo da filial; alterações críticas utilizam transações no PostgreSQL.

### Referências no código

| Área | Arquivo ou diretório |
| --- | --- |
| Dashboard | [`apps/web/src/pages/Overview.tsx`](apps/web/src/pages/Overview.tsx) |
| Cálculos dos indicadores | [`apps/web/src/locker-insights.ts`](apps/web/src/locker-insights.ts) |
| Armários e painel lateral | [`apps/web/src/pages/Dashboard.tsx`](apps/web/src/pages/Dashboard.tsx) |
| Colaboradores | [`apps/web/src/pages/People.tsx`](apps/web/src/pages/People.tsx) |
| Administração | [`apps/web/src/pages/Admin.tsx`](apps/web/src/pages/Admin.tsx) |
| Transferências | [`apps/web/src/pages/Transfers.tsx`](apps/web/src/pages/Transfers.tsx) |
| Histórico | [`apps/web/src/pages/History.tsx`](apps/web/src/pages/History.tsx) |
| Alertas da API | [`apps/api/src/notifications.ts`](apps/api/src/notifications.ts) |
| Higienização de base | [`apps/api/src/sanitation.ts`](apps/api/src/sanitation.ts) |
| Registro de eventos | [`apps/api/src/operations.ts`](apps/api/src/operations.ts) |
| Termo de Responsabilidade | [`apps/web/src/components/TermoResponsabilidade.tsx`](apps/web/src/components/TermoResponsabilidade.tsx) |

## Interface e identidade visual

A marca utiliza um símbolo 2D de duas portas de armário, aplicado à navegação, à tela de acesso e ao ícone PWA.

| Uso | Cores |
| --- | --- |
| Marca | Violeta `#7C3AED` e roxo profundo `#2E1065`. |
| Disponibilidade e confirmações | Verde menta `#34D399` e `#10B981`. |
| Pendências e atenção | Âmbar `#FBBF24` e `#F59E0B`. |
| Ocupação e alertas críticos | Rosa `#F43F5E` e `#E11D48`. |
| Tema claro | Fundo `#FAFAFA`, cartões `#FFFFFF` e bordas `#E4E4E7`. |
| Tema escuro | Fundo `#18181B`, cartões `#27272A` e bordas `#3F3F46`. |

Os tokens e estilos principais estão em [`design-system.css`](apps/web/src/design-system.css) e [`theme.css`](apps/web/src/theme.css).

A interface oferece:

- Temas claro e escuro, com controles na tela de acesso e no painel.
- Layout responsivo, com cards e widgets reorganizados em telas estreitas.
- Filtros combinados, etiquetas removíveis e atalhos para vagas, armários livres, pendências e duplos.
- Seletores e autocompletar de matrícula com navegação por teclado.
- Diálogos e painel lateral com foco preso, fechamento por `Esc` e bloqueio da rolagem do fundo.
- Botões para mostrar ou ocultar a senha nos formulários de acesso e alteração.
- Impressão do Termo de Responsabilidade em **uma página A4**, por CSS, sem geração de PDF ou dependência externa.

## Autoria

Idealizado e desenvolvido do zero por **Elton Marques**, para automação, controle de custódia e Prevenção de Perdas.
