# Roadmap de auditoria e reformulação de UX, UI e linguagem

**Produto:** Gestão de Armários • **Data:** 23/09/2026 • **Status:** proposta para execução

O objetivo é transformar o aplicativo em uma ferramenta profissional, confiável e rápida para a operação diária. A direção recomendada combina hierarquia visual clara, linguagem objetiva, componentes consistentes e movimento discreto. O efeito “uau” deve surgir do acabamento e da fluidez, com efeitos mais expressivos concentrados em áreas de apresentação.

## Base do planejamento e limites da análise

Este roadmap considera uma leitura preliminar do README, das dependências e de trechos da interface. O produto gerencia armários e ocupantes por filial, incluindo transferências, pendências, importações e consulta offline. A stack declarada do front-end é React 19, TypeScript, Vite 7, CSS e Lucide; o repositório também declara Playwright e Vitest.

A auditoria visual no navegador, as entrevistas e as medições ainda precisam ser realizadas. As hipóteses sobre usabilidade e credibilidade serão verificadas nessas etapas; não há baseline medido nem avaliação concluída de acessibilidade ou performance.

Pontos concretos que orientam o trabalho:

- `apps/web/src/pages/History.tsx` apresenta tipos de eventos a partir de identificadores com substituição de sublinhados. Revisar o vocabulário por evento e separar descrição legível de informação técnica.
- `apps/web/src/App.tsx` contém estados de consulta offline, validade da cópia e navegação condicionada ao perfil. Esses estados precisam entrar no inventário de conteúdo e na validação.
- O README descreve armários duplos, ocupação por setor e pendências por identificação incompleta ou saída da base ativa. O design precisa representar essas diferenças sem misturar capacidade, ocupação e necessidade de conferência.
- Existem alterações locais em andamento. A execução futura deve coordenar sua integração antes de modificar componentes compartilhados.

O arquivo `RTK.md`, referenciado nas instruções recebidas, não foi localizado no projeto nem nos caminhos de instruções consultados. Este trabalho entrega somente o planejamento; nenhuma funcionalidade foi alterada.

## Sequência e estimativa

Estimativa inicial: **8 a 10 semanas**, considerando designer com responsabilidade por UX writing, desenvolvedor front-end dedicado e apoio de produto, operação, QA e backend. Confirmar duração após o inventário; disponibilidade de usuários e mudanças de regras podem ampliar o prazo.

| Fase | Janela sugerida | Responsável principal | Entregável | Condição para avançar |
|---|---|---|---|---|
| 0. Alinhamento e baseline | 2–3 dias, semana 1 | Produto + design | Escopo, jornadas e plano de medição | Perfis, tarefas e critérios de sucesso definidos |
| 1. Auditoria completa | 4–5 dias, semanas 1–2 | Design + QA + engenharia | Inventário e backlog priorizado com evidências | Fluxos críticos e seus estados cobertos |
| 2. Arquitetura e linguagem | 4–5 dias, semanas 2–3 | Design + UX writing | Navegação, fluxos e glossário | Termos e consequências compreendidos por usuários |
| 3. Direção visual e sistema de componentes | 5–7 dias, semanas 3–4 | Design + front-end | Tokens, componentes e regras de movimento | Telas representativas aprovadas e viáveis |
| 4. Protótipo e validação | 4–5 dias, semana 5 | Design + operação | Protótipo testado e revisado | Bloqueios críticos resolvidos e retestados |
| 5. Implementação incremental | 10–15 dias, semanas 6–8 | Front-end + QA | Fluxos completos em ambiente de teste | Cada entrega passa pelos critérios de aceite |
| 6. Homologação e piloto | 4–5 dias, semana 9 | QA + produto + operação | Relatório de aceite e piloto | Sem bloqueios críticos, com recuperação validada |
| 7. Expansão e acompanhamento | Semana 10 e 30 dias seguintes | Produto + engenharia | Publicação gradual e acompanhamento | Métricas estáveis e problemas priorizados |

Arquitetura e conteúdo podem evoluir juntos. Tokens podem começar após a primeira rodada da auditoria. A implementação ampla depende da validação do fluxo piloto, para evitar reproduzir um padrão ainda não comprovado.

## Fase 0 — Definir o que significa melhorar

1. Confirmar perfis e permissões: administrador, operador e consulta; verificar diferenças entre filiais e dispositivos usados no trabalho.
2. Observar ou entrevistar 5–8 pessoas representativas. Investigar tarefas frequentes, termos utilizados, situações de dúvida e erros com maior consequência. Essa amostra é qualitativa, sem pretensão de representar estatisticamente toda a base.
3. Mapear as jornadas prioritárias: localizar armário ou colaborador; atribuir ocupação; transferir; conferir devolução; resolver pendência; importar e conferir dados; consultar histórico; trabalhar em modo somente consulta.
4. Registrar tempos, erros, pedidos de ajuda e compreensão dos estados na interface atual, em cenários comparáveis.
5. Levantar restrições: tamanho típico e máximo das listas, máquinas disponíveis, rede, navegadores, funcionamento offline, suporte e regras de acesso.

**Entregável:** briefing operacional, mapa de jornadas e baseline. Registrar origem, data, cenário e tamanho da amostra de cada medida. Usar dados fictícios nos protótipos e evitar dados pessoais na telemetria de UX.

**Decisão de saída:** escolher uma jornada piloto. Sugestão: localizar colaborador e atribuir ou transferir armário, pois atravessa busca, leitura de estado, formulário, confirmação e feedback.

## Fase 1 — Auditar todas as telas e seus estados

1. Inventariar autenticação, painel, pessoas, pendências, transferências, histórico, importações e administração. Incluir overlays, formulários, filtros, navegação e seleção de filial.
2. Para cada fluxo, registrar estados inicial, carregando, vazio, sem resultado, sucesso, erro, permissão insuficiente, somente leitura e offline, quando aplicáveis.
3. Auditar hierarquia, densidade, leitura dos cards, descoberta das ações, consistência, prevenção de erros e recuperação. Observar também textos truncados, listas extensas e comportamento responsivo.
4. Inventariar textos visíveis e mensagens vindas da API. Identificar jargão, termos ambíguos, sinônimos concorrentes, botões genéricos e mensagens sem orientação.
5. Testar teclado, foco, leitura com tecnologia assistiva, contraste, zoom, tamanho de alvos e preferência por movimento reduzido. Usar WCAG 2.2 AA como referência de avaliação [1].
6. Medir carregamento, resposta a filtros e busca, abertura de detalhes, rolagem e custo dos efeitos em dispositivos representativos.

**Registro de cada achado:** tela e perfil → tarefa → evidência reproduzível → problema → consequência → frequência observada → severidade → proposta → esforço → responsável → validação necessária.

**Priorização:**

- **P0:** risco de operação incorreta ou bloqueio de tarefa essencial; exemplo hipotético: indicação de filial que induz atribuição no contexto errado.
- **P1:** atrito frequente, linguagem ambígua ou barreira de acessibilidade em fluxo principal.
- **P2:** inconsistência e acabamento que reduzem clareza ou confiança.
- **P3:** enriquecimento visual opcional.

Esses exemplos não são defeitos já comprovados. Priorizar por severidade, alcance e frequência; usar esforço como desempate. Não adiar uma barreira crítica por ser mais trabalhosa.

**Entregável:** relatório com capturas anotadas, matriz de cobertura e backlog. Cada problema precisa distinguir observação, hipótese e evidência de usuário.

## Fase 2 — Reorganizar fluxos e estabelecer uma linguagem única

### Arquitetura de informação

1. Testar uma organização orientada a tarefas: **Operação** — Armários, Colaboradores, Pendências e Transferências; **Gestão** — Importações, Histórico e Administração, conforme permissões reais.
2. Verificar se “Painel” ajuda o usuário ou se “Armários” descreve melhor sua finalidade. Tratar essa troca como hipótese a validar.
3. Manter filial atual, busca e filtros claramente identificados. Preservar contexto ao abrir detalhes e retornar para a lista.
4. Separar visualmente dimensões diferentes: disponibilidade/ocupação; capacidade simples ou dupla; ocupação por pessoa ou setor; pendência de conferência; existência de cópia da chave.
5. Desenhar confirmações que mostrem origem, destino, pessoa e consequência. Distinguir consultar, editar, transferir e encerrar ocupação.
6. Revisar importação como fluxo de seleção → validação → prévia de consequências → confirmação → resultado. A mudança da base ativa exige explicação concreta sobre ausências e pendências.

### Tom de voz

**Profissional, direto, respeitoso e orientado à ação.** Usar português brasileiro, voz ativa, frases curtas e termos familiares à operação. Não confundir formalidade com linguagem burocrática.

- Botões: verbo + objeto ou resultado, como “Transferir armário” e “Salvar alterações”.
- Campos: rótulo persistente, exemplo útil e orientação junto ao campo; placeholder não substitui rótulo.
- Erros: explicar o que aconteceu e como resolver; detalhes técnicos ficam disponíveis ao suporte quando necessário.
- Sucesso: confirmar a operação real e seu objeto. Usar aviso transitório somente quando a informação não exigir leitura posterior.
- Estados vazios: diferenciar ausência de cadastro, filtro sem resultado, falha de carregamento e falta de permissão.
- Ações destrutivas: explicitar alcance e consequência. Não prometer desfazer, recuperação ou sincronização que o sistema não oferece.

Criar um glossário com termo preferido, definição, alternativas evitadas, contextos e exemplos. Validar “colaborador”, “ocupante”, “setor ocupante”, “atribuição”, “transferência” e “pendência”; não substituir termos diferentes quando representam regras diferentes.

| Situação | Proposta de microcopy | Observação |
|---|---|---|
| Status atual “Offline · somente consulta” | “Sem conexão · apenas consulta” | Validar familiaridade; informar data dos dados e validade separadamente |
| Estado atual “Consulta indisponível” | “Conecte-se para consultar os armários” | Aplicável quando não houver cópia local válida; explicar esse motivo no apoio |
| Histórico derivado de identificador técnico | Rótulos explícitos por evento, como “Armário transferido” | Exemplo proposto; mapear cada evento real, com fallback legível |
| Busca sem resultado | “Nenhum colaborador encontrado. Confira o nome ou a matrícula.” | Diferenciar de erro na consulta |
| Confirmação de transferência | “Transferir [nome] do armário [origem] para o [destino]?” | Exibir filial e motivo no contexto; botão “Confirmar transferência” |
| Falha ao salvar | “Não foi possível salvar as alterações. Tente novamente.” | Usar apenas quando o resultado for conhecido; resultado incerto exige conferir antes de repetir |
| Ausência na nova base | “Colaborador ausente da base atual. Confira se o armário foi devolvido.” | Não afirmar desligamento ou devolução automática |

**Entregáveis:** mapa de navegação, fluxos anotados, guia de voz, glossário e catálogo de conteúdo com chave, contexto, texto atual, proposta e estado de revisão. Centralizar padrões compartilhados sem criar infraestrutura de tradução desnecessária.

**Critério de saída:** usuários conseguem explicar os estados e prever o resultado das principais ações sem ajuda do moderador.

## Fase 3 — Construir o sistema visual e especificar os efeitos

### Direção de UI

Base neutra clara, cor de marca usada com parcimônia, tipografia de alta legibilidade e contraste forte. Cores semânticas devem representar estados consistentes, sempre acompanhadas de texto ou ícone. Tema escuro só entra no escopo se houver demanda operacional comprovada.

1. Definir tokens de cor, tipografia, espaçamento, raio, borda, elevação, foco, densidade e movimento.
2. Criar componentes essenciais: estrutura da aplicação, navegação, seletor de filial, busca, filtros, card de armário, indicadores, tabelas, formulários, diálogos, alertas, estados vazios e carregamento.
3. Projetar três telas representativas: painel denso, formulário de transferência e prévia de importação. Avaliar a mesma linguagem visual em situações de densidade diferente.
4. Especificar estados default, hover, foco, ativo, desabilitado, carregando e erro. Evitar componentes que só pareçam utilizáveis após o hover.
5. Definir comportamento para mobile, tablet e desktop com base no conteúdo. Considerar lista compacta como alternativa à grade quando o volume justificar.

### Regras de movimento e profundidade

Os valores abaixo são pontos de partida para prototipação, sujeitos aos testes de legibilidade e desempenho.

| Efeito | Uso proposto | Implementação e limite | Alternativa acessível |
|---|---|---|---|
| Glassmorphism | Poucos cards de resumo e áreas de apresentação | CSS com superfície translúcida, borda e `backdrop-filter`; começar com blur de 8–12 px e evitar camadas sobrepostas | Fundo opaco por fallback; contraste aferido sobre todos os fundos [5] |
| Hover | Botões e cards acionáveis | Borda/cor em 120–180 ms; elevação discreta apenas quando não desestabilizar a leitura | Foco visível equivalente; controles sempre disponíveis em toque |
| Transições | Abertura de detalhes, feedback e mudança de estado | Opacidade/transform em 160–240 ms; operação não espera a animação | Estado final imediato quando movimento reduzido estiver ativo |
| Tilt | Card de apresentação ou destaque não operacional | Rotação inicial de até 2°; apenas ponteiro preciso; sem mover formulários ou listas de armários | Desativado em toque, teclado e movimento reduzido |
| Parallax | Fundo decorativo de boas-vindas, se essa área fizer sentido | Deslocamento curto, inicialmente 8–16 px, sem prender ou alterar rolagem | Elemento estático; desativado em movimento reduzido e dispositivos inadequados |

O pacote de efeitos deve aparecer no protótipo, mas tilt e parallax só seguem para produção se agregarem valor sem piorar a tarefa. Não aplicá-los à grade de trabalho, formulários, tabelas ou alertas. Glassmorphism precisa de contraste estável; não basta escolher uma opacidade e supor legibilidade.

Preferir `transform` e `opacity`, evitando animar layout ou grandes superfícies desfocadas. Atualizações de ponteiro não devem provocar renderização React a cada evento; limitar trabalho por frame, desativar efeitos fora da área visível e remover listeners ao desmontar. Uma única camada deve controlar cada propriedade animada.

### Stack recomendada para este repositório

| Necessidade | Recomendação | Motivo e condição |
|---|---|---|
| Base do produto | Manter React + TypeScript + Vite | A reformulação não exige migração de framework |
| Estilos e tokens | CSS Custom Properties e componentes compartilhados | Aproveita o CSS existente e permite introdução gradual do sistema visual |
| Componentes interativos complexos | Radix Primitives, introduzido por componente | Oferece comportamentos de foco, teclado e semântica; a composição final ainda exige testes [4] |
| Animação React | Motion for React | Usar para transições de componentes e feedback; considerar `LazyMotion` e pacote mínimo necessário [2][3] |
| Hover e glassmorphism | CSS nativo | Evita dependência exclusiva para efeitos simples; definir fallback de `backdrop-filter` [5] |
| Tilt discreto | CSS + pequena integração de ponteiro ou Motion já adotado | Sem biblioteca adicional se o efeito for simples |
| Parallax e sequência complexa | GSAP + ScrollTrigger, somente se o protótipo justificar | Carregar sob demanda e usar `gsap.matchMedia()` para adaptação e limpeza [6] |
| Ícones | Manter Lucide | Já declarado no projeto; padronizar tamanho, traço e rótulos acessíveis |
| Verificação | Playwright e Vitest existentes; avaliar axe-core para apoio | Cobrir fluxos, estados e regressões; automação não substitui teste manual de acessibilidade |

**Escolha padrão:** CSS nativo + Motion + primitives acessíveis nas interações que precisarem. GSAP é opcional; evitar carregar dois motores de animação para resolver os mesmos efeitos.

**Alternativa:** Tailwind + shadcn/ui, se a equipe preferir essa forma de construir e manter componentes. Avaliar em uma tela piloto o custo de convivência com o CSS atual antes da adoção. Não é requisito para obter aparência profissional e não deve ser implantado junto com outro conjunto visual completo sem uma estratégia de migração.

Antes de instalar dependências, verificar compatibilidade com React 19, manutenção, licença, tamanho incremental e suporte aos navegadores da operação. O roadmap sugere ferramentas, não fixa versões futuras.

**Entregáveis:** biblioteca visual, tokens, especificações responsivas e catálogo de movimento com gatilho, duração, interrupção, limpeza e fallback.

## Fase 4 — Validar o protótipo com tarefas reais

1. Montar um protótipo navegável da jornada piloto e dos cenários de maior risco.
2. Testar com 5–8 participantes distribuídos pelos perfis relevantes; repetir uma rodada após ajustes importantes.
3. Pedir tarefas sem explicar o caminho: encontrar vaga, transferir uma pessoa, identificar armário duplo, interpretar pendência, conferir importação e reconhecer que a consulta está offline.
4. Medir conclusão sem ajuda, erros críticos, tempo, compreensão dos termos e facilidade percebida em escala de 1 a 7.
5. Comparar versões com e sem efeitos nos mesmos cenários, alternando ordem para reduzir aprendizado. Verificar se o movimento auxilia orientação ou disputa atenção.
6. Corrigir bloqueios e retestar; aparência agradável, sozinha, não libera a implementação.

**Metas propostas:** pelo menos 90% de conclusão sem ajuda nos cenários críticos, nenhum erro crítico atribuível à interface e mediana de facilidade de pelo menos 6/7. Reportar também contagens absolutas e resultados por perfil: em amostras pequenas, percentuais isolados podem enganar. Revisar metas após a fase 0, antes do teste final.

## Fase 5 — Implementar por jornadas completas

Ordem sugerida:

1. Tokens, estrutura da aplicação, navegação e padrões de foco, feedback e conteúdo.
2. Painel, busca, filtros e detalhes do armário.
3. Atribuição, transferência e resolução de pendências.
4. Colaboradores, importação com prévia, histórico e administração.
5. Acabamento visual, otimização e efeitos aprovados.

Cada entrega deve incluir estados reais, linguagem final, responsividade, teclado, tratamento de erros e verificação visual. Evitar redesenhar somente o caminho de sucesso.

Preservar e testar regras de filial, permissões, armários duplos, ocupação por setor, matrículas, motivo de transferência e consulta offline. Não introduzir confirmação visual de sucesso antes de conhecer o resultado da operação. Se a requisição tiver resultado incerto, orientar consulta do estado antes de repetir uma ação que possa duplicar efeitos.

Reutilizar testes existentes e acrescentar cobertura onde houver risco de regressão de comportamento. Fazer comparação visual com dados fictícios representativos, inclusive nomes longos, muitos resultados e múltiplas pendências.

**Entregável por incremento:** fluxo utilizável no ambiente de teste, evidências de validação e registro de diferenças em relação ao protótipo. Revisão conjunta de design e engenharia resolve essas diferenças antes do próximo lote.

## Fase 6 — Homologar qualidade, acessibilidade e desempenho

| Área | Critério de aceite | Como verificar |
|---|---|---|
| Operação | Fluxos críticos concluídos; sem mudança indevida de dados, filial ou permissões | Testes de integração e ponta a ponta, mais homologação por perfil |
| Linguagem | Todo texto visível inventariado e revisado; nenhuma chave técnica exposta sem tratamento | Catálogo de conteúdo e revisão no navegador |
| Acessibilidade | Avaliação WCAG 2.2 AA; sem barreira conhecida em tarefas críticas | Teclado, leitor de tela, contraste, zoom/reflow e apoio automatizado [1] |
| Contraste | Texto comum ≥ 4,5:1; texto grande ≥ 3:1; componentes e indicadores aplicáveis ≥ 3:1 | Medição dos estados e fundos reais, inclusive superfícies translúcidas [1] |
| Toque | Alvo de projeto de 44 × 44 px para controles principais | Inspeção em dispositivos reais; distinguir essa meta do mínimo AA e suas exceções |
| Movimento | Redução de movimento respeitada; nenhuma informação depende de animação ou hover | Preferência do sistema, teclado, toque e teste sem efeitos [2] |
| Web Vitals | Meta de LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no percentil 75 | Medição em campo, segmentada por dispositivo, quando houver amostra suficiente [7] |
| Resposta operacional | Feedback visual perceptível em até 100 ms como meta de projeto | Medir busca, filtros e ações no dispositivo de referência; não confundir feedback com conclusão da API |
| Custo visual | Efeitos sem regressão relevante de resposta, rolagem ou consumo | Comparar gravações e perfis com efeitos ligados/desligados, mesmas condições |
| Consulta offline | Estado, data e validade compreensíveis; mutações indisponíveis | Cenários com cópia válida, expirada, ausente e retomada da conexão |

A fase 0 deve estabelecer orçamentos de JavaScript, imagens e tempo de interação com base na carga real. Em laboratório, repetir medições nas mesmas condições. Lighthouse ajuda no diagnóstico, mas não comprova sozinho experiência real ou conformidade de acessibilidade. Se o tráfego interno não permitir percentis confiáveis, registrar essa limitação e usar amostras controladas sem chamá-las de dados de campo.

**Decisão de saída:** nenhum P0/P1 aberto nas jornadas de lançamento; demais pendências documentadas com responsável. Verificar recuperação e possibilidade de retornar à interface anterior com contratos compatíveis.

## Fase 7 — Publicar gradualmente e manter o padrão

1. Selecionar uma filial ou grupo piloto representativo, com suporte disponível e janela adequada à operação.
2. Apresentar um guia curto com localização das ações e termos alterados. Evitar onboarding obrigatório para tarefas que já sejam claras.
3. Acompanhar erros, tempo de tarefa, abandono, chamados de suporte e feedback por perfil e dispositivo durante 1–2 semanas.
4. Expandir após estabilidade. Interromper expansão diante de bloqueio crítico, operação incorreta ou regressão sustentada; investigar e aplicar o plano de retorno quando necessário.
5. Rever resultados em 7 e 30 dias. Comparar com o baseline usando tarefas e contextos equivalentes, registrando diferenças de volume e aprendizado.
6. Manter responsável pelo glossário, componentes e tokens. Incluir revisão de linguagem, estados e acessibilidade no aceite de novas funcionalidades.

**Indicadores de resultado:** conclusão de tarefa sem ajuda, tempo mediano por jornada, erros operacionais, compreensão de pendências, facilidade percebida, chamados relacionados à interface e métricas de desempenho. Redução de 20% no tempo de uma tarefa repetitiva pode ser uma hipótese de sucesso, a confirmar após a medição inicial; não é benefício já demonstrado.

## Primeira semana: ações concretas

1. Confirmar responsáveis, usuários disponíveis, perfis e ambientes para avaliação.
2. Capturar as jornadas atuais com dados fictícios e registrar baseline.
3. Montar inventário de telas, estados e textos; priorizar os primeiros achados.
4. Validar vocabulário com a operação e desenhar a jornada piloto.
5. Apresentar backlog priorizado, escopo revisado e duas variações visuais da mesma tela operacional, com critérios claros para escolher uma.

## Referências consultadas

1. [W3C — WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/): referência para a avaliação de acessibilidade.
2. [Motion — Accessible animations](https://motion.dev/docs/react-accessibility): preferências de movimento e adaptação das animações.
3. [Motion — Reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size): carregamento seletivo com LazyMotion.
4. [Radix Primitives — Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility): comportamentos acessíveis dos primitives.
5. [MDN — backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter): efeito, transparência e compatibilidade.
6. [GSAP — gsap.matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()): adaptação por media queries e limpeza das animações.
7. [web.dev — Web Vitals](https://web.dev/articles/vitals): métricas e avaliação de desempenho em campo.

As recomendações de direção visual, cronograma, amplitudes de movimento e metas de usabilidade são propostas deste roadmap. As bibliotecas e normas informam os mecanismos e critérios técnicos; não comprovam adequação ao produto sem validação.
