# Lockeris

**Plataforma Integrada de Alocação e Armários**

O Lockeris é uma aplicação interna para acompanhar armários, ocupantes e alocações por filial. A interface e a API estão em português brasileiro. A instalação usa PostgreSQL, Fastify e React.

## Identidade visual

A marca usa um símbolo 2D de duas portas de armário, aplicado ao ícone PWA, à navegação e ao acesso. O design system combina **roxo violeta** (`#7C3AED`) e roxo profundo (`#2E1065`) com **verde menta** (`#34D399` e `#10B981`). Pendências usam amarelo (`#FBBF24` e `#F59E0B`); ocupações e alertas críticos usam rosa (`#F43F5E` e `#E11D48`). No tema claro, a aplicação usa fundo `#FAFAFA`, cartões `#FFFFFF` e bordas `#E4E4E7`. No tema escuro, usa fundo `#18181B`, cartões `#27272A` e bordas `#3F3F46`. Os tokens ficam em `apps/web/src/design-system.css` e `apps/web/src/theme.css`.

### Tela de acesso

A tela de acesso tem duas colunas: o bloco de marca à esquerda e o formulário à direita. O bloco de marca traz o ícone Lockeris em **56 × 56 px** (`.auth-intro .brand-icon`) e o nome **LOCKERIS** em caixa alta, negrito (`font-weight: 800`), `font-size: 1.125rem`, `letter-spacing: 0.1em` e cor de contraste elevada (`#6EE7B7`) sobre o gradiente roxo (`.auth-intro .auth-brand`), acima do título *Gestão Integrada e Controle de Armários*. O campo Senha mantém o botão de visibilidade centralizado verticalmente e horizontalmente: o ícone mede **20 × 20 px** dentro de uma caixa de **24 × 20 px** (`.password-toggle-icon`), com `padding: 0 12px` e área de toque de 48 px de largura.

A tela de **troca de senha temporária** espelha essa estrutura: mesmo bloco de marca, mesmo cartão de formulário e container centralizado (`.auth-page--center`), com o botão de visibilidade presente nos dois campos de senha.

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
3. **Uso diário:** encontre o colaborador pela matrícula para ver seus dados e atribuir ou transferir um armário. No painel, os armários aparecem em ordem numérica; clique em um deles para abrir o drawer de detalhes na mesma tela. Atribuição e transferência acontecem na tela **Colaboradores**, dentro do diálogo de detalhes da pessoa, no bloco *Atribuir ou transferir armário*. O número do armário é fixo depois do cadastro. Todo armário começa marcado como **com cópia da chave**; altere para **não** ao identificar uma exceção. O administrador pode editar a cópia da chave e os ocupantes no próprio card; a **situação** aparece apenas como `Disponível` ou `Ocupado`, definida pela ocupação — as opções legadas **Manutenção** e **Bloqueado** saíram do modal —, e o tipo (padrão ou duplo) aparece como leitura e é alterado apenas em Administração. O **setor ocupante** deixou de ser editável no modal e continua restrito aos setores oficiais da filial (departamentos ativos e setores já registrados) em Administração e na conferência de pendências. A matrícula aceita digitação ou escolha no autocompletar da base ativa; se encontrada, nome, setor e função oficiais são usados. Em armários duplos é possível cadastrar o segundo ocupante no mesmo formulário. Uma transferência exige motivo e aparece no histórico de trocas para operadores. Os filtros mostram com vaga, livres, ocupados, pendentes, duplos e setores. O registro técnico de eventos e a importação ficam restritos aos administradores.

A carga de armários acontece uma vez por filial; depois, armários individuais podem ser cadastrados em Administração.

Quando uma matrícula sai da nova planilha, seu cadastro deixa de aparecer na base ativa. Se ainda houver uma ocupação, o armário continua ocupado e surge uma pendência para conferir a devolução. O histórico não é apagado. Na tela Pessoas, o administrador também pode selecionar colaboradores específicos ou excluir toda a base ativa. Armários de setores contam como ocupados e não aceitam atribuição a pessoas enquanto o setor estiver registrado.

Na tela **Colaboradores** (`apps/web/src/pages/People.tsx`), o cartão superior *Ação principal — Atribuir ou transferir armário* foi removido: a página começa direto no cabeçalho e no filtro da base ativa, sem a busca de matrícula duplicada no topo. A coluna **Ações** da tabela ficou apenas com o link discreto **Ver detalhes** (além do clique na própria linha), que abre o diálogo `.locker-modal` de detalhes da pessoa, com foco preso, `Escape` para fechar e rolagem do fundo travada. O diálogo centraliza todas as ações da pessoa: mostra cadastro (setor, função, empresa e necessidade de armário fixo), o armário vinculado, o bloco **Atribuir ou transferir armário** (armário de destino, cópia da chave, motivo da transferência e observação) e os botões **Editar cadastro**, **Excluir/Reativar cadastro** e **Exceção**, que antes se repetiam em cada linha da tabela. Colaboradores e promotores sem armário ganham a *badge* âmbar **Sem armário** (`.status-badge--warning`, com o par de cores no tema escuro em `theme.css`), e o chip rápido **Sem armário** (`.quick-filter` com `aria-pressed`) restringe a lista a quem não tem armário — é o mesmo preset `withoutLocker` aberto pelo card *Colaboradores sem Armário* do Dashboard. Os rótulos de categoria da tela e do card de vínculos agora usam **Colaborador** e **Promotor(a)**, e **Pendência Cadastral** é o rótulo oficial da categoria `vinculo_nao_identificado` em toda a interface — filtro, coluna *Categoria*, formulário de cadastro, card de vínculos e conferência de pendências. A remoção de um cadastro segue sempre a mesma leitura operacional: **Excluir cadastro** (com confirmação explícita de segurança) para quem sai da base ativa e **Desocupar armário** para quem sai do armário, sem vocabulário de recursos humanos.

As linhas da tabela de Colaboradores ficam alinhadas verticalmente em uma única linha: `td` e `th` usam `vertical-align: middle` (`.people-table :is(td, th)` em `design-system.css`), e as células de checkbox, de pessoa e de ações empilham o conteúdo em flex com `display: flex`, `align-items: center`, `align-content: center` e `height: 100%` pela classe `.people-table .people-cell`. O `input type="checkbox"` de cada linha sai com `margin: 0`, `display: block` e `align-self: center`, e o link **Ver detalhes** ficou com `margin: 0`, `line-height: 1` e `display: inline-flex` (`.people-table .table-detail` em `operational-design.css`). A seleção em lote é bidirecional: o clique em uma checkbox marcada remove o ID correspondente do array de selecionados na mesma hora, o seletor **Selecionar colaboradores exibidos** marca todos os colaboradores filtrados quando falta algum e limpa a seleção quando todos já estão marcados, e o botão **Excluir selecionados (N)** reflete a contagem exata de itens marcados e só aparece quando `N > 0`. O fluxo é coberto pelo teste `seleção em lote alterna marcações e alinha verticalmente as células da tabela` em `e2e/flows.spec.ts`.

Matrículas numéricas são comparadas sem espaços, pontos, barras ou hífens, preservando zeros à esquerda. Se a matrícula da planilha de armários existir na base de colaboradores, o sistema usa automaticamente o nome, setor e função oficiais, mesmo que o nome na carga inicial esteja vazio ou diferente. A tela Pendências separa armários e pessoas em abas; armários ficam em ordem numérica e pessoas em ordem alfabética. Cada registro abre uma conferência com os dados atuais e as linhas originais da planilha, quando houver. Em **Resolvidas**, cada registro mostra o motivo original e o que resolveu a pendência; uma pessoa que recebeu armário continua na aba Pessoas do histórico.

## Achados e Perdidos e auditorias

Ao desocupar um armário, marque **Pertences deixados no armário?** e registre categoria, data e hora do achado, responsável, local onde foi encontrado, local de guarda na PP e descrição. A tela **Achados e Perdidos** também permite cadastrar itens encontrados fora dos armários pelo botão **+ Registrar Item**. As categorias são roupa, calçado, celular, relógio, óculos e outro (com nome personalizado). O prazo de custódia de 30 dias é calculado a partir da data e hora do achado. Use os filtros de categoria, situação e busca para acompanhar vencimentos; registre devolução ao proprietário ou destinação após o prazo.

Em **Auditorias**, selecione um colaborador ativo da Prevenção de Perdas (inclusive setor PP) para iniciar a inspeção, identificada automaticamente pela data e hora. Registre irregularidades por armário; cada ocorrência preserva os dados dos ocupantes (nome completo, matrícula e setor) ou indica **Armário desocupado**. A administração pode excluir auditorias com confirmação. Ao concluir, use **Gerar Relatório para Gestão** para visualizar e imprimir em A4 o responsável, a data, o índice de conformidade e as ocorrências com providências recomendadas. O índice usa a quantidade de armários registrada no início da inspeção.

## Gestão de filiais

A tela **Administração** (`apps/web/src/pages/Admin.tsx`) é o ponto de criação e exclusão de filiais, restrito ao perfil **Administração geral**:

1. **Criar filial:** o formulário *Criar filial* recebe apenas o **Nome** e recarrega a aplicação com a nova filial. O campo cidade foi removido da interface, do contrato (`branchInput` em `packages/contracts`) e da tabela `branches` (migration `015_drop_branch_city.sql`).
2. **Filiais cadastradas:** logo abaixo, a tabela *Filiais cadastradas* lista todas as filiais ativas com **Nome** e **Ações**. A filial selecionada no cabeçalho aparece marcada como *Filial em uso*.
3. **Excluir filial:** o botão **Excluir filial** de cada linha abre a confirmação *"Esta ação excluirá permanentemente a filial e TODOS os armários e históricos associados. Deseja continuar?"*. A `DELETE /api/branches/:id` roda em uma única transação e apaga, nesta ordem: pendências (`pending_items`), histórico/eventos (`events`), importações (`imports`, `import_sources`, `legacy_history`), dispositivos autorizados, compartilhamentos (`sharings`), alocações (`allocations`), armários (`lockers`), vínculos (`memberships`, `need_exceptions`), operações (`operations`), os usuários daquela filial (`users`), localizações (`locations`), pessoas sem nenhum vínculo remanescente e, por fim, o registro em `branches`. Excluir a filial em uso recarrega a aplicação na primeira filial restante.
4. **Arquivamento removido:** a ação *Arquivar filial* (`POST /api/branches/:id/archive`) foi retirada da API e da interface; nenhuma filial fica mais em estado `inactive`, e o acesso a uma filial inexistente responde `403 FILIAL_INATIVA`.

## Gestão de acessos e senha própria

Na mesma tela **Administração**, a seção *Acessos* lista os usuários da filial com perfil, situação e as ações **Desativar/Ativar**, **Redefinir senha** e **Excluir**:

1. **Excluir acesso:** o botão **Excluir** de cada linha abre a confirmação *"Tem certeza que deseja excluir o utilizador {username}? Esta ação não poderá ser desfeita."*. A `DELETE /api/users/:userId` aceita apenas perfis de administração (`403 PERMISSAO`), roda em uma única transação com chave de idempotência, encerra as sessões abertas daquele usuário e grava o evento `usuario_excluido` na trilha de auditoria com a descrição `Usuário excluído: {username}`. Recusas: usuário inexistente (`404 USUARIO`), a própria conta ativa (`409 USUARIO`, *Não é possível excluir a própria conta ativa*), usuário de outra filial ou de administração geral sem permissão (`403 FILIAL`) e versão divergente na listagem (`409 USUARIO`).
2. **Alterar a própria senha:** no cabeçalho, o menu da conta (`Conta de {username}`) abre o item **Alterar senha**, que exibe o modal `Alterar senha` (`ChangePasswordModal.tsx`). O formulário pede **Senha atual**, **Nova senha** e **Confirmar nova senha**, com botão de visibilidade em cada campo, validação local *As senhas não conferem.* e `Esc` para fechar. A `POST /api/auth/change-password` confirma a senha atual com argon2 (`401 CREDENCIAIS`, *Senha atual inválida*), exige no mínimo 12 caracteres e recusa a repetição da senha atual (*A nova senha deve ser diferente da atual*), marca `must_change_password` como resolvido e encerra as demais sessões da conta, mantendo apenas a sessão em uso. O aviso de sucesso é *Senha alterada com sucesso. As outras sessões abertas foram encerradas.*
3. **`username` em toda sessão:** `Actor` e as respostas de `POST /api/auth/login` e `GET /api/auth/me` passaram a devolver `username`, alimentando o menu do cabeçalho, a confirmação de exclusão e a descrição do evento de auditoria.

## Dashboard: centro de comando executivo

A tela **Dashboard** (`apps/web/src/pages/Overview.tsx`) é o centro de comando de prevenção de perdas e gestão de armários da filial. Os cálculos ficam em `apps/web/src/locker-insights.ts` (testes em `locker-insights.test.ts`) e a tela abre com uma grade de **cinco cards de KPI** (`.kpi-grid`, 5 colunas no desktop, caindo para 3, 2 e 1 conforme a largura). Cada card tem a mesma estrutura enxuta — ícone + título, valor grande, **uma única linha de legenda** e um botão de ação de texto com seta — sem barras de progresso, pílulas, notas explicativas ou blocos secundários:

1. **Ocupação Total** — percentual de ocupação (posições ocupadas ÷ capacidade efetiva) e a legenda `{N} ocupados • {N} vagas livres`; a ação **Ver armários** abre a lista já com o filtro *Com vaga* (`onOpenLockers({status:'com_vaga'})`).
2. **Colaboradores sem Armário** — pessoas ativas da filial sem armário vinculado, vinda de `GET /api/branches/:id/dashboard` (campo `withoutLocker.total`, `memberships` ativas sem `allocation` vigente), com a legenda `Pessoas ativas aguardando vaga`. O card carrega a classe `kpi-card--unassigned` (valor em âmbar) e ganha `level-ok` (verde) quando a contagem chega a zero; a ação **Ver pessoas sem armário** abre a tela Colaboradores com o filtro *Sem armário* aplicado (preset `withoutLocker` via `navigate('pessoas', preset)`).
3. **Pendências Críticas** — total de pendências abertas em `pending_items`, com o *badge* `Ação necessária` exibido enquanto houver pendência. A severidade vira classe no card (`level-ok` para 0, `level-atencao` de 1 a 10, `level-critico` acima de 10) e a legenda é `Ajustes cadastrais e operacionais`; a ação **Resolver pendências** leva à tela de Pendências.
4. **Armários Duplos** — taxa de utilização das vagas duplas preenchidas com a legenda `{N} de {M} duplos 100% ocupados` e o atalho **Ver duplos** para a lista filtrada. **Regra especial de setor:** os armários duplos de **TRANSPORTE PESADO**, **CONSERVAÇÃO E MANUTENÇÃO** e das variações Conservação/Limpeza/Manutenção, quando têm **um único ocupante**, valem como `100% Ocupados` (armário duplo individual para EPIs e equipamentos), deixam de oferecer vagas e **não** entram na contagem de duplos parcialmente ocupados.
5. **Controle de Chaves** — número de armários com cópia da chave marcada como inexistente (`key_copy_available=false`), com legenda `Armários sem cópia cadastrada` (ou no singular) e a ação **Ver chaves** para a lista filtrada por *Cópia da chave: Não*.

Os cinco cards usam preenchimentos pastéis e bordas coloridas para facilitar o reconhecimento dos indicadores: lilás para ocupação, âmbar para colaboradores sem armário, rosa para pendências críticas, azul/índigo para armários duplos e verde para controle de chaves. O acento lateral reforça a cor de cada card, com tons ajustados para manter contraste no tema claro e no escuro. Os atalhos ficam alinhados à margem interna do texto, com área de clique confortável; o hover muda suavemente a cor de fundo sem alterar o tamanho ou deslocar o botão.

Abaixo dos KPIs o painel abre dois widgets lado a lado e um terceiro em largura total:

- **Ranking de ocupação por setor** — linhas botão (`.insight-bar-row`) com o nome do setor, a contagem de posições ocupadas e uma barra proporcional (`.insight-track` / `.insight-fill`) calculada sobre o setor de maior demanda, ordenadas das mais demandantes às menos, dentro de um container com rolagem própria (`.insight-scroll`). Ocupantes cujo setor ou função menciona **promotor** saem do ranking: promotor é cargo, não setor, e essas pessoas são contadas apenas em *Pessoas por vínculo*. A categoria **Sem setor** aparece como anomalia (ícone de aviso e linha destacada) e abre a lista já filtrada; clicar em qualquer linha abre os armários ocupados daquele setor.
- **Pessoas por vínculo** — lista separada por linhas com divisória (`.category-row-head`) mostrando rótulo, contagem e percentual, cada linha com uma barra proporcional (`.category-track` / `.category-fill`, largura igual ao percentual informado). A contagem vem de `GET /api/branches/:id/dashboard` (campo `links`, uma agregação SQL por `COUNT`) com os rótulos oficiais `Colaborador`, `Promotor(a)`, `Terceirizado` e `Pendência Cadastral`, sem `LIMIT` de exibição: **todo promotor ativo entra em Promotor(a)**, inclusive o promotor identificado pela função/cargo na planilha da TI. A classificação da mesma consulta segue esta ordem: (1) setor, função ou nome com **aprendiz** → `Colaborador` (jovens aprendizes não viram vínculo separado); (2) `promotor_fixo` ou setor/função com **promotor** → `Promotor(a)`; (3) empresa/setor Delta, Climatização ou Terceirizado → `Terceirizado`; (4) quem está **sem setor, sem cargo e sem empresa** → `Pendência Cadastral` (rótulo oficial da categoria `vinculo_nao_identificado`); (5) categorias cadastrais `colaborador` e `vinculo_nao_identificado` seguem o próprio valor. Categorias legadas com dados (ex.: `roteirista` com setor) seguem sem classificação e ficam fora do card. Posições atribuídas diretamente a setores são exibidas separadamente. Pendências cadastrais vêm dos itens abertos em `pending_items`; registros rotativos encerrados continuam legíveis no histórico.
- **Movimentações e atividade** — em largura total (`.overview-widgets--base`), com o seletor de período **7 dias / 30 dias** (`.period-toggle`) no próprio cabeçalho e a contagem de atribuições, desocupações e trocas do período, derivada das alocações e transferências registradas.

Removidos nesta simplificação: as notas explicativas sob os widgets, o alerta de posições sem setor ou matrícula, os textos de apoio das métricas de movimentação, as barras de progresso e pílulas dos **cards de KPI** e a seção **Ações rápidas** (`+ Atribuir / Desocupar Armário`, `Importar Planilha de Colaboradores`, `Ver Pendências Abertas` e `Consultar Histórico`) — importação e histórico seguem acessíveis pelo menu lateral. Toda ação dos KPIs, das linhas de setor e dos widgets navega para a lista de armários ou da pessoa já filtrada. Os dois widgets laterais são simétricos em altura (`.overview-widgets` em grade de 2 colunas com itens esticados, `.insight-panel` em flex coluna e `.category-bars` distribuído com `space-between`), e a barra proporcional restrita às duas listas de distribuição foi restaurada após a simplificação. A tela respeita o tema claro/escuro e é responsiva — em telas estreitas os KPIs e os widgets viram uma única coluna, sem rolagem horizontal (`scrollWidth ≤ viewport`).

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

1. **Cabeçalho fixo** — o número do armário é permanente e não é editável: aparece como título `Armário Nº X` com o *badge* da filial, o indicador de duplo e a linha de situação (`Disponível` ou `Ocupado`). O cabeçalho fica fixo no topo do drawer durante a rolagem.
2. **Cartão Status do armário** — estado atual (Livre, Ocupado, Pendente, Indisponível), destaque das vagas disponíveis (`0 vagas` / `1 vaga disponível`), situação (`Disponível` ou `Ocupado`, definida pela ocupação), capacidade operacional, posições ocupadas, cópia da chave e aviso de conferência.
3. **Cartão Ocupantes** — cada pessoa com nome, matrícula, setor e função, mais os botões secundários **Imprimir Termo**, **Editar** e **Desocupar armário** (antes chamado de *Registrar saída*).
4. **Cartão Edição e configurações** (administração) — controles refinados:
   - **Tipo de armário** em leitura (`Padrão` ou `Duplo`) com aviso de que a troca é feita em Administração;
   - **Situação** em leitura (`Disponível` ou `Ocupado`): a situação física acompanha a ocupação e não tem mais botões de `Manutenção` ou `Bloqueado`;
   - **Toggle switch** apenas para *Existe cópia da chave?*;
   - o campo **Setor ocupante** foi removido do drawer (o valor já cadastrado é preservado na gravação);
   - cadastro ou correção de ocupantes com matrícula oficial da base ativa.

O cartão **Cadastrar pessoa neste armário** foi removido do drawer: o bloco `.locker-entry` (busca de pessoa, atribuição, transferência e compartilhamento) sumiu do CSS (`locker-drawer.css`, `locker-status.css`, `operational-design.css`, `theme.css`) e da tela, junto com os estados e o fetch de pessoas que o alimentavam. Essas ações agora acontecem só na tela **Colaboradores**, dentro do diálogo de detalhes da pessoa, e o drawer ficou restrito a exibir e editar o próprio armário.

O drawer respeita o tema escuro/claro, é responsivo (vira painel de largura total no celular), mantém foco preso no diálogo (Esc fecha) e bloqueia a rolagem da página enquanto está aberto.

## Tela de Transferências

A aba **Transferências** (`apps/web/src/pages/Transfers.tsx`) recebeu o subtítulo **Histórico de Ocupações e Transferências** e reúne dois cards:

- **Ocupações** — tabela com cabeçalhos `PESSOA / SETOR`, `ARMÁRIO`, `ENTRADA` e `SITUAÇÃO`. A coluna `PREVISÃO / SAÍDA` foi removida junto com a `Modalidade` e o botão **Registrar devolução**, porque a previsão de saída deixou de ser usada na operação (o prazo continua registrado na ocupação e aparece nas pendências). A situação aparece em badge arredondado — verde **Ativa**, cinza **Desocupada** —, as células usam `padding: 1rem 1.25rem` com divisória suave (`border-bottom`) e datas sem registro são exibidas como `-`. O filtro **Exibir** oferece Ativas, Desocupadas e Todas.
- **Histórico de trocas de armário** — transferências com data, pessoa e matrícula, armários de origem/destino e motivo (ou `-` quando não informado).

`GET /api/branches/:id/allocations` passou a devolver também o setor do colaborador (`m.department` como `sector`), que preenche a linha secundária de **PESSOA / SETOR**. Os estilos ficam em `design-system.css` (`.movement-table`, `.history-table`, `.status-badge`) com os pares de cores do modo escuro em `theme.css`.

## Recursos do front-end

- **Controles próprios em vez de `<select>` e `<datalist>` nativos:** os filtros e os campos de setor usam `Select`/`SelectField` (`apps/web/src/components/Select.tsx`, estilos em `select.css`), e a matrícula usa o autocompletar `RegistrationInput` (`apps/web/src/RegistrationInput.tsx`) com realce do trecho digitado. A lista de setores oficiais vem de `apps/web/src/sectors.ts` (departamentos de pessoas ativas, setores já registrados em armários e o valor atual). Os selects de ação e de formulário (situação por linha, perfil, modalidade, categoria do cadastro, prévia de importação) continuam nativos, mantendo `required` e a validação do navegador.
- **Armário duplo só em Administração:** o atributo `is_double` é criado na carga inicial ou na tela Administração; nos cards de leitura e nos drawers operacionais ele aparece como *badge* e como campo fixo, sem controle editável.
- **Limpeza do antigo modo offline:** na inicialização, o navegador remove as chaves `device` e `copy` do IndexedDB e desregistra o antigo service worker, sem alterar as preferências do usuário.
- **Seletor de filial do cabeçalho sempre visível:** o menu do `Select` (`apps/web/src/components/Select.tsx`) é ancorado à direita do próprio gatilho quando aberto para a direita cortaria a tela, respeita `max-width: 280px` e abre com `z-index: 9999` (`select.css`), garantindo que nomes longos de filial não saiam da viewport.
- **Tabela de armários em Administração sem botões residuais:** a coluna *Ações* mantém apenas o controle **Marcar/Remover duplo** e a seleção de **Situação**; o botão *Setor ocupante* e seu editor em linha foram removidos, e o setor deixou de ser editável no drawer do armário (`drawer` do painel) — continua disponível no formulário de novo armário e na conferência de pendências.
- **Feedback de ações humanizado:** os avisos de sucesso são curtos e contextuais em todo o front-end — `Armário #102 atribuído a Ana Exemplo com sucesso!`, `Armário #103 transferido para Ana Exemplo com sucesso.`, `Armário #102 desocupado com sucesso.` e `Informações do armário #102 salvas.` — substituindo o texto prolixo anterior “Dados do armário atualizados. Dados oficiais de … aplicados.”
- **Modal Sobre / Changelog com rolagem:** o diálogo (`AboutModal.tsx`, estilos em `design-system.css`) usa `max-height: 85vh` com `overflow-y: auto` e espaçamento uniforme de `1.25rem`; o botão **Novidades e Versões** e a lista de entregas são seções próprias com rolagem interna. O rodapé (`.about-actions`) é fixo durante a rolagem, ocupa toda a largura do diálogo (`margin-inline: -1.25rem`) e recebe `padding: 1.25rem`, de modo que o botão **Fechar** alinha exatamente com as margens laterais do container e deixa de encostar no canto inferior.
- **Changelog executivo:** cada entrega usa título curto, resumo em uma linha e dois tópicos objetivos para apresentar benefícios ao usuário final e à gestão, sem códigos, jargão técnico ou parágrafos extensos.
- **Tela de acesso com marca ampliada e visibilidade da senha:** o bloco de marca exibe o ícone Lockeris em 56 × 56 px e o nome **LOCKERIS** em caixa alta, negrito, `1.125rem` e `letter-spacing: 0.1em` (`.auth-intro .auth-brand`), com contraste elevado sobre o gradiente roxo. O campo *Senha* ganhou um botão de olho (`.password-toggle`, com texto oculto `.sr-only` e `aria-pressed`) que alterna `type="password"` e `type="text"` sem usar `aria-label`, para que `getByLabel('Senha')` continue apontando apenas para o input; o ícone mede 20 × 20 px dentro de uma caixa de 24 × 20 px, centralizado vertical e horizontalmente. O título do bloco de acesso passou a ser **Gestão Integrada e Controle de Armários**, com o subtítulo *Sistema de controle operacional de armários e rastreabilidade para Prevenção de Perdas*; o utilitário `.sr-only` foi adicionado a `design-system.css`.
- **Troca de senha temporária centralizada:** a tela exibida quando a senha ainda é temporária usa o mesmo container da tela de acesso com o modificador `.auth-page--center` (`display: flex`, `align-items: center`, `justify-content: center`, `flex-wrap: wrap`), repetindo o bloco de marca (`.auth-intro`) e centralizando o cartão do formulário, em vez de deixá-lo solto na primeira coluna do grid. Os campos **Senha temporária** e **Nova senha** usam a mesma estrutura `.password-field` / `.password-control` do login e ganharam o botão de olho próprio (`aria-pressed`, rótulo oculto `Mostrar/Ocultar senha temporária` e `Mostrar/Ocultar nova senha`), alternando `type="password"` e `type="text"` sem `aria-label`, para que `getByLabel` siga apontando apenas para o input.
- **Menu da conta e troca de senha pelo cabeçalho:** o cabeçalho ganha o gatilho `Conta de {username}` (`.user-menu`, ícone `ChevronDown`), que abre um menu `role="menu"` com o item **Alterar senha**; o clique fora e a tecla `Esc` fecham o menu, e o modal (`ChangePasswordModal.tsx`, estilos `.password-dialog*` em `design-system.css`) segue a mesma estrutura de cartão dos demais diálogos, com olho de visibilidade nos três campos (`Senha atual`, `Nova senha` e `Confirmar nova senha`, os dois últimos com `aria-label` próprio para não colidirem com o campo do formulário de troca temporária), mensagens em `role="alert"` e fechamento automático no sucesso.
- **Exclusão de acesso na lista de usuários:** em Administração, a linha de cada usuário ganha o botão **Excluir** ao lado de *Desativar/Ativar* e *Redefinir senha*, com confirmação em `alertdialog` e aviso curto de sucesso (`Acesso de {username} excluído.`); a ação fica visível apenas para perfis de administração e respeita a filial em uso.
- **Dark mode:** o atributo `data-theme="dark"` em `<html>` troca as variáveis do `theme.css`; o controle fica no canto da tela de acesso e no topo do painel.
- **Impressão de termos em CSS:** o Termo de Responsabilidade (`apps/web/src/components/TermoResponsabilidade.tsx`) é renderizado junto ao drawer e impresso só com CSS (`termo-print.css`), sem PDF nem dependência externa — a página esconde a interface, força fundo branco e sai do modo escuro durante a impressão. A folha é fixada em `@page { size: A4 portrait; margin: 10mm }` e o container recebe `page-break-inside: avoid` / `break-inside: avoid`, ocupando a largura útil total da página (190mm com `box-sizing: border-box`) e cerca de 85% da altura útil: as células do formulário e das colunas usam `padding: 8px 12px`, o corpo do texto sai em `14px` com `line-height: 1.4`, a lista de regras em `0.85rem` com `line-height: 1.35` e a área de assinatura ganhou `height: 120px` + `margin-top: 2rem` para respiro do *Ass. Colaborador*. O resultado segue cabendo em exatamente **1 página A4** sem ficar miniaturizado, e o rodapé `FOR.PRP.0020` (Controle de Revisão) não vaza para a segunda folha.

## Central de alertas

O topo da aplicação ganhou o sino de alertas, ao lado do seletor de filial (`NotificationCenter` em `apps/web/src/components/Header.tsx`, estilos `.notification-*` em `design-system.css`). `GET /api/branches/:id/notifications` (`apps/api/src/notifications.ts`) devolve a data da checagem e três entradas que ficam sempre visíveis no menu, com contagem zero quando não há nada pendente:

- **Colaboradores sem armário** — vínculos ativos sem ocupação aberta; o item abre `Colaboradores` com o filtro *Sem armário* ligado.
- **Pendências cadastrais** — pendências abertas dos tipos `sem_matricula`, `ausente_ti`, `dados_alterados` e `identificacao_conflitante`; leva para a aba `Pendências`.
- **Duplos subutilizados** — armários duplos com exatamente uma ocupação, sem setor ocupante e fora dos setores exclusivos (transporte pesado, conservação, limpeza e manutenção); abre o painel de armários com o filtro *Duplos parciais*.

A contagem total vira badge (`.notification-badge`) apenas quando há alertas, o menu abre com `role="menu"` e fecha no clique fora, em `Esc` ou ao escolher um item, e a lista é recarregada a cada minuto. Cada cartão mostra somente o título, a contagem, uma descrição curta e um atalho para a tela correspondente; nomes, matrículas e prévias de listas não aparecem no menu. Bordas laterais e badges coloridos distinguem os tipos de alerta, com contraste adaptado aos temas claro e escuro.

O cabeçalho permanece fixo no topo durante a rolagem, com fundo opaco, borda inferior e sombra suave nos temas claro e escuro. A Central de Alertas abre sobre tabelas, filtros e botões, em uma superfície sólida com sombra destacada, sem deixar o conteúdo da página transparecer. As entregas em **Novidades e Versões** seguem o mesmo padrão enxuto: título, resumo de uma linha e tópicos com os principais ganhos para a operação.

## Higienização de base

A seção **Higienização de base** (`#sanitation` em `apps/web/src/pages/Admin.tsx`) lista os cadastros ativos, sem armário e sem movimentação dentro da janela escolhida (30 a 3650 dias, padrão 90), com seleção individual ou total antes da exclusão:

- `GET /api/branches/:id/people/stale` devolve até 500 linhas com pessoa, matrícula, setor e última movimentação (`staleRows` em `apps/api/src/sanitation.ts`).
- `POST /api/people/bulk-purge` recebe a seleção de vínculos e trava cada vínculo na transação (a mesma trava usada pela ocupação). Quem tiver armário aberto é recusado com `409 ARMARIO_VINCULADO` e o nome de quem bloqueia; depois são removidas as exceções, as pendências e os vínculos, e a pessoa é apagada quando não resta nenhum vínculo.
- A operação gera o evento `cadastros_purgados` no Histórico, exige perfil de administração da filial nas duas rotas e passa por confirmação em `alertdialog` antes de excluir.
## Trilha de auditoria (Histórico)

A tela **Histórico** (`apps/web/src/pages/History.tsx`) lê `GET /api/branches/:id/history`, que devolve cada evento da tabela `events` já com o contexto da operação gravado no momento da escrita (`event()` em `apps/api/src/operations.ts`):

- `locker_number` — número do armário afetado;
- `person_name` e `person_registration` — nome e matrícula do colaborador envolvido, quando houver;
- `sector_name` — setor ocupante, no caso de ocupação por setor;
- `description` — descrição humanizada da alteração (ex.: `Armário desocupado`, `Atribuição de setor`, `Dados do armário atualizados: capacidade, situação`);
- `details` — payload original da operação (`before`/`after`, motivo, resolução e contagens), também exportado no CSV (`history/export`).

A migration `014_audit_event_context.sql` adiciona as colunas de contexto; eventos antigos continuam legíveis e o card cai no resumo disponível em `details`.

Cada card da linha do tempo exibe o **tipo da ação** (badge), a **data/hora**, o assunto (`Filial`, `Pessoa`, `Armário`…) e uma linha principal em **negrito** com o contexto da operação:

- Pessoa: `Armário #102 · Carlos Souza (Matrícula: 10452)`
- Setor: `Armário #12 · Setor: Manutenção`

A linha secundária traz a `description` detalhada do evento (quando ela não repete o rótulo do badge) ou, na ausência dela, o motivo, a resolução ou a contagem lidos de `details` (`Motivo: …`, `Resolvido com: …`, `12 armários importados.`).

Eventos gravados antes da migration `014` não têm `locker_number` nem `person_name`: nesses casos o card usa a `description` como linha principal e, na ausência dela, cai para o resumo padrão `Ajuste de registro de ocupação` — o card nunca fica vazio nem repete o mesmo texto duas vezes.

### Limpeza de históricos antigos

O cabeçalho da tela reúne dois controles: **Limpar históricos antigos** (ao lado do **Exportar registro CSV**) e a exportação. A limpeza:

1. abre a confirmação *"Deseja remover os registros de histórico legados/incompletos? Esta ação não afetará os logs operacionais recentes?"*;
2. chama `DELETE /api/branches/:id/history/clear` (`catalog.ts`) com o `operationId` da operação, restrito a perfis administrativos;
3. dentro de uma única transação apaga os eventos da filial que são **legados/incompletos** (sem `locker_number`, `person_name`, `sector_name` nem `description`), **antigos** (anteriores a 365 dias) ou **de migração de sistema** (`entity_type='import'`, as cargas de armários e de base de colaboradores);
4. grava o próprio evento `historico_limpo` com a quantidade removida, que permanece na trilha porque tem contexto.

Ocupações, transferências, cadastros e demais eventos operacionais recentes continuam no histórico; a resposta devolve `{removed}` e a tela recarrega a linha do tempo com o aviso da contagem.

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

## Autoria e Desenvolvimento

Projeto idealizado e desenvolvido do zero por **Elton Marques** para automação, controle de custódia e Prevenção de Perdas.
