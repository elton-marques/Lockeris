# Reformulação UX/UI — registro de execução

- Ponto inicial: `238b2ab2d5efa24f7abe220e3afcf2485e33c5ca`, branch `main`, remote `origin` em `https://github.com/elton-marques/armario-app.git`.
- Alterações locais preexistentes, preservadas: `docs/prompt-gpt-6-sol-implementacao.md` e `docs/roadmap-auditoria-ux-ui-2026-09-23.md` (ambos não versionados). O SHA acima não contém esses arquivos.
- Instrução `@RTK.md`: arquivo não encontrado. Sem workflows em `.github/workflows` no checkout inicial.
- Baseline isolado: `npm run test:e2e`, 6 testes aprovados com `armarios_e2e`; capturas originais em `test-results/visual/` (ignoradas pelo Git). Docker Compose operacional existente não foi alterado.
- Inventário: autenticação e troca de senha; painel/armários e detalhe; colaboradores e atribuição/transferência; movimentações; pendências e conferência; importações com prévia; histórico; administração; consulta offline. Estados presentes incluem bloqueio por permissão, ocupação setorial, armário duplo, pendência de migração, cópia válida/ausente, erro e confirmação.
- Prioridades confirmadas no código/renderização: P1, respostas de erro sem orientação e histórico com identificadores técnicos; P1, hierarquia e navegação pouco orientadas à tarefa; P1, estados vazios/carregamento inconsistentes; P2, distinção visual entre capacidade, ocupação e conferência e legibilidade mobile. Entrevistas e frequência em produção pendentes.
- Decisão visual: manter React, Vite, CSS e Lucide; tokens próprios, grafite e verde petróleo, sem novas dependências. Glassmorphism restrito a resumo e autenticação. Tilt/parallax dispensados porque não há área decorativa que beneficie a tarefa diária.

## Padrão aplicado

- Navegação por tarefas: **Operação** (Armários, Colaboradores, Pendências, Transferências) e **Gestão** (Importações, Histórico, Administração), respeitando os perfis existentes. Filial e conexão ficam no cabeçalho; a cópia local informa atualização e validade.
- Tokens em `apps/web/src/design-system.css`: base clara, grafite, verde petróleo, estados semânticos com texto, escala de espaços/raios, bordas, sombras, foco e transições de 160 ms. Lucide SVG reutiliza a dependência existente. Sem bibliotecas de animação novas.
- Primeiro fluxo: buscar pessoa/armário → conferir origem, destino, pessoa e filial → confirmar atribuição ou transferência → receber feedback após resposta da API. Foram mantidos motivo, modalidade, capacidade, ocupação setorial, matrícula oficial e versões esperadas.
- Estados compartilhados: carregando, erro recuperável e vazio sem resultado em Armários, Colaboradores, Pendências, Transferências, Histórico e Administração. A importação conserva seleção, mapeamento, prévia, confirmações e resultado. Erros de rede em mutações orientam conferir o estado antes de repetir; erro interno e validação não mostram detalhes técnicos.
- Histórico: cada evento conhecido tem rótulo explícito; IDs e JSON bruto saíram da tabela. O CSV administrativo existente permanece disponível.
- Glassmorphism: autenticação e indicadores, com superfície opaca quando `backdrop-filter` ou transparência reduzida não forem apropriados. Hover, foco e transições usam CSS; movimento reduzido remove a animação. Tilt e parallax foram dispensados porque só há superfícies operacionais e nenhum fundo decorativo útil para a tarefa.

## Glossário curto

| Termo | Uso na interface | Evitar quando muda o sentido |
|---|---|---|
| Colaborador | Pessoa da base ativa recebida por planilha | Chamar toda pessoa cadastrada de colaborador |
| Ocupante | Pessoa ou setor que usa um armário | Equiparar ocupação a cadastro ativo |
| Setor ocupante | Setor que ocupa armário sem pessoa identificada | Tratar como vaga livre |
| Atribuição | Início da ocupação de uma pessoa em um armário | Confundir com cadastro da pessoa |
| Transferência | Encerrar ocupação de origem e iniciar em outro armário, com motivo | Chamar de simples edição |
| Pendência | Situação que exige conferência ou decisão | Presumir devolução ou desligamento |

## Verificações locais

- Baseline em `238b2ab`: 6/6 testes Playwright no banco `armarios_e2e`. Reproduzir as capturas originais executando `npm run test:e2e` em um worktree temporário nesse SHA com os bancos isolados; a execução atual sobrescreve `test-results/visual/`.
- Resultado: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test` com `DATABASE_URL` de `armarios_test` (20/20), `npm run test:e2e` com `armarios_e2e` (7/7). O teste novo cobre busca vazia, teclado, foco do diálogo, Escape, histórico legível, mobile sem rolagem horizontal e `prefers-reduced-motion`.
- Capturas resultantes, reproduzíveis com Playwright: `test-results/visual/01-login.png`, `02-painel.png`, `03-compartilhado.png`, `05-previa-ti.png`, `06-pendencias.png`, `08-offline-mobile.png`, `14-transferencias.png`, `15-historico.png`, `16-administracao.png` e `17` a `23` para todas as telas no mobile. São geradas com dados fictícios no banco E2E e ignoradas pelo Git.
- Contraste calculado nos pares de tokens: texto/canvas 14,8:1; texto secundário/branco 4,68:1; botão primário 6,53:1; aviso offline 6,61:1; tabela 5,71:1. Isto não substitui auditoria WCAG completa em todas as combinações de tela.
- Custo do pacote web, mesmo comando `npm run build -w @armarios/web`, Vite 7.3.6 e mesmas dependências locais: baseline CSS+JS gzip 92,71 kB (3,36 + 89,35), atual 101,98 kB (6,31 + 95,67), acréscimo 9,27 kB (~10%). Não é medição de Web Vitals nem de resposta em dispositivos de produção.

## Checklist de aceite e pendências

- [x] Autenticação, armários, colaboradores, pendências, transferências, histórico, importações e administração com linguagem e hierarquia consistentes.
- [x] Cópia offline válida, ausente e retomada; permissões administrativas e operação preservadas nos fluxos E2E.
- [x] Busca, atribuição, transferência, armário duplo, setor, matrícula oficial, prévia de importação e conferência testados no ambiente isolado.
- [x] Inspeção visual de desktop/mobile, foco de teclado e movimento reduzido; sem rolagem horizontal da página no mobile testado.
- [ ] Entrevistas, homologação com perfis reais, leitor de tela, dispositivos físicos e métricas de produção: dependem de operação/QA; não foram simulados.
- [ ] Piloto e deploy: não autorizados nesta execução.

## Piloto e retorno, para a equipe responsável

1. Em ambiente de teste, conferir filial, perfis, planilhas fictícias, armários com setor/duplos, pendências e consulta offline; repetir tarefas com usuários de operação e registrar erros/tempo/compreensão.
2. Antes de publicar, preservar backup do banco e a versão atual da aplicação. Publicar a branch após homologação por um fluxo próprio de deploy, em uma filial piloto.
3. Se houver bloqueio crítico ou operação incorreta, interromper a expansão e voltar ao commit anterior da aplicação compatível com os contratos atuais. Restaurar dados apenas por procedimento próprio e backup verificado; Git não recupera banco, segredos ou estado de produção.
