# Lockeris

**Plataforma Integrada de Alocação e Armários**

O Lockeris é uma aplicação interna para acompanhar armários, ocupantes e alocações por filial. A interface e a API estão em português brasileiro. A instalação usa PostgreSQL, Fastify e React.

## Identidade visual

A marca usa um símbolo 2D de duas portas de armário, aplicado ao ícone PWA, à navegação e ao acesso. O design system combina **roxo violeta** (`#7C3AED`) e roxo profundo (`#2E1065`) com **verde menta** (`#34D399` e `#10B981`). Pendências usam amarelo (`#FBBF24` e `#F59E0B`); ocupações e alertas críticos usam rosa (`#F43F5E` e `#E11D48`). No tema claro, a aplicação usa fundo `#FAFAFA`, cartões `#FFFFFF` e bordas `#E4E4E7`. No tema escuro, usa fundo `#18181B`, cartões `#27272A` e bordas `#3F3F46`. Os tokens ficam em `apps/web/src/design-system.css` e `apps/web/src/theme.css`.

## Arquitetura do monorepo

O projeto é um monorepo com workspaces npm (`apps/*` e `packages/*`):

| Pasta | Pacote | Descrição |
| --- | --- | --- |
| `apps/api` | `@armarios/api` | API Fastify: autenticação por cookie, operações com idempotência (`operationId`), importação de planilhas, pendências, OpenAPI em `/api/docs` e as migrations SQL em `apps/api/migrations`. |
| `apps/web` | `@armarios/web` | SPA React + Vite: telas de operação e design system em CSS (`design-system.css`, `operational-design.css`, `locker-status.css`, `select.css`, `theme.css`). |
| `packages/contracts` | `@armarios/contracts` | Contratos e utilitários compartilhados entre API e web (esquemas, identificadores e formas de dados). |

A build de produção compila os três pacotes na ordem contracts → api → web (`npm run build`). A checagem de tipos roda com `tsc -b` na raiz e cobre todos os pacotes.

## Como os dados entram

1. **Colaboradores:** o administrador envia uma planilha XLSX com **matrícula, nome, setor e cargo ou função**. Cada matrícula identifica uma única pessoa. A prévia mostra inclusões, alterações e ausências antes da confirmação. A nova planilha passa a ser a lista de colaboradores ativos. Matrículas repetidas ou linhas incompletas são recusadas.
2. **Armários:** uma planilha XLSX com **uma única aba** faz a carga inicial. O cabeçalho fica na primeira linha, com `N°` (ou `NÚMERO`/`ARMÁRIO`), `NOME`, `MATRÍCULA`, `SETOR`, `FUNÇÃO` (ou `CARGO`) e `STATUS` (`OCUPADO` ou `DISPONÍVEL`). A coluna `DUPLO` aceita `verdadeiro`/`falso`, `true`/`false` ou `sim`/`não`. O número repetido em duas linhas ocupadas representa um único armário duplo com duas pessoas; números repetidos em outras condições são recusados. Um armário duplo pode ter só uma pessoa ou estar vazio. A classificação física é definida na carga inicial e só pode ser alterada em Administração. Se não houver nome nem matrícula, o valor de `SETOR` identifica o setor ocupante, como `Jerinana` ou `Restaurante FC`. Ocupantes sem matrícula e armários marcados como ocupados sem identificação ficam pendentes de conferência, sem associação automática pelo nome à base mensal de colaboradores.
3. **Uso diário:** encontre o colaborador pela matrícula para ver seus dados e atribuir ou transferir um armário. No painel, os armários aparecem em ordem numérica; clique em um deles para abrir o cadastro na mesma tela e pesquise qualquer pessoa ativa por nome ou matrícula. O número do armário é fixo depois do cadastro. Todo armário começa marcado como **com cópia da chave**; altere para **não** ao identificar uma exceção. O administrador pode editar situação, cópia da chave, setor ocupante e ocupantes no próprio card; o tipo (padrão ou duplo) aparece como leitura e é alterado apenas em Administração. A matrícula aceita digitação ou escolha no autocompletar da base ativa; se encontrada, nome, setor e função oficiais são usados. O setor ocupante só pode ser escolhido entre os setores oficiais da filial (departamentos ativos e setores já registrados). Em armários duplos é possível cadastrar o segundo ocupante no mesmo formulário. Uma transferência exige motivo e aparece no histórico de trocas para operadores. Os filtros mostram com vaga, livres, ocupados, pendentes, duplos e setores. O registro técnico de eventos e a importação ficam restritos aos administradores.

A carga de armários acontece uma vez por filial; depois, armários individuais podem ser cadastrados em Administração.

Quando uma matrícula sai da nova planilha, seu cadastro deixa de aparecer na base ativa. Se ainda houver uma ocupação, o armário continua ocupado e surge uma pendência para conferir a devolução. O histórico não é apagado. Na tela Pessoas, o administrador também pode selecionar colaboradores específicos ou limpar toda a base ativa. Armários de setores contam como ocupados e não aceitam atribuição a pessoas enquanto o setor estiver registrado.

Matrículas numéricas são comparadas sem espaços, pontos, barras ou hífens, preservando zeros à esquerda. Se a matrícula da planilha de armários existir na base de colaboradores, o sistema usa automaticamente o nome, setor e função oficiais, mesmo que o nome na carga inicial esteja vazio ou diferente. A tela Pendências separa armários e pessoas em abas; armários ficam em ordem numérica e pessoas em ordem alfabética. Cada registro abre uma conferência com os dados atuais e as linhas originais da planilha, quando houver. Em **Resolvidas**, cada registro mostra o motivo original e o que encerrou a pendência; uma pessoa que recebeu armário continua na aba Pessoas do histórico.

## Dashboard: centro de comando operacional

A tela **Dashboard** (`apps/web/src/pages/Overview.tsx`) é o centro de comando de prevenção de perdas e gestão de armários da filial. Os cálculos ficam em `apps/web/src/locker-insights.ts` (testes em `locker-insights.test.ts`) e a tela abre com quatro cards de KPI:

1. **Capacidade e ocupação real** — percentual de ocupação total com barra de progresso, posições ocupadas / posições totais e **vagas livres imediatas**; o card inteiro abre a lista de armários com vaga.
2. **Nível de alerta e pendências críticas** — total de pendências abertas com *badge* de severidade (verde para 0, âmbar para 1–10 e vermelho acima de 10), pessoas fora da base ativa que ainda têm armário, armários sem setor ou matrícula e o botão **Resolver Pendências**, que leva à tela de Pendências. O bloco *Com pendência* abre a lista de armários já filtrada.
3. **Eficiência dos armários duplos** — taxa de utilização das vagas duplas preenchidas, com pílulas de `Total de Duplos`, `100% Ocupados`, `Subutilizados (1/2)` e `Livres (0/2)` e atalho para a lista de duplos. **Regra especial de setor:** os armários duplos de **TRANSPORTE PESADO**, **CONSERVAÇÃO E MANUTENÇÃO** e das variações Conservação/Limpeza/Manutenção, quando têm **um único ocupante**, valem como `100% Ocupados` (armário duplo individual para EPIs e equipamentos), deixam de oferecer vagas e **não** entram em `Subutilizados` — apenas os duplos de setores comuns com uma única pessoa seguem pontuando como subutilizados.
4. **Controle de Chaves** — a métrica principal é o número de **armários sem cópia da chave cadastrada**, com link direto para a lista já filtrada por *Sem cópia*. Os blocos internos separam armários sem cópia, com cópia e com a cópia não informada. Os contadores de “Em Manutenção” e “Bloqueados” foram removidos do card, porque não existem na operação real.

No tema claro o card hero de **Capacidade e ocupação** mantém o gradiente escuro e o texto branco no `:hover` (as regras genéricas de `button:hover` são vencidas em `operational-design.css`/`theme.css`), garantindo contraste legível em vez de texto branco sobre fundo claro.

Abaixo dos KPIs o painel abre dois widgets de análise e dois de operação:

- **Ranking de ocupação por setor** — posições ocupadas por setor, ordenadas das mais demandantes às menos. A lista fica em um container com rolagem própria (`.insight-scroll`, `max-height` de 380px, `overflow-y:auto` e barra estilizada nos dois temas), para que setores extensos não estiquem a altura da página. A categoria **Sem setor** aparece como anomalia (barra avermelhada, ícone de aviso e chamada de conferência) para chamar a atenção da operação.
- **Pessoas por vínculo** — conta pessoas com categoria `Colaborador FC`, `Promotor Fixo`, `Terceirizado` ou `Vínculo não identificado`. Posições atribuídas diretamente a setores são exibidas separadamente. Pendências cadastrais vêm dos itens abertos em `pending_items`; registros rotativos encerrados continuam legíveis no histórico.
- **Movimentações e atividade** — contagem de atribuições, desocupações e trocas do período (7 ou 30 dias), derivada das alocações e transferências registradas.
- **Ações rápidas** — grade com `+ Atribuir / Desocupar Armário`, `Importar Planilha de Colaboradores`, `Ver Pendências Abertas` e `Consultar Histórico` (importação e histórico apenas para perfis administrativos).

Cards, blocos e barras navegam para a lista de armários já filtrada. A tela respeita o tema claro/escuro e é responsiva — em telas estreitas os KPIs e os widgets viram uma única coluna.

## Tela de armários e drawer de detalhes

A tela **Armários** mostra os registros em cards ou tabela. A visualização em cards usa a caixa `#f1f5f9` como segunda camada de fundo e cartões brancos com borda `#e2e8f0`, raio de 16px e elevação no hover. Cada cartão traz:

- barra de acento lateral esquerda com a cor do status (vermelho ocupado, verde livre, âmbar pendente, cinza indisponível) e um brilho suave no fundo na mesma tonalidade;
- o número em destaque (`№ 12`, 27px/800) no canto superior esquerdo e o *badge* de status em pílula com ponto colorido no canto direito;
- a linha de setor com ícone, os ocupantes com nome em destaque e a matrícula precedida de `#`, ou a mensagem `Sem ocupante`;
- o rodapé com a situação (`Ocupado`, `Livre · 1 vaga disponível`) e os *chips* de duplo, pendência e ausência de cópia da chave.

Cartões **livres** são intencionalmente minimalistas: apenas o número, o *badge* `Livre` (e `Duplo`, quando couber) e a área visual limpa — sem setor, ocupante, rodapé ou aviso de chave.

Os filtros ficam unificados em um único painel branco com borda e raio de 14px: busca com ícone de lupa embutido e os três seletores (**Situação**, **Setor** e **Filtrar por cópia da chave**), todos com altura de 44px e anel de foco na cor da marca. Os seletores usam o componente próprio `Select`/`SelectField` (`apps/web/src/components/Select.tsx` + `select.css`): um botão com `role="combobox"` e menu `role="listbox"` posicionado por script, com teclado (setas, Enter, Esc), tema claro/escuro e opções fixas em `<ul>`. Os atalhos rápidos aparecem logo abaixo em um grupo de *chips* segmentados (container em pílula com os quatro atalhos), destacados com a cor da marca quando ativos:

- **Com vaga** — apenas armários com pelo menos uma vaga livre;
- **Livres** — sem ocupação e com vaga disponível;
- **Pendentes** — com pendência aberta ou conferência de migração inconclusiva;
- **Duplos** — apenas os classificados como duplos em Administração.

Os filtros ativos aparecem como etiquetas removíveis e podem ser limpos de uma vez com **Limpar filtros**.

Clicar em um armário abre o **drawer de detalhes e edição** (`apps/web/src/pages/Dashboard.tsx`), organizado assim:

1. **Cabeçalho fixo** — o número do armário é permanente e não é editável: aparece como título `Armário Nº X` com o *badge* da filial, o indicador de duplo e a linha `Ocupado / Sem ocupante · situação`. O cabeçalho fica fixo no topo do drawer durante a rolagem.
2. **Cartão Status do armário** — estado atual (Livre, Ocupado, Pendente, Indisponível), destaque das vagas disponíveis (`0 vagas` / `1 vaga disponível`), situação (Disponível, Manutenção, Bloqueado), capacidade operacional, posições ocupadas, cópia da chave e avisos de conferência ou de setor ocupante.
3. **Cartão Ocupantes** — cada pessoa com nome, matrícula, setor e função, mais os botões secundários **Imprimir Termo**, **Editar** e **Desocupar armário** (antes chamado de *Registrar saída*).
4. **Cartão Edição e configurações** (administração) — controles refinados:
   - **Tipo de armário** em leitura (`Padrão` ou `Duplo`) com aviso de que a troca é feita em Administração;
   - **Toggle switch** apenas para *Existe cópia da chave?*;
   - **Botões segmentados** para a situação: `Disponível | Manutenção | Bloqueado`;
   - **Setor ocupante** escolhido em lista derivada dos setores oficiais da filial (`apps/web/src/sectors.ts`);
   - cadastro ou correção de ocupantes com matrícula oficial da base ativa.
5. **Cartão Cadastrar pessoa neste armário** — pesquisa por nome ou matrícula, atribuição, transferência com motivo e compartilhamento com previsão de encerramento.

O drawer respeita o tema escuro/claro, é responsivo (vira painel de largura total no celular), mantém foco preso no diálogo (Esc fecha) e bloqueia a rolagem da página enquanto está aberto.

## Recursos do front-end

- **Controles próprios em vez de `<select>` e `<datalist>` nativos:** os filtros e os campos de setor usam `Select`/`SelectField` (`apps/web/src/components/Select.tsx`, estilos em `select.css`), e a matrícula usa o autocompletar `RegistrationInput` (`apps/web/src/RegistrationInput.tsx`) com realce do trecho digitado. A lista de setores oficiais vem de `apps/web/src/sectors.ts` (departamentos de pessoas ativas, setores já registrados em armários e o valor atual). Os selects de ação e de formulário (situação por linha, perfil, modalidade, categoria do cadastro, prévia de importação) continuam nativos, mantendo `required` e a validação do navegador.
- **Armário duplo só em Administração:** o atributo `is_double` é criado na carga inicial ou na tela Administração; nos cards de leitura e nos drawers operacionais ele aparece como *badge* e como campo fixo, sem controle editável.
- **Limpeza do antigo modo offline:** na inicialização, o navegador remove as chaves `device` e `copy` do IndexedDB e desregistra o antigo service worker, sem alterar as preferências do usuário.
- **Dark mode:** o atributo `data-theme="dark"` em `<html>` troca as variáveis do `theme.css`; o controle fica no canto da tela de acesso e no topo do painel.
- **Impressão de termos em CSS:** o Termo de Responsabilidade (`apps/web/src/components/TermoResponsabilidade.tsx`) é renderizado junto ao drawer e impresso só com CSS (`termo-print.css`), sem PDF nem dependência externa — a página esconde a interface, força fundo branco e sai do modo escuro durante a impressão.

## Migrations do banco

As migrations ficam em `apps/api/migrations/*.sql` e são aplicadas por `npm run db:migrate`. O executor:

- trava a execução com `pg_advisory_lock` para não rodar em paralelo;
- cria a tabela `schema_migrations` e grava cada arquivo aplicado;
- executa cada SQL em uma transação e é **idempotente** — já aplicados são ignorados;
- roda automaticamente quando o container `api` sobe (`docker compose up -d --build`).

Para aplicar manualmente em um banco específico:

```powershell
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios'
npm run db:migrate
```

## Iniciar com Docker Compose

Requer Docker Desktop em execução. Na raiz do projeto, crie `.env` a partir de `.env.example`. Defina uma senha forte em `POSTGRES_PASSWORD`. Para testar em HTTP, use `COOKIE_SECURE=false`.

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Abra [http://localhost:8080](http://localhost:8080). A saúde da API fica em `/api/health` e a documentação OpenAPI em `/api/docs`. O banco e a porta direta da API escutam apenas em `127.0.0.1`.

Em um banco novo, crie o primeiro administrador uma vez. A senha temporária deve ter pelo menos 12 caracteres e será trocada no primeiro acesso:

```powershell
$bootstrapUsername = Read-Host 'Nome de usuário do administrador'
$bootstrapPassword = Read-Host 'Senha temporária (12+ caracteres)' -AsSecureString
$bootstrapPlain = [System.Net.NetworkCredential]::new('', $bootstrapPassword).Password
docker compose exec -e "BOOTSTRAP_USERNAME=$bootstrapUsername" -e "BOOTSTRAP_PASSWORD=$bootstrapPlain" api npm run db:bootstrap
Remove-Variable bootstrapPlain,bootstrapPassword
```

Se já existe um usuário, o bootstrap não será executado de novo. O comando abaixo cria dados fictícios em uma filial separada e deve ser usado somente quando você quiser essa demonstração:

```powershell
docker compose exec -e DEMO_SEED=true api npm run db:seed
```

Se você não sabe a senha de um usuário existente, escolha outra. O comando abaixo encerra as sessões desse usuário e exige a troca da senha temporária no próximo acesso:

```powershell
$resetUsername = Read-Host 'Nome de usuário existente'
$resetPassword = Read-Host 'Nova senha temporária (12+ caracteres)' -AsSecureString
$resetPlain = [System.Net.NetworkCredential]::new('', $resetPassword).Password
docker compose exec -e "RESET_USERNAME=$resetUsername" -e "RESET_PASSWORD=$resetPlain" api npm run db:reset-password
Remove-Variable resetPlain,resetPassword
```

## Desenvolvimento e testes

Com o PostgreSQL do Compose ativo:

```powershell
npm ci
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios'
$env:COOKIE_SECURE = 'false'
npm run db:migrate
npm run dev
```

O Vite abre em `http://localhost:5173` e encaminha `/api` para `localhost:3001`.

```powershell
npm run typecheck
npm run lint
npm run build
```

Os testes de integração e de navegador limpam dados dos **bancos de teste**. Crie e migre esses bancos isolados antes de executar:

```powershell
docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_test;'
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios_test'
npm run db:migrate
npm run test

docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_e2e;'
$env:DATABASE_URL = 'postgres://armarios:<senha-configurada>@localhost:5432/armarios_e2e'
npm run db:migrate
$env:E2E_DATABASE_URL = $env:DATABASE_URL
npm run test:e2e
```

O teste de navegador usa Chrome por padrão. Para Edge, defina `$env:E2E_BROWSER_CHANNEL = 'msedge'`. As capturas ficam em `test-results/visual/`.

## Backup

O serviço `backup` salva dumps PostgreSQL em `backups/` a cada 24 horas e mantém os últimos 30 dias. Copie os dumps para armazenamento protegido fora da máquina.

```powershell
docker compose logs backup
$backup = Get-ChildItem .\backups -Filter *.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1
.\scripts\restore-test.ps1 -BackupFile $backup.FullName -DatabaseName armarios_restore_test
```

O teste de restauração usa outro banco. Não restaure por cima dos dados operacionais sem uma cópia e validação separadas.
