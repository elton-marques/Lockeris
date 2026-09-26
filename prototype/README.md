# Protótipo visual — Armários

Prévia isolada com dados fictícios. Não acessa API, autenticação ou banco da aplicação.

Na raiz do repositório:

```powershell
npx vite prototype --host 127.0.0.1 --port 4173
```

Abra `http://127.0.0.1:4173`. O Dashboard e a lista de Armários são navegáveis. Cada tela mostra uma filial por vez; indicadores e barras abrem registros filtrados da filial selecionada. A lista combina busca por número, nome ou matrícula com filial, setor, situação e cópia da chave. As matrículas fictícias são únicas no conjunto de demonstração.

Os estados de carregamento, erro e lista vazia podem ser vistos em `http://127.0.0.1:4173/?state=loading#armarios`, `?state=error#armarios` e `?state=empty#armarios`. Esses parâmetros servem apenas para avaliar o protótipo visual.

Os KPIs usam apenas o conjunto fictício em `src/data.ts`, sempre limitado à filial selecionada. Vagas disponíveis são posições desocupadas em armários com condição disponível e dados conferidos, conforme as restrições de nova ocupação do app atual. A taxa de ocupação usa posições ocupadas sobre capacidade física total, inclusive em armários bloqueados ou com pendência. Bloqueios, pendências e falta de cópia contam armários físicos e podem se sobrepor. Os motivos demonstrativos de pendência usam nomes já presentes no app atual.
