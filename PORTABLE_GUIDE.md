# Lockeris portátil para Windows

O pacote reúne o site, a API, Node.js 24 x64 e PostgreSQL 17 x64. Depois de gerado, inicia sem internet, Docker, instalação de serviços ou acesso de administrador. Use Windows 10/11 x64 e uma pasta em que o usuário possa gravar. Políticas corporativas podem bloquear executáveis; valide o pacote no computador da filial antes de usá-lo na operação.

## 1. Gerar o pacote no computador de preparação

1. No Windows x64, instale as dependências do repositório com `npm ci`.
2. Execute `npm run build:portable` na raiz. `npm run package:portable` é um alias.
3. Aguarde o build do site, contratos e API, os downloads e a instalação das dependências de produção. A saída completa será `dist-portable/Lockeris-Portable`.
4. Copie **a pasta inteira** para o pendrive. O computador de preparação precisa de internet para a primeira geração; o da filial não precisa.

Os binários usados são Node.js **24.21.0** e PostgreSQL **17.11-1**, ambos Windows x64. Fontes: [distribuição oficial do Node](https://nodejs.org/dist/v24.21.0/) e [binários PostgreSQL da EDB](https://www.enterprisedb.com/download-postgresql-binaries). O SHA-256 do Node é conferido contra o valor oficial fixado no script. O SHA-256 do arquivo PostgreSQL recebido é registrado em `BUILD_INFO.json` para identificar o artefato; esse registro não substitui uma assinatura do fornecedor.

Os ZIPs ficam em `.portable-cache/` e são reutilizados. Para posicioná-los manualmente, obtenha `node-v24.21.0-win-x64.zip` e `postgresql-17.11-1-windows-x64-binaries.zip` dessas fontes e copie para `.portable-cache/`. Também é possível informar os caminhos:

```powershell
npm run build:portable -- --node-zip="C:\Downloads\node-v24.21.0-win-x64.zip" --postgres-zip="C:\Downloads\postgresql-17.11-1-windows-x64-binaries.zip"
```

O instalador de dependências npm ainda precisa do registro ou de seu cache no computador de preparação. Na filial, nenhum download ou comando npm é necessário.

O build também baixa [Microsoft VCLibs x64](https://download.microsoft.com/download/4/7/c/47c6134b-d61f-4024-83bd-b9c9ea951c25/Microsoft.VCLibs.x64.14.00.Desktop.appx), verifica seu SHA-256 fixado e coloca as DLLs necessárias junto dos executáveis. O arquivo vai para `.portable-cache/Microsoft.VCLibs.x64.14.00.Desktop.appx`; para posicionamento manual, use `--msvc-appx="C:\Downloads\Microsoft.VCLibs.x64.14.00.Desktop.appx"`. Nenhum instalador Microsoft ou registro de pacote é executado. Referência técnica: [distribuição local de bibliotecas Visual C++](https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp?view=msvc-170).

Uma saída já existente nunca é sobrescrita. Para gerar outra versão, use:

```powershell
npm run build:portable -- --output-dir="dist-portable\Lockeris-Portable-Novo"
```

Em caso de erro, o build preserva os arquivos parciais em `dist-portable/.build-*` e não publica essa pasta como pacote completo. Não copie uma pasta parcial para uso.

## 2. Preparar o computador da filial

1. Copie `Lockeris-Portable` do pendrive para uma pasta local, por exemplo `C:\Users\SeuUsuario\Lockeris-Portable`. Prefira disco local a executar o banco diretamente no pendrive; evite pastas de rede ou sincronizadas.
2. Abra `config/.env.portable` no Bloco de Notas. A API usa `PORT=3001`; o banco usa `PGPORT=15432`. Se alguma porta estiver ocupada ou reservada pelo Windows, escolha outra porta livre, entre 1024 e 65535. O Docker existente pode ocupar `3001`.
3. Execute `INICIAR.bat` como usuário comum. Em um pacote novo, a primeira execução gera senhas locais, inicializa o banco, aplica as migrações e cria um administrador inicial. Em um pacote já preparado com dados, o banco e os usuários existentes são preservados. Aguarde a confirmação; o navegador abre automaticamente.
4. Em um pacote novo, para entrar, consulte `BOOTSTRAP_USERNAME` e a **última ocorrência** de `BOOTSTRAP_PASSWORD` em `config/.env.portable`; altere a senha no primeiro acesso. Em um pacote preparado, entre com uma conta já existente. Nas próximas execuções, usuários, senhas e registros são preservados.
5. Em um pacote novo, cadastre a filial e seus dados pela aplicação. Quando o pacote já vier preparado com os registros da filial, use os acessos existentes e confira as informações após o primeiro início.

As senhas geradas ficam apenas no pacote local. Proteja `config/.env.portable` e o diretório `data/` de um pacote com registros da filial; não compartilhe nem versione uma cópia em uso. `PGPASSWORD` autentica o banco existente: não o altere no arquivo sem alterar também a senha dentro do PostgreSQL. `BOOTSTRAP_PASSWORD` não redefine contas já criadas.

Na cópia portátil, a impressão usa as fontes alternativas locais já definidas no site; a importação opcional do Google Fonts é removida apenas dos arquivos empacotados para evitar consultas à internet.

Tudo fica restrito ao computador local. O endereço padrão é `http://localhost:3001`. Depois do início bem-sucedido, `Lockeris.url` acompanha a porta escolhida; copie esse arquivo para a Área de Trabalho se desejar. Se mudar a porta posteriormente, copie novamente o atalho atualizado. O atalho abre o site e requer que `INICIAR.bat` já tenha sido executado.

## 3. Encerrar e preservar os dados

1. Execute `PARAR.bat` da mesma pasta.
2. Aguarde a confirmação. O controlador fecha a API e suas conexões, encerra o processo Node da instância e solicita a parada do PostgreSQL com espera pelo desligamento. Sessões restantes do banco são desconectadas e transações em andamento são revertidas.
3. Só então remova o pendrive, copie a pasta ou desligue o computador. Fechar o navegador não encerra o sistema.

### 3.1 Backup automático

O pacote gera backups sozinho, sem internet e sem intervenção:

- **Diário:** com o sistema em uso, um `pg_dump` no formato nativo do PostgreSQL é gravado em `backups/lockeris-AAAA-MM-DD-HH-MM-SS.dump` uma vez por dia (e um primeiro backup cerca de um minuto após cada `INICIAR.bat`).
- **No encerramento:** cada `PARAR.bat` bem-sucedido grava um backup final antes de parar o banco, garantindo um retrato do último estado em uso.
- **Sob demanda:** `BACKUP.bat` cria um backup imediato a qualquer momento com o sistema iniciado.
- **Retenção:** arquivos com mais de 30 dias são removidos automaticamente de `backups/`. A pasta fica dentro do pacote; copie-a periodicamente para um local externo (pendrive ou rede) — cópia única no mesmo disco não protege contra falha do computador.

### 3.2 Restaurar um backup

Restauração substitui o conteúdo atual da base; confirme o arquivo antes de prosseguir e não deixe ninguém usando o sistema durante o processo.

1. Execute `INICIAR.bat` e aguarde o sistema ficar disponível (o banco precisa estar ativo).
2. No terminal da pasta, execute, em uma única linha, usando a porta `PGPORT` e o banco `PGDATABASE` de `config/.env.portable`:

```powershell
$env:PGPASSWORD=(Get-Content config\.env.portable | Select-String '^PGPASSWORD=').Line.Substring(10)
.\postgres\bin\pg_restore.exe -h 127.0.0.1 -p 15432 -U postgres -d lockeris --clean --if-exists .\backups\lockeris-AAAA-MM-DD-HH-MM-SS.dump
```

3. Se algo falhar no meio, repita o comando do zero; `--clean --if-exists` refaz a base por completo. Em caso de dúvida, use o backup de encerramento mais recente gerado pelo `PARAR.bat` — ele descreve o estado imediatamente anterior.

Para um backup físico integral (incluindo configuração e logs), continue podendo executar `PARAR.bat`, confirmar o encerramento e copiar **a pasta inteira**, incluindo `data/`, `config/` e `backups/`, para local protegido. Não copie `data/` enquanto o banco estiver ativo. As credenciais da cópia correspondem à base copiada.

Para atualizar, faça esse backup, gere um pacote novo e copie `data/` e `config/.env.portable` da versão anterior **já encerrada** para ele. Não misture executáveis ou dependências de versões diferentes. As migrações são aplicadas uma vez; depois de migrar, voltar apenas os arquivos da aplicação pode ser incompatível. Para retornar à versão anterior, restaure o backup completo feito antes da atualização. Este fluxo exige PostgreSQL 17 nas duas versões.

## 4. Estrutura e diagnóstico

```text
Lockeris-Portable/
├── node/                     Node.js portátil e npm do fornecedor
├── postgres/                 bin, lib e share do PostgreSQL
├── app/                      API compilada, migrações, contratos e site
│   ├── apps/api/dist/
│   ├── apps/api/migrations/
│   ├── apps/web/dist/
│   ├── packages/contracts/
│   ├── node_modules/         somente dependências de produção
│   └── launcher.mjs          controlador local
├── data/                     aparece no primeiro início ou já contém os dados preparados da filial
├── backups/                  backups automáticos em formato PostgreSQL (retenção de 30 dias)
├── config/.env.portable
├── INICIAR.bat
├── PARAR.bat
├── BACKUP.bat
├── Lockeris.url
├── PORTABLE_GUIDE.md
└── BUILD_INFO.json
```

`api.log` e `postgres.log` aparecem durante o uso. Consulte-os quando o início falhar. Não compartilhe logs sem revisar possíveis dados operacionais. Uma tentativa com porta ocupada informa o conflito; não encerra outros aplicativos. Executar INICIAR duas vezes reutiliza a instância existente. PARAR usa um canal local específico da pasta, sem encerrar todos os processos Node ou PostgreSQL do computador.

Se uma inicialização do banco falhar, uma pasta `.data-init-*` pode permanecer para diagnóstico; ela não é adotada como base. Se `data/` existir sem `PG_VERSION`, o início recusa sobrescrever a pasta. Preserve seu conteúdo antes de corrigir o problema. Após interrupção de energia, tente INICIAR novamente; o PostgreSQL recupera a base quando possível. Não apague `data/` nem `postmaster.pid` para forçar o início. Se o Node tiver sido interrompido, PARAR também pode encerrar o PostgreSQL pertencente àquela pasta.

Para validações automatizadas, `LOCKERIS_NO_BROWSER=1` evita abrir o navegador e `LOCKERIS_NO_PAUSE=1` elimina a pausa dos batches. Essas opções não são necessárias no uso normal.

## 5. Compatibilidade com o monorepo

Os comandos normais, Compose, Dockerfiles, migrações e bootstrap original são mantidos. A API só serve o site e vincula-se a `127.0.0.1` quando `PORTABLE_MODE=true`. O controlador carrega exclusivamente `config/.env.portable`, fixa o banco em `127.0.0.1` e não usa `DATABASE_URL` herdada do desenvolvimento. No modo normal, o site continua servido pelo contêiner web.

Antes de distribuir uma versão, execute `npm run typecheck`, `npm run lint` e `npm run test` com um banco de testes separado e migrado chamado `armarios_test`. Valide também: primeiro início, login, parada, reinício com persistência, duas chamadas de início, porta ocupada e pasta com espaços. O build valida os executáveis e o módulo nativo de senha no Windows; a aceitação no equipamento corporativo deve ser feita nesse equipamento.

O teste de aceitação automatizado usa as portas livres `3107` e `15433`. Gere uma saída separada e descartável, ainda sem `data/`, e execute:

```powershell
npm run build:portable -- --output-dir="dist-portable\Teste portátil Windows"
node scripts/portable/smoke.mjs "dist-portable\Teste portátil Windows"
```

O teste executa os dois batches, verifica conflitos de porta, início concorrente, login, troca de senha, migrações e persistência no reinício. Deixa o pacote de teste parado, com uma base sintética. **Não distribua esse pacote de teste**; gere uma saída nova para a filial.

Na validação local desta entrega, em 29/09/2026, o pacote foi gerado e executado em Windows x64 com usuário sem elevação, em uma pasta com espaços e acentos. O teste de aceitação confirmou os dois batches, conflitos de porta sem interromper outros serviços, início concorrente, 19 migrações, administrador único, site e API, login, troca de senha, parada com conexão HTTP pendente e reinício preservando registros, senha alterada e migrações. A validação no computador corporativo da filial continua necessária.
