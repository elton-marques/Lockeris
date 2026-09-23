# Gestão de Armários

Aplicação interna para ocupação de armários por filial. A interface e a API estão em português brasileiro. A instalação local usa PostgreSQL, Fastify e React; não depende do Google Apps Script.

## Estrutura

- `apps/api`: API, módulos de operação, importação, autenticação e migrações SQL.
- `apps/web`: interface React e PWA de consulta offline.
- `packages/contracts`: contratos Zod compartilhados.
- `scripts`: backup e teste de restauração.
- `e2e` e `apps/api/test`: testes com dados fictícios.

## Iniciar com Docker Compose

Requer Docker Desktop com o serviço iniciado. Na raiz do projeto, crie `.env` a partir de `.env.example`. Defina uma senha forte em `POSTGRES_PASSWORD` e uma chave aleatória de pelo menos 32 caracteres em `DEVICE_SECRET_KEY`. Mantenha `.env` fora do Git. Para a execução local em HTTP, use `COOKIE_SECURE=false`.

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Acesse `http://localhost:8080`. A API responde em `http://localhost:8080/api/health`; a documentação OpenAPI fica em `/api/docs`. O PostgreSQL e a porta direta da API escutam apenas em `127.0.0.1`.

Crie o primeiro administrador geral **uma única vez**. A senha temporária deve ter ao menos 12 caracteres e será trocada no primeiro acesso:

```powershell
$bootstrapEmail = Read-Host 'E-mail do administrador'
$bootstrapPassword = Read-Host 'Senha temporária (12+ caracteres)' -AsSecureString
$bootstrapPlain = [System.Net.NetworkCredential]::new('', $bootstrapPassword).Password
docker compose exec -e "BOOTSTRAP_EMAIL=$bootstrapEmail" -e "BOOTSTRAP_PASSWORD=$bootstrapPlain" api npm run db:bootstrap
Remove-Variable bootstrapPlain,bootstrapPassword
```

No primeiro acesso, crie a filial e seu administrador, depois os locais. Cadastre `Restaurante` e `Jerinana` quando fizerem parte do mapa físico. A criação de dados fictícios é opcional e usa uma filial separada:

```powershell
docker compose exec -e DEMO_SEED=true api npm run db:seed
```

Não use a filial de demonstração para importar a planilha real: a migração inicial só confirma em uma filial sem pessoas nem armários.

## Desenvolvimento local

Com o banco do Compose ativo, em PowerShell:

```powershell
npm ci
$env:DATABASE_URL = 'postgres://armarios:<senha-local>@localhost:5432/armarios'
$env:COOKIE_SECURE = 'false'
$env:DEVICE_SECRET_KEY = '<chave-aleatoria-de-32-caracteres-ou-mais>'
npm run db:migrate
npm run dev
```

O Vite abre em `http://localhost:5173` e encaminha `/api` para a API em `localhost:3001`. Para um banco novo, execute `npm run db:bootstrap` com `BOOTSTRAP_EMAIL` e `BOOTSTRAP_PASSWORD` no ambiente. Não coloque credenciais reais no código ou em comandos versionados.

## Operação e importação

- A aba `ARMÁRIOS` é a fonte da migração inicial. A prévia mostra todas as linhas, inclusive armários sem pessoa, para revisar local, números duplicados, capacidades e categorias sugeridas. Armários com identificação ou ocupação incerta ficam bloqueados para novas entradas. `DUPLO` propõe porte grande e capacidade 2, sem criar duas vagas permanentes. `MODIFICADO` é preservado como dado de origem, não como início da ocupação.
- A planilha fornecida contém **478 linhas para 477 números distintos**, com o número 360 duplicado. Há **515 células de fórmula sem resultado armazenado** nas colunas de nome, setor e função da aba `ARMÁRIOS`. A prévia mostra a localização de cada uma. Sugestões da aba `BANCO DE DADOS` só entram após confirmação explícita. Células sem correspondência única exigem valor revisado. Matrículas gravadas como número no XLSX podem ter perdido zeros à esquerda antes da importação; confira e corrija a fonte quando necessário.
- A atualização da TI aceita XLSX ou CSV de até 10 MB, com seleção de aba, linha de cabeçalho, colunas, codificação e delimitador. A confirmação exige declarar que o arquivo é a lista completa dos ativos da filial. Conflitos de matrícula manual são resolvidos individualmente. Ausência da TI gera pendência, sem liberar armário ou inativar cadastros manuais.
- Uma entrada em armário já ocupado exige motivo e previsão de compartilhamento. O limite de ocupantes é configurável. Liberações identificam a alocação específica. O painel não trata um armário grande ocupado como livre.
- A consulta offline exige autorização do navegador em **Administração**, autenticação online recente e cópia válida. O prazo é o término da sessão online, no máximo 24 horas desde o login. A cópia contém armários, ocupantes e pendências abertas. Logout apaga a cópia; a saída feita offline encerra a sessão no servidor ao reconectar. A Administração lista e revoga dispositivos; revogação recebida ao reconectar apaga a cópia. Alterações e exportações não funcionam offline. O navegador conserva a autorização do dispositivo após logout, mas precisa de novo login online para gerar uma nova cópia.

## Verificação

```powershell
npm run typecheck
npm run lint
npm run build
```

Os testes de integração exigem um banco isolado e migrado:

```powershell
docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_test;'
$env:DATABASE_URL = 'postgres://armarios:<senha-local>@localhost:5432/armarios_test'
npm run db:migrate
$env:COOKIE_SECURE = 'false'
npm run test
```

Os testes de navegador usam outro banco, `armarios_e2e`, Chrome ou Edge instalado e portas locais 3002/5174. A preparação cria somente pessoas fictícias e recria os dados desse banco:

```powershell
docker compose exec -T db psql -U armarios -d postgres -c 'CREATE DATABASE armarios_e2e;'
$env:DATABASE_URL = 'postgres://armarios:<senha-local>@localhost:5432/armarios_e2e'
npm run db:migrate
$env:E2E_DATABASE_URL = $env:DATABASE_URL
npm run test:e2e
$env:E2E_BROWSER_CHANNEL = 'msedge'
npm run test:e2e
```

Capturas da verificação visual ficam em `test-results/visual/` e não são versionadas. Não aponte os testes para um banco real: eles limpam as tabelas do banco isolado antes de executar.

## Backup e restauração

O serviço `backup` do Compose cria um dump PostgreSQL em `backups/` ao iniciar e a cada 24 horas, mantendo os últimos 30 dias. Essa pasta não entra no Git. Monitore o serviço e copie os dumps para armazenamento protegido fora do servidor; um backup só no mesmo disco não cobre perda da máquina.

```powershell
docker compose logs backup
$backup = Get-ChildItem .\backups -Filter *.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1
.\scripts\restore-test.ps1 -BackupFile $backup.FullName -DatabaseName armarios_restore_test
```

O script restaura em **outro banco** e imprime as contagens de filiais, armários, alocações, lotes e eventos. Para repetir o teste, escolha outro nome de banco ou remova o banco de teste de modo consciente. Nunca restaure por cima do banco operacional sem um procedimento de parada, cópia e validação separado.

## Empacotamento e limites de implantação

`docker compose build api web` gera as imagens. A publicação em produção exige hospedagem, domínio e HTTPS externo; configure `COOKIE_SECURE=true`, uma senha forte de PostgreSQL, chave de dispositivos própria e proteção do diretório de backups. O Compose deste repositório é uma base de execução integrada, sem contratação ou publicação automática.

O piloto de Caruaru depende da revisão humana dos dados legados. A aplicação não afirma que armários inconclusivos estão disponíveis. Chrome e Edge foram cobertos pelo fluxo de navegador automatizado; a operação com dados reais ainda exige aceite no PC da supervisão.

O `npm audit --omit=dev` ainda aponta dois avisos moderados para `uuid@8.3.2`, dependência transitiva do ExcelJS. A versão atual do ExcelJS usa `uuid.v4()` sem buffer no caminho encontrado no projeto; a correção definitiva depende de uma atualização compatível da biblioteca. Reavalie esses avisos antes da implantação.
