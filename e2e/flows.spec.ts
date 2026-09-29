import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {createHash,randomBytes} from 'node:crypto';

async function createAdminAlias(pool:Pool,username:string){await pool.query(`INSERT INTO users(username,password_hash,role,branch_id,must_change_password)
  SELECT $1,password_hash,role,branch_id,false FROM users WHERE username='e2e'`,[username]);}

const noticeDialog=(page:Page)=>page.locator('.app-dialog:has(#app-dialog-title)');
async function expectNotice(page:Page,text:string|RegExp){await expect(noticeDialog(page).locator('#app-dialog-title')).toContainText(text);}
async function closeNotice(page:Page){
  await noticeDialog(page).getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(noticeDialog(page)).toHaveCount(0);
}

test('login, painel, compartilhamento, cadastro, TI, pendências e administração',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  await page.goto('/');
  await expect(page).toHaveTitle('Lockeris — Plataforma Integrada de Alocação e Armários');
  await expect(page.getByText('LOCKERIS',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Entrar'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/01-login.png'});
  await page.getByLabel('Nome de usuário').fill('e2e');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.sidebar .brand')).toContainText('Lockeris');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await expect(page.getByText('3 resultados')).toBeVisible();
  await page.screenshot({path:'test-results/visual/02-painel.png'});
  await page.getByRole('button',{name:/102/}).click();
  await expect(page.getByRole('heading',{name:'Armário Nº 102'})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Ana Exemplo',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Bia Fictícia',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/visual/03-compartilhado.png'});
  await page.getByRole('dialog').getByRole('button',{name:'Fechar'}).click();
  await page.getByRole('button',{name:'Colaboradores'}).click();
  await page.getByRole('heading',{name:'Cadastrar pessoa externa'}).scrollIntoViewIfNeeded();
  const registrationForm=page.locator('form.form-grid');
  await registrationForm.getByLabel('Nome',{exact:true}).fill('Promotora Teste');
  await registrationForm.getByLabel('Categoria').selectOption({label:'Terceirizado'});
  await registrationForm.getByLabel('Empresa / marca').fill('Delta Climatização');
  await registrationForm.getByLabel('Precisa de armário fixo').check();
  await page.getByLabel('Matrícula',{exact:true}).last().fill('0003');
  await page.getByRole('button',{name:'Salvar cadastro'}).click();
  await expect(page.getByText('Promotora Teste').first()).toBeVisible();
  await expectNotice(page,'Cadastro salvo.');
  await closeNotice(page);
  await page.screenshot({path:'test-results/visual/04-promotor.png'});
  await page.getByRole('button',{name:'Importações'}).click();
  await page.getByLabel('Arquivo de colaboradores, XLSX ou CSV').setInputFiles({name:'ti.csv',mimeType:'text/csv',buffer:Buffer.from('MATRÍCULA;NOME;SETOR;FUNÇÃO\r\n0001;Ana Exemplo;Loja;Operadora\r\n0002;Bia Fictícia;Loja;Operadora\r\n')});
  await page.getByLabel('Delimitador do CSV').selectOption(';');
  await page.getByRole('button',{name:'Ler arquivo'}).click();
  await expect(page.getByRole('heading',{name:'Colunas da planilha'})).toBeVisible();
  await page.getByRole('button',{name:'Comparar com a base atual'}).click();
  await page.getByRole('heading',{name:'Conferir atualização de colaboradores'}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading',{name:'Conferir atualização de colaboradores'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/05-previa-ti.png'});
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('ARMÁRIOS');
  sheet.addRow(['N°','NOME','MATRÍCULA','STATUS','DUPLO','SETOR','FUNÇÃO']);
  sheet.addRow(['501','','','DISPONÍVEL',false,'','']);
  await page.getByLabel('Planilha de armários').setInputFiles({name:'Armarios.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await workbook.xlsx.writeBuffer())});
  await page.getByRole('button',{name:'Conferir armários'}).click();
  await expect(page.getByRole('heading',{name:'Conferir carga inicial'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'501'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/05b-previa-migracao.png'});
  await page.getByRole('button',{name:'Pendências',exact:true}).click();
  await page.getByRole('tab',{name:/Pessoas/}).click();
  await expect(page.getByRole('heading',{name:'Promotora Teste'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/06-pendencias.png'});
  await page.locator('.pending-item').filter({hasText:'Promotora Teste'}).getByRole('button',{name:'Conferir dados'}).click();
  await page.getByRole('dialog').getByLabel('Armário disponível').selectOption({label:'Armário 101'});
  await page.getByRole('dialog').getByLabel('Cópia da chave').selectOption('sim');
  await page.getByRole('dialog').getByLabel('Conferi os dados acima').check();
  await page.getByRole('dialog').getByRole('button',{name:'Atribuir armário'}).click();
  await expectNotice(page,'atribuído a');
  await closeNotice(page);
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.getByRole('heading',{name:'Acessos'})).toBeVisible();
  await page.getByRole('searchbox',{name:'Buscar pelo número do armário'}).fill('101');
  await expect(page.getByText('1 de 3 armários')).toBeVisible();
  await page.locator('.admin-locker-table').focus();
  await page.keyboard.press('ArrowDown');
  await page.screenshot({path:'test-results/visual/07-admin-busca.png'});
  await page.getByRole('button',{name:'Sobre o Lockeris'}).click();
  await page.getByRole('button',{name:'Novidades e Versões'}).click();
  await expect(page.getByRole('heading',{name:'Entregas do Lockeris'})).toBeVisible();
  await expect(page.getByText('Ajustes de regras e proteção')).toBeVisible();
  await expect(page.locator('.about-release-items li').first()).toBeVisible();
  await page.screenshot({path:'test-results/visual/08-novidades.png'});
});

test('operador vê histórico de trocas sem funções administrativas',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query(`INSERT INTO users(username,password_hash,role,branch_id,must_change_password)
      VALUES('operador-e2e',$1,'operador',$2,false)
      ON CONFLICT (lower(username)) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
      [await argon2.hash('Operator-Password-123',{type:argon2.argon2id}),branch.id]);
  }finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('operador-e2e');
  await page.getByLabel('Senha').fill('Operator-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByRole('button',{name:'Importações'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Histórico'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Administração'})).toHaveCount(0);
  await page.getByRole('button',{name:'Transferências'}).click();
  await expect(page.getByRole('heading',{name:'Histórico de trocas de armário'})).toBeVisible();
});

test('painel distingue livre, ocupado e pendente',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{
    await pool.query("UPDATE lockers SET migration_status='inconclusivo' WHERE number='101'");
    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
      SELECT id,'103','padrao',1,'fixo' FROM branches WHERE name='Caruaru Demonstração'`);
    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality)
      SELECT id,'104','padrao',2,true,'fixo' FROM branches WHERE name='Caruaru Demonstração'`);
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    const semArmario=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Promotora Sem Armário') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed)
      VALUES($1,$2,'promotor_fixo','manual','0099',true)`,[semArmario.id,branch.id]);
    await createAdminAlias(pool,'e2e-status');
  }finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e-status');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.locker-tile').filter({hasText:'101'})).toHaveClass(/has-pending/);
  await expect(page.locator('.locker-tile').filter({hasText:'102'})).toHaveClass(/occupied/);
  const occupiedBg=await page.locator('.locker-tile').filter({hasText:'102'}).evaluate(el=>getComputedStyle(el).backgroundImage);
  const freeBg=await page.locator('.locker-tile').filter({hasText:'103'}).evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(occupiedBg).toContain('linear-gradient');
  expect(occupiedBg).not.toBe(freeBg);
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).toHaveClass(/free/);
  await expect(page.locator('.locker-tile').filter({hasText:'104'})).toContainText('Duplo');
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).not.toContainText(/Padrão|Grande|Simples/);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 12','№ 101','№ 102','№ 103','№ 104']);
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Painel da filial'})).toBeVisible();
  await expect(page.locator('.kpi-grid .kpi-card')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Ver armários',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ver pessoas sem armário',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Resolver pendências',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ver duplos',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ver chaves',exact:true})).toBeVisible();
  await expect(page.locator('.kpi-card--unassigned')).toContainText('Colaboradores sem Armário');
  await expect(page.locator('.kpi-card--unassigned .kpi-value')).toHaveText('1');
  await expect(page.locator('.kpi-card--unassigned')).toContainText('Pessoas ativas aguardando vaga');
  await expect(page.locator('.kpi-card--alert')).toContainText('Ação necessária');
  await expect(page.getByRole('heading',{name:'Ranking de ocupação por setor'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Pessoas por vínculo'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Movimentações e atividade'})).toBeVisible();
  await page.setViewportSize({width:1920,height:934});
  await page.screenshot({path:'test-results/visual/09-dashboard-completo.png',animations:'disabled'});
  await page.getByRole('switch',{name:'Modo escuro'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:'test-results/visual/10-dashboard-completo-escuro.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.sidebar')).toHaveCSS('visibility','hidden');
  await page.screenshot({path:'test-results/visual/11-dashboard-completo-mobile.png',fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('switch',{name:'Modo escuro'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.kpi-card--occupancy')).toContainText('3 vagas livres');
  await page.getByRole('button',{name:'Ver armários',exact:true}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(2);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 103','№ 104']);
  await page.getByRole('button',{name:'Pendentes',exact:true}).click();
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 101']);
  await page.getByRole('combobox',{name:'Situação',exact:true}).click();
  await page.locator('.select-menu').getByRole('option',{name:'Livres',exact:true}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(2);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 103','№ 104']);
  await page.getByRole('combobox',{name:'Situação',exact:true}).click();
  await page.locator('.select-menu').getByRole('option',{name:'Todas',exact:true}).click();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.locator('.kpi-card--unassigned')).toBeVisible();
  await page.getByRole('button',{name:'Ver pessoas sem armário',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Colaboradores e outras pessoas'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sem armário',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.people-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.people-table tbody tr')).toContainText('Promotora Sem Armário');
  await expect(page.locator('.people-table .status-badge--warning').first()).toHaveText('Sem armário');
  await page.locator('.people-table tbody tr').click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Promotora Sem Armário'})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Sem armário',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Colaboradores',exact:true}).click();
  const personDialog=page.getByRole('dialog');
  await page.locator('.people-table tbody tr').filter({hasText:'Ana Exemplo'}).click();
  await expect(personDialog.getByRole('heading',{name:'Ana Exemplo'})).toBeVisible();
  await personDialog.getByLabel('Armário de destino').selectOption({label:'Armário 103'});
  await expect(personDialog.locator('.action-summary')).toContainText('Ana Exemplo, armário 102 → 103');
  await personDialog.getByLabel('Cópia da chave').selectOption('nao');
  await personDialog.getByLabel('Motivo da transferência').fill('Melhor altura');
  await personDialog.getByRole('button',{name:'Transferir armário',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar'}).click();
  await expectNotice(page,'transferido');
  const transferBounds=await noticeDialog(page).evaluate(element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});
  expect(transferBounds.top).toBeGreaterThanOrEqual(0);
  expect(transferBounds.bottom).toBeLessThanOrEqual(900);
  await closeNotice(page);
  await page.getByRole('button',{name:'Armários',exact:true}).click();
  await page.locator('.locker-tile').filter({hasText:'103'}).click();
  await expect(page.getByRole('dialog').getByText('Ana Exemplo',{exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Fechar'}).click();
  await page.getByRole('combobox',{name:'Filtrar por cópia da chave',exact:true}).click();
  await page.locator('.select-menu').getByRole('option',{name:'Sem cópia',exact:true}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(1);
  await page.screenshot({path:'test-results/visual/09-status-armarios.png'});
});

test('estados de navegação, busca vazia e movimento reduzido',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{const user=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='e2e'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),user.id,digest(csrf)]);
    await pool.query("INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) SELECT id,$1,'ocupacao_transferida','allocation',NULL,$2 FROM branches WHERE name='Caruaru Demonstração'",[user.id,JSON.stringify({reason:'Conferência de teste'})]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  const themeSwitch=page.getByRole('switch',{name:'Modo escuro'});
  await expect(themeSwitch).toHaveAttribute('aria-checked','false');
  await themeSwitch.click();
  await expect(themeSwitch).toHaveAttribute('aria-checked','true');
  await page.reload();
  await expect(page.getByRole('switch',{name:'Modo escuro'})).toHaveAttribute('aria-checked','true');
  await page.getByRole('switch',{name:'Modo escuro'}).click();
  await expect(page.getByRole('switch',{name:'Modo escuro'})).toHaveAttribute('aria-checked','false');
  await page.getByLabel('Buscar armário, nome ou matrícula').fill('sem resultado 999');
  await expect(page.getByText('Nenhum armário encontrado')).toBeVisible();
  await page.getByLabel('Buscar armário, nome ou matrícula').fill('');
  await page.locator('.locker-tile').first().click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Fechar'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.locker-tile').first()).toBeFocused();
  await page.getByRole('button',{name:'Armários',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Colaboradores'})).toBeFocused();
  await page.getByRole('button',{name:'Transferências'}).click();
  await page.screenshot({path:'test-results/visual/14-transferencias.png'});
  await page.getByRole('button',{name:'Histórico'}).click();
  const timeline=page.getByRole('list',{name:'Linha do tempo de eventos'});
  await expect(timeline).toBeVisible();
  await expect(timeline.getByRole('listitem').filter({hasText:'Conferência de teste'})).toHaveCount(1);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.screenshot({path:'test-results/visual/15-historico.png'});
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.getByRole('heading',{name:'Acessos'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Setor ocupante'})).toHaveCount(0);
  await page.screenshot({path:'test-results/visual/16-administracao.png'});
  await page.getByRole('button',{name:'Redefinir senha'}).first().click();
  await expect(page.getByLabel(/Nova senha temporária para/)).toBeVisible();
  await page.getByRole('button',{name:'Cancelar'}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.getByRole('button',{name:'Armários',exact:true}).click();
  await page.waitForTimeout(250);
  await expect(page.locator('.topbar-brand')).toBeVisible();
  await expect(page.locator('.topbar-brand')).toContainText('Lockeris');
  await page.screenshot({path:'test-results/visual/17-armarios-mobile.png',fullPage:true});
  for(const [label,file] of [['Colaboradores','18-colaboradores-mobile'],['Pendências','19-pendencias-mobile'],
    ['Transferências','20-transferencias-mobile'],['Importações','21-importacoes-mobile'],
    ['Histórico','22-historico-mobile'],['Administração','23-administracao-mobile']] as const){
    await page.getByRole('button',{name:'Abrir menu'}).click();
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.getByRole('heading',{name:label,level:1})).toBeVisible();
    if(label==='Administração')await expect(page.getByRole('heading',{name:'Acessos'})).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({path:`test-results/visual/${file}.png`,fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.getByRole('button',{name:'Armários',exact:true}).click();
  expect(await page.locator('.locker-tile').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(.01);
});

test('armário 477 abre no ponto atual e o aviso fica visível',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
    SELECT b.id,n::text,'padrao',1,'fixo' FROM branches b CROSS JOIN generate_series(1,477) n
    WHERE b.name='Caruaru Demonstração' ON CONFLICT(branch_id,number) DO NOTHING`);
    await pool.query(`UPDATE lockers SET is_double=true,capacity=2 WHERE number='477' AND branch_id IN
      (SELECT id FROM branches WHERE name='Caruaru Demonstração')`);
    await createAdminAlias(pool,'e2e-477');}finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e-477');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(477);
  await expect(page.locator('.locker-tile .tile-top strong').first()).toHaveText('№ 1');
  await expect(page.locator('.locker-tile .tile-top strong').last()).toHaveText('№ 477');
  await page.locator('.locker-tile').last().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Armário Nº 477'})).toBeVisible();
  await expect(dialog.getByText('Caruaru Demonstração')).toBeVisible();
  await expect(dialog.getByLabel('Número do armário')).toHaveCount(0);
  await expect(dialog.getByLabel('Existe cópia da chave?')).toBeChecked();
  await page.screenshot({path:'test-results/visual/11-edicao-armario.png'});
  await expect(dialog.getByLabel('Armário duplo')).toHaveCount(0);
  await expect(dialog.locator('.static-value').first()).toContainText('Duplo');
  await dialog.getByLabel('Existe cópia da chave?').uncheck();
  await dialog.getByRole('button',{name:'Salvar dados do armário'}).click();
  await expectNotice(page,'Informações do armário');
  const bounds=await noticeDialog(page).evaluate(element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(900);
  await closeNotice(page);
  await page.locator('.locker-tile').last().click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Armário Nº 477'})).toBeVisible();
  await expect(page.getByRole('dialog').locator('.double-badge')).toHaveCount(2);
  await expect(page.getByRole('dialog').getByLabel('Existe cópia da chave?')).not.toBeChecked();
});

test('pendências de armários seguem ordem numérica e abrem conferência',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{await pool.query(`UPDATE lockers SET migration_status='inconclusivo' WHERE number IN ('12','101');
    INSERT INTO pending_items(branch_id,kind,subject_type,subject_id)
    SELECT branch_id,'migracao_inconclusiva','locker',id FROM lockers WHERE number IN ('12','101')
    ON CONFLICT(branch_id,kind,subject_type,subject_id) DO UPDATE SET state='aberta';
    UPDATE memberships SET department='Restaurante FC revisado' WHERE registration IN ('0001','0002')`);
    await createAdminAlias(pool,'e2e-pending');}finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e-pending');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await page.getByRole('button',{name:'Pendências',exact:true}).click();
  await expect(page.locator('.pending-item h3')).toHaveText(['Armário 12','Armário 101']);
  await page.locator('.pending-item').first().getByRole('button',{name:'Conferir dados'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Armário 12'})).toBeVisible();
  await expect(dialog.getByText('Matrícula',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/visual/10-conferencia.png'});
  await expect(dialog.getByRole('button',{name:'Concluir conferência'})).toBeDisabled();
  await dialog.getByLabel('Conferi os dados acima').check();
  await expect(dialog.getByRole('button',{name:'Concluir conferência'})).toBeEnabled();
  await dialog.getByLabel('Cadastrar ocupante').check();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).click();
  await expect(dialog.locator('.combobox-menu .combobox-option')).toHaveCount(2);
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0001');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Ana Exemplo');
  await dialog.getByLabel('Cadastrar ocupante').uncheck();
  await dialog.getByRole('combobox',{name:'Setor ocupante',exact:true}).click();
  await dialog.locator('.select-menu .select-option',{hasText:'Restaurante FC revisado'}).click();
  await dialog.getByRole('button',{name:'Salvar correções'}).click();
  await expectNotice(page,'Informações do armário');
  await closeNotice(page);
  await page.locator('.pending-item').first().getByRole('button',{name:'Conferir dados'}).click();
  await expect(page.getByRole('dialog').getByRole('combobox',{name:'Setor ocupante',exact:true})).toContainText('Restaurante FC revisado');
  await page.getByRole('dialog').getByLabel('Conferi os dados acima').check();
  await page.getByRole('dialog').getByRole('button',{name:'Concluir conferência'}).click();
  await expectNotice(page,'concluída com sucesso');
  await closeNotice(page);
  await page.getByRole('combobox',{name:'Exibir',exact:true}).click();
  await page.locator('.select-menu').getByRole('option',{name:'Resolvidas',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Histórico de pendências resolvidas'})).toBeVisible();
  await expect(page.locator('.pending-item').filter({hasText:'Armário 12'})).toContainText('Motivo: Os dados importados deste armário precisavam de conferência.');
  await expect(page.locator('.pending-item').filter({hasText:'Armário 12'})).toContainText('Resolução: Os dados do armário foram conferidos.');
  await page.screenshot({path:'test-results/visual/12-pendencias-resolvidas.png'});
});

test('card troca matrícula e permite segundo ocupante em armário duplo',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query("INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality) VALUES($1,'500','padrao',2,true,'fixo')",[branch.id]);
    for(const [registration,name] of [['0004','Dora Oficial'],['0005','Eva Oficial']]){
      const person=(await pool.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[name])).rows[0];
      await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
        VALUES($1,$2,'colaborador','ti',$3,'Loja','Operadora',true,true)`,[person.id,branch.id,registration]);
    }
    await createAdminAlias(pool,'e2e-card');
    const user=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='e2e-card'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(token),user.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await page.getByLabel('Buscar armário, nome ou matrícula').fill('500');
  await page.locator('.locker-tile').filter({hasText:'500'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Armário duplo')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Cadastrar ocupante'}).click();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).click();
  await expect(dialog.locator('.combobox-menu .combobox-option')).toHaveCount(4);
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0004');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Dora Oficial');
  await page.screenshot({path:'test-results/visual/13-edicao-matricula.png'});
  await dialog.getByRole('button',{name:'Salvar ocupante'}).click();
  await expect(page.getByRole('alertdialog').getByRole('heading',{name:'Informações do armário'})).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(dialog.locator('.occupant-slot').filter({hasText:'Dora Oficial'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Adicionar 2º ocupante'})).toBeVisible();
  await dialog.getByRole('button',{name:'Adicionar 2º ocupante'}).click();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0005');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Eva Oficial');
  await dialog.getByRole('button',{name:'Salvar ocupante'}).click();
  await expect(page.getByRole('alertdialog').getByRole('heading',{name:'Informações do armário'})).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(dialog.locator('.list-row')).toHaveCount(2);
  await page.screenshot({path:'test-results/visual/16-ocupantes-duplos.png'});
  await dialog.getByRole('button',{name:'Editar Dora Oficial'}).click();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('');
  await expect(dialog.getByLabel('Nome',{exact:true})).toBeEnabled();
  await dialog.getByLabel('Nome',{exact:true}).fill('Pessoa conferida');
  await dialog.getByRole('button',{name:'Salvar ocupante'}).click();
  await expect(page.getByRole('alertdialog').getByRole('heading',{name:'Informações do armário'})).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(dialog.getByText('Pessoa conferida',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Eva Oficial',{exact:true})).toBeVisible();
});

test('admin rola 477 armários e limpa somente a cópia legada',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
      SELECT $1,number::text,'padrao',1,'fixo' FROM generate_series(1000,1476) number`,[branch.id]);
    await createAdminAlias(pool,'e2e-scroll');
    const user=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='e2e-scroll'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),user.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await page.getByRole('button',{name:'Administração'}).click();
  const table=page.locator('.admin-locker-table');
  await expect(table).toBeVisible();
  expect(await table.evaluate(element=>element.scrollHeight>element.clientHeight&&getComputedStyle(element).maxHeight==='480px')).toBe(true);
  await table.focus();await page.keyboard.press('ArrowDown');
  expect(await table.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('searchbox',{name:'Buscar pelo número do armário'}).fill('1476');
  await expect(page.getByText(/1 de \d+ armários/)).toBeVisible();
  await page.evaluate(async()=>{
    localStorage.setItem('armarios-theme','dark');
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('armarios-offline',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put('legado','device');tx.objectStore('state').put({legacy:true},'copy');tx.objectStore('state').put('preservar','other');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    });
  });
  await page.reload();
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  expect(await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('armarios-offline',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    return await new Promise(resolve=>{const tx=db.transaction('state','readonly'),store=tx.objectStore('state');const result:Record<string,unknown>={theme:localStorage.getItem('armarios-theme')};for(const key of ['device','copy','other']){const request=store.get(key);request.onsuccess=()=>{result[key]=request.result;};}tx.oncomplete=()=>{db.close();resolve(result);};});
  })).toEqual({theme:'dark',device:undefined,copy:undefined,other:'preservar'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.locator('.admin-locker-table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('admin exclui um acesso pela lista e altera a própria senha pelo cabeçalho',async({page})=>{
  test.setTimeout(120000);
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query(`INSERT INTO users(username,password_hash,role,branch_id,must_change_password)
      VALUES('temporario-e2e',$1,'operador',$2,false)
      ON CONFLICT (lower(username)) DO UPDATE SET branch_id=EXCLUDED.branch_id,must_change_password=false`,
      [await argon2.hash('Senha-Temporaria-123',{type:argon2.argon2id}),branch.id]);
    const admin=(await pool.query<{id:string}>("SELECT id FROM users WHERE lower(username)='e2e'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),admin.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.getByRole('heading',{name:'Acessos'})).toBeVisible();
  const row=page.locator('.list-row').filter({hasText:'temporario-e2e'});
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Excluir',exact:true}).click();
  const confirmation=page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Tem certeza que deseja excluir o utilizador temporario-e2e? Esta ação não poderá ser desfeita.');
  await confirmation.getByRole('button',{name:'Confirmar'}).click();
  await expectNotice(page,'Acesso de temporario-e2e excluído.');
  await closeNotice(page);
  await expect(row).toHaveCount(0);
  await page.getByRole('button',{name:'Conta de e2e'}).click();
  await page.getByRole('menuitem',{name:'Alterar senha'}).click();
  const modal=page.getByRole('dialog');
  await expect(modal.getByRole('heading',{name:'Alterar senha'})).toBeVisible();
  await modal.getByLabel('Senha atual').fill('Senha-Errada-123');
  await modal.getByLabel('Nova senha',{exact:true}).fill('Nova-Senha-E2e-123');
  await modal.getByLabel('Confirmar nova senha',{exact:true}).fill('Nova-Senha-E2e-123');
  await modal.getByRole('button',{name:'Salvar nova senha'}).click();
  await expect(modal.getByRole('alert')).toHaveText('Senha atual inválida',{timeout:30000});
  await modal.getByLabel('Senha atual').fill('Testing-Password-123');
  await modal.getByRole('button',{name:'Salvar nova senha'}).click();
  await expect(modal).toHaveCount(0);
  await expectNotice(page,'Senha alterada com sucesso.');
  await closeNotice(page);
});

test('seleção em lote alterna marcações e alinha verticalmente as células da tabela',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query(`INSERT INTO users(username,password_hash,role,branch_id,must_change_password)
      VALUES('e2e-select',$1,'filial_admin',$2,false)
      ON CONFLICT (lower(username)) DO UPDATE SET role='filial_admin',branch_id=EXCLUDED.branch_id,must_change_password=false`,
      [await argon2.hash('Testing-Password-123',{type:argon2.argon2id}),branch.id]);
    const user=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='e2e-select'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(token),user.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'}]);
  await page.goto('/');
  await page.getByRole('button',{name:'Colaboradores',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Colaboradores e outras pessoas'})).toBeVisible();
  const master=page.getByRole('checkbox',{name:'Selecionar colaboradores exibidos'});
  const boxes=page.locator('.people-table tbody input[type=checkbox]');
  const bulkButton=page.getByRole('button',{name:/Excluir selecionados/});
  const checked=page.locator('.people-table tbody input[type=checkbox]:checked');
  const total=await boxes.count();
  expect(total).toBeGreaterThan(1);
  await expect(bulkButton).toHaveCount(0);
  await boxes.first().check();
  await expect(bulkButton).toHaveText('Excluir selecionados (1)');
  await master.check();
  await expect(checked).toHaveCount(total);
  await expect(bulkButton).toHaveText(`Excluir selecionados (${total})`);
  await master.uncheck();
  await expect(checked).toHaveCount(0);
  await expect(bulkButton).toHaveCount(0);
  await boxes.first().check();
  await expect(checked).toHaveCount(1);
  await expect(master).not.toBeChecked();
  await boxes.first().uncheck();
  await expect(checked).toHaveCount(0);
  await expect(bulkButton).toHaveCount(0);
  const alignment=await page.evaluate(()=>{
    const textCenter=(element:Element|null)=>{
      if(!element)return null;
      const range=document.createRange();range.selectNodeContents(element);
      const rect=range.getBoundingClientRect();
      return rect.height?rect.top+rect.height/2:null;
    };
    const boxCenter=(element:Element|null)=>{
      if(!element)return null;
      const rect=element.getBoundingClientRect();
      return rect.top+rect.height/2;
    };
    return [...document.querySelectorAll('.people-table tbody tr')].map(row=>{
      const rect=row.getBoundingClientRect();
      return {rowCenter:rect.top+rect.height/2,
        checkbox:boxCenter(row.querySelector("td[data-label='Selecionar'] input")),
        name:textCenter(row.querySelector("td[data-label='Pessoa'] .people-cell")),
        category:textCenter(row.querySelector("td[data-label='Categoria']")),
        detail:boxCenter(row.querySelector('.table-detail'))};
    });
  });
  expect(alignment.length).toBeGreaterThan(0);
  for(const row of alignment)for(const key of ['name','category','detail','checkbox'] as const){
    const value=row[key];
    if(value===null)continue;
    expect(Math.abs(value-row.rowCenter),`${key} a ${Math.abs(value-row.rowCenter).toFixed(2)}px do centro da linha`).toBeLessThan(3);
  }
  expect(alignment.some(row=>row.checkbox!==null)).toBe(true);
});

test('central de alertas no cabeçalho abre as listas correspondentes',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    const alertPerson=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Alerta Sem Armário') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed)
      VALUES($1,$2,'promotor_fixo','manual','0110',true)`,[alertPerson.id,branch.id]);
    const admin=(await pool.query<{id:string}>("SELECT id FROM users WHERE lower(username)='e2e'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),admin.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();

  const bell=page.getByRole('button',{name:'Alertas da filial'});
  await expect(bell.locator('.notification-badge')).toBeVisible();
  await bell.click();
  const menu=page.getByRole('menu',{name:'Central de alertas'});
  await expect(menu).toBeVisible();
  const withoutLocker=menu.getByRole('menuitem',{name:'Colaboradores sem armário'});
  const registrationPending=menu.getByRole('menuitem',{name:'Pendências cadastrais'});
  const underusedDoubles=menu.getByRole('menuitem',{name:'Duplos subutilizados'});
  await expect(withoutLocker).toBeVisible();
  await expect(registrationPending).toBeVisible();
  await expect(underusedDoubles).toBeVisible();
  await expect(withoutLocker).toContainText('sem armário');
  await expect(withoutLocker.locator('.notification-action')).toContainText('Ver colaboradores');
  await expect(withoutLocker.locator('.notification-preview')).toHaveCount(0);
  await expect(menu.getByText('Alerta Sem Armário',{exact:true})).toHaveCount(0);
  expect(Number(await withoutLocker.locator('.notification-count').innerText())).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/visual/50-central-alertas.png'});

  await withoutLocker.click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Colaboradores',level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sem armário',exact:true})).toHaveAttribute('aria-pressed','true');

  await bell.click();
  await menu.getByRole('menuitem',{name:'Pendências cadastrais'}).click();
  await expect(page.getByRole('heading',{name:'Pendências',level:1})).toBeVisible();

  await bell.click();
  await menu.getByRole('menuitem',{name:'Duplos subutilizados'}).click();
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:'Duplos parciais',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.notification-popover')).toHaveCount(0);
});

test('admin higieniza a base excluindo cadastros obsoletos',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    const obsolete=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Cadastro Obsoleto E2E') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed,created_at)
      VALUES($1,$2,'colaborador','manual','0111',true,now()-interval '14 months')`,[obsolete.id,branch.id]);
    const admin=(await pool.query<{id:string}>("SELECT id FROM users WHERE lower(username)='e2e'")).rows[0];
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),admin.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.getByRole('heading',{name:'Higienização de base'})).toBeVisible({timeout:15000});

  const obsoleteRow=page.getByLabel('Selecionar Cadastro Obsoleto E2E');
  await expect(obsoleteRow).toBeVisible();
  await expect(page.getByLabel('Inatividade mínima (dias)')).toHaveValue('90');
  await page.screenshot({path:'test-results/visual/51-higienizacao-base.png'});
  await page.getByRole('button',{name:'Analisar cadastros'}).click();
  await expect(obsoleteRow).toBeVisible();
  await obsoleteRow.check();
  await expect(page.getByRole('status').filter({hasText:'cadastro(s) selecionado(s)'})).toContainText('1 de');
  const purgeButton=page.getByRole('button',{name:'Excluir cadastros selecionados'});
  await expect(purgeButton).toBeEnabled();
  await purgeButton.click();
  const confirmation=page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Excluir 1 cadastro(s) da base?');
  await confirmation.getByRole('button',{name:'Confirmar'}).click();
  await expectNotice(page,'cadastro(s) excluído(s) da base');
  await closeNotice(page);
  await expect(page.getByLabel('Selecionar Cadastro Obsoleto E2E')).toHaveCount(0);
  await expect(page.getByText('Nenhum cadastro obsoleto',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Excluir cadastros selecionados'})).toHaveCount(0);
});

test('desocupação guarda pertences e auditoria gera relatório para gestão',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    const admin=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='e2e'")).rows[0];
    const locker=(await pool.query<{id:string}>("INSERT INTO lockers(branch_id,number,size,capacity,modality) VALUES($1,'609','padrao',1,'fixo') RETURNING id",[branch.id])).rows[0];
    const person=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Pessoa da Inspeção') RETURNING id")).rows[0];
    await pool.query("INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed) VALUES($1,$2,'colaborador','manual','6090',true)",[person.id,branch.id]);
    const auditor=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Fiscal da Prevenção') RETURNING id")).rows[0];
    await pool.query("INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,needs_fixed) VALUES($1,$2,'colaborador','manual','6091','PP',true)",[auditor.id,branch.id]);
    await pool.query("INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,started_by) VALUES($1,$2,$3,'fixo',now(),$4)",[branch.id,locker.id,person.id,admin.id]);
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(token),admin.id,digest(csrf)]);
  }finally{await pool.end();}
  await page.context().addCookies([{name:'armarios_session',value:token,url:'http://localhost:5174',httpOnly:true,sameSite:'Strict'},
    {name:'armarios_csrf',value:csrf,url:'http://localhost:5174',sameSite:'Strict'}]);
  await page.goto('/');
  await page.getByRole('button',{name:'Abrir detalhes do armário 609'}).click();
  await page.locator('.occupant-slot').filter({hasText:'Pessoa da Inspeção'}).getByRole('button',{name:'Desocupar armário'}).click();
  const dialog=page.getByRole('dialog',{name:'Desocupar armário 609'});
  await dialog.getByRole('checkbox',{name:'Pertences deixados no armário?'}).check();
  await dialog.getByLabel('Categoria').selectOption('outro');
  await dialog.getByLabel('Qual categoria?').fill('Mochila');
  await dialog.getByLabel('Quem encontrou?').fill('Equipe PP');
  await expect(dialog.getByLabel('Local de guarda na PP')).toHaveCount(0);
  await expect(dialog.getByLabel('Data e hora do achado')).toHaveAttribute('step','60');
  await expect(dialog.getByLabel('Data e hora do achado')).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  await dialog.getByLabel('Descrição do item').fill('Mochila azul de teste');
  await dialog.getByRole('button',{name:'Confirmar desocupação'}).click();
  await expectNotice(page,'desocupado com sucesso');await closeNotice(page);
  await page.getByRole('dialog',{name:'Armário Nº 609'}).getByRole('button',{name:'Fechar'}).click();
  await page.getByRole('button',{name:'Achados e Perdidos'}).click();
  await expect(page.getByText('Mochila azul de teste')).toBeVisible();
  await expect(page.locator('.custody-item').filter({hasText:'Mochila azul de teste'})).toContainText(/Encontrado em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · Por/);
  await expect(page.getByText('Consulte o prazo e a situação de cada item.')).toBeVisible();
  await expect(page.getByText('30 dia(s) restantes')).toBeVisible();
  await page.getByRole('button',{name:'+ Registrar Item'}).click();
  const manual=page.locator('.custody-register');
  await manual.getByLabel('Categoria').selectOption('celular');
  await manual.getByLabel('Quem encontrou?').fill('Fiscal da Prevenção');
  await expect(manual.getByLabel('Local onde foi achado')).toHaveAttribute('placeholder','Informe o local onde o pertence foi encontrado');
  await manual.getByLabel('Local onde foi achado').fill('Corredor Central');
  await expect(manual.getByLabel('Local de guarda na PP')).toHaveCount(0);
  await expect(manual.getByLabel('Data e hora do achado')).toHaveAttribute('step','60');
  await manual.getByLabel('Descrição do item').fill('Celular preto de teste');
  await manual.getByRole('button',{name:'Salvar item'}).click();
  await closeNotice(page);
  await page.getByLabel('Buscar item').fill('Celular preto');
  await expect(page.getByText('Celular preto de teste')).toBeVisible();
  await expect(page.getByText('Mochila azul de teste')).toHaveCount(0);
  await page.getByRole('button',{name:'Auditorias'}).click();
  await page.getByLabel('Responsável da Prevenção de Perdas').selectOption({label:'Fiscal da Prevenção · 6091'});
  await page.getByRole('button',{name:'Iniciar auditoria'}).click();
  await closeNotice(page);
  await page.getByRole('combobox',{name:'Armário'}).selectOption({label:'№ 609'});
  await page.getByRole('combobox',{name:'Ocorrência'}).selectOption('sem_cadeado');
  await page.getByRole('button',{name:'Adicionar ocorrência'}).click();
  await closeNotice(page);
  await expect(page.getByText('Armário desocupado')).toBeVisible();
  await page.getByRole('button',{name:'Concluir auditoria'}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar'}).click();
  await closeNotice(page);
  await page.getByRole('button',{name:'Gerar Relatório para Gestão'}).click();
  const report=page.getByRole('article',{name:'Relatório para Gestão'});
  await expect(report).toContainText('Fiscal da Prevenção');
  await expect(report).toContainText('Sem cadeado');
  await expect(report).toContainText('Providência recomendada');
  await page.emulateMedia({media:'print'});
  await expect(report.locator('header')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  expect((await page.pdf({format:'A4',printBackground:true})).length).toBeGreaterThan(1000);
  await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'Excluir Auditoria'}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar'}).click();
  await expectNotice(page,'Auditoria excluída.');
});
