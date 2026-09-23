# Piloto portátil da Gestão de Armários no Windows

**Data:** 2026-09-23

**Estado:** desenho aprovado em conversa; aguardando revisão deste documento

**Alvo:** um PC da supervisão com Windows 10 ou 11 de 64 bits, sem Docker e sem instalação com privilégios de administrador

## Objetivo e critérios de sucesso

O primeiro piloto deve permitir demonstrar e testar a aplicação completa no próprio computador da empresa, sem contratar hospedagem, manter um servidor externo ligado ou instalar Docker, Node.js ou PostgreSQL no sistema. O operador copia um pacote para uma pasta, abre **Iniciar Armários** e usa o navegador. O armazenamento permanece nesse PC entre fechamentos e substituições da pasta do programa.

O repositório já contém a aplicação React/Fastify/PostgreSQL e as regras de negócio da v1. Esta entrega adapta a execução e a apresentação para o piloto local. A hospedagem futura continua possível, mas sua implantação não faz parte deste trabalho. A migração da planilha real depende de conferência humana; o pacote não conterá dados reais nem apresentará registros inconclusivos como vagas livres.

## Alternativas consideradas

| Abordagem | Efeito | Decisão |
|---|---|---|
| Node.js e PostgreSQL portáteis junto da aplicação | Preserva `pg`, as migrações SQL, transações e regras de concorrência já implementadas. Exige empacotar e testar os binários no Windows. | **Escolhida.** Menor alteração no domínio e maior fidelidade à aplicação existente. |
| PostgreSQL em WebAssembly ou banco embutido | Reduz processos externos, mas exige adaptar a conexão, validar todas as consultas SQL e repetir testes de transação e concorrência. | Adiada. |
| Aplicação só no navegador | Simplifica a cópia de arquivos, mas exige reescrever persistência, autenticação e operações, com limitações de armazenamento local. | Descartada para o piloto. |

A distribuição usará versões suportadas de Node.js 24 LTS e PostgreSQL 17 para Windows x64. O processo de montagem fixará versões exatas, origem e hashes dos arquivos. A [página de lançamentos do Node.js](https://nodejs.org/en/about/previous-releases) identifica a linha 24 como LTS; a [página oficial do PostgreSQL para Windows](https://www.postgresql.org/download/windows/) indica a disponibilidade de binários em ZIP sem instalador. A compatibilidade efetiva com o PC da empresa será medida no teste presencial.

## Arquitetura do pacote

O artefato de entrega é um ZIP para Windows x64. Contém o frontend compilado, a API compilada, suas dependências de produção, migrações SQL, executáveis portáteis de Node.js e PostgreSQL, scripts de início/parada, utilitários de backup e restauração, um manifesto de versão e instruções curtas. Não contém banco inicializado, senhas, arquivos reais ou backups reais. Nenhuma dependência será baixada durante o uso no PC da empresa.

O iniciador executa processos **locais enquanto a aplicação está em uso**: PostgreSQL, API Fastify e navegador padrão. Não registra serviço do Windows. A API também serve os arquivos estáticos do frontend no mesmo endereço, eliminando a necessidade de Vite e Nginx no pacote. A aplicação atende somente em `http://127.0.0.1:8765`, numa porta fixa para manter estável a origem do navegador e da PWA. O banco aceita apenas conexões de loopback em `127.0.0.1:54329`, com credencial própria gerada na primeira execução. O modo Docker para desenvolvimento/implantação futura continua disponível.

O operador inicia e para o pacote por executáveis `Iniciar Armários.exe` e `Parar Armários.exe`, sem PowerShell obrigatório. Esses iniciadores chamam os binários portáteis incluídos; o formato final deve ser comprovado no Windows sem instalação. Se o ambiente corporativo bloquear essa execução, o bloqueio deve ser registrado como limitação verificada, sem afirmar que o piloto passou.

## Primeira abertura e dados

Na primeira abertura, o iniciador verifica Windows x64, binários, pasta gravável e portas locais; inicializa o cluster PostgreSQL na pasta de dados do usuário; gera credenciais locais; aplica as migrações; e abre um fluxo para criar o primeiro administrador geral. O fluxo inicial funciona apenas quando não há usuários, exige uma senha final de pelo menos 12 caracteres e usa um código de uso único apresentado no iniciador. Depois da criação, o código é invalidado. Não há credencial padrão no ZIP nem cadastro público.

Os dados persistentes ficam em `%LOCALAPPDATA%\Armarios\` (banco, configuração privada, logs técnicos e backups), separados da pasta copiada do programa. Este desenho pressupõe um único perfil do Windows no PC piloto: outro usuário do Windows terá outra pasta de dados. O pacote cria duas filiais distintas: uma demonstração com dados **fictícios**, suficiente para mostrar ocupação individual, compartilhamento, promotor, rotativo e pendências; e **Caruaru vazia**, pronta para a migração conferida. Reabrir ou atualizar o pacote não recria essas filiais nem duplica dados.

O arquivo `Controle de Armários.xlsx` não será incorporado ao ZIP. Sua importação permanece explícita, com prévia e revisão dos conflitos já exigidas pela v1. Dados, arquivos importados, segredos e backups continuam fora do Git.

## Abertura, falhas e encerramento

O iniciador impede duas instâncias do pacote sobre o mesmo banco, verifica se as portas são livres e distingue um processo próprio de um processo desconhecido. Só abre o navegador após banco, migrações e `/api/health` responderem. Falhas de escrita, binário ausente, porta ocupada, inicialização, migração e API devem produzir mensagens em português com uma ação possível e um identificador técnico. Os logs evitam nomes, matrículas, senhas e conteúdo integral de planilhas.

**Parar Armários** encerra primeiro a API e depois o PostgreSQL de forma ordenada. Fechar a aba não apaga dados nem encerra automaticamente os processos; desligar o Windows segue a recuperação normal do PostgreSQL. Em caso de falha de migração ao atualizar o pacote, o navegador não abre sobre estado parcialmente pronto; o backup anterior e o erro ficam disponíveis para recuperação. O pacote não tentará restaurar automaticamente um backup por cima do banco operacional.

As rotas de negócio mantêm autenticação, permissões por filial, sessões e CSRF. O uso em `http://127.0.0.1` requer configuração local explícita do cookie, preservando o comportamento seguro para uma futura implantação HTTPS. A consulta PWA existente continua subordinada às regras de sessão e autorização de dispositivo; o piloto funciona sem internet porque aplicação e banco estão no próprio PC.

## Backup e atualização

Um `pg_dump` em formato customizado será criado diariamente enquanto a aplicação estiver em execução; ao abrir, o iniciador faz o backup do dia caso ele ainda não exista. Antes de uma atualização que aplique migrações, cria também um backup identificado como pré-atualização. Manter inicialmente os últimos 30 dias de backups diários na pasta de dados; backups pré-atualização ficam sujeitos à mesma retenção após a atualização bem-sucedida. Incluir comando documentado para copiar um backup para mídia ou pasta escolhida pelo operador e procedimento de restauração **em banco separado**, validando filiais, pessoas, armários, alocações, lotes e eventos. Backup no mesmo disco não protege contra perda física do PC; isso deve constar das instruções.

Atualizar significa parar a aplicação e substituir a pasta do programa pelo novo ZIP. O iniciador mantém a pasta de dados, confere a versão do esquema e aplica apenas migrações pendentes. Antes de alterar o esquema, cria backup. O processo recusa abrir com esquema de versão posterior à aplicação e informa a versão necessária. Não há sincronização entre computadores na v1.

## Interfaces e documentação afetadas

- Criar montagem reproduzível do ZIP e iniciadores de abrir/parar, com verificação de integridade dos binários incluídos.
- Servir o frontend compilado pela API no modo portátil; manter `/api` e o modo de desenvolvimento atuais.
- Acrescentar o fluxo seguro de primeiro administrador e provisionamento idempotente das filiais inicial/demonstração.
- Criar orquestração local do banco, configuração privada, migração, backup e atualização, sem alterar as regras de armários, pessoas e importações.
- Colocar no README o caminho portátil como primeiro procedimento de uso local; manter Docker como opção de desenvolvimento e futura hospedagem.
- Documentar origem/licenças dos binários redistribuídos, versões e hashes no manifesto da distribuição.

## Verificação e aceite

O ZIP será testado após cópia para uma pasta isolada, sem depender de `node_modules`, Docker, banco ou variáveis do repositório. O teste cobre primeira abertura sem administrador do Windows; criação de acesso; Chrome e Edge; login; painel; armário compartilhado; cadastro de promotor; uso rotativo; prévia da TI; pendências; e uma prévia de migração com dados fictícios. Também cobre fechamento e reabertura com dados preservados, porta ocupada, segundo início, falha de inicialização, atualização sem perda do banco, backup e restauração em banco separado.

Rodar verificação de tipos, lint, testes de regras/integração e testes de navegador existentes. Acrescentar testes dos novos fluxos de inicialização, primeira conta e empacotamento onde houver risco real de regressão. Dados automatizados e capturas usam apenas identidades fictícias. A aceitação no PC da empresa exige um teste presencial de abertura e operação: política de execução, antivírus e componentes do Windows podem variar. Registrar o resultado observado e qualquer bloqueio, sem apresentar compatibilidade não verificada como fato.

## Fora do escopo deste piloto

Hospedagem, domínio público, instalação como serviço do Windows, execução em rede para vários PCs, sincronização entre instalações, integração automática com a TI e importação automática da planilha real. As regras da v1 sobre identidades, ocupações, compartilhamento, importação revisada e histórico permanecem válidas.
