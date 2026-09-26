import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {createHash,randomBytes} from 'node:crypto';

async function createAdminAlias(pool:Pool,username:string){await pool.query(`INSERT INTO users(username,password_hash,role,branch_id,must_change_password)
  SELECT $1,password_hash,role,branch_id,false FROM users WHERE username='e2e'`,[username]);}

test('login, painel, compartilhamento, promotor, TI, pendências e offline',async({page,context})=>{
  await mkdir('test-results/visual',{recursive:true});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Entrar'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/01-login.png'});
  await page.getByLabel('Nome de usuário').fill('e2e');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
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
  await page.getByLabel('Nome',{exact:true}).fill('Promotora Teste');
  await page.getByLabel('Matrícula',{exact:true}).last().fill('0003');
  await page.getByRole('button',{name:'Salvar cadastro'}).click();
  await expect(page.getByText('Promotora Teste').first()).toBeVisible();
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
  await expect(page.locator('.notice')).toContainText('Armário atribuído');
  await page.getByRole('button',{name:'Administração'}).click();
  await page.getByRole('button',{name:'Autorizar este navegador'}).click();
  await expect(page.getByText('Este navegador foi autorizado')).toBeVisible();
  await expect(page.getByRole('button',{name:'Revogar'})).toBeVisible();
  await page.waitForFunction(async()=>{const request=indexedDB.open('armarios-offline',1);return new Promise(resolve=>{request.onsuccess=()=>{const tx=request.result.transaction('state','readonly'),get=tx.objectStore('state').get('copy');get.onsuccess=()=>resolve(!!get.result);};request.onerror=()=>resolve(false);});});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Armários',level:1})).toBeVisible();
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Sem conexão · apenas consulta/)).toBeVisible();
  await expect(page.getByText(/Dados locais para consulta/)).toBeVisible();
  await page.screenshot({path:'test-results/visual/07-offline.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/visual/08-offline-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Sair'}).click();
  await expect(page.getByRole('heading',{name:'Conecte-se para consultar os armários'})).toBeVisible();
  expect(await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('armarios-offline',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return new Promise(resolve=>{const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get('copy');request.onsuccess=()=>resolve(request.result);});})).toBeUndefined();
  await context.setOffline(false);
  await expect(page.getByRole('heading',{name:'Entrar'})).toBeVisible();
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
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{
    await pool.query("UPDATE lockers SET migration_status='inconclusivo' WHERE number='101'");
    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
      SELECT id,'103','padrao',1,'fixo' FROM branches WHERE name='Caruaru Demonstração'`);
    await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality)
      SELECT id,'104','padrao',2,true,'fixo' FROM branches WHERE name='Caruaru Demonstração'`);
    await createAdminAlias(pool,'e2e-status');
  }finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e-status');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.locker-tile').filter({hasText:'101'})).toHaveClass(/has-pending/);
  await expect(page.locator('.locker-tile').filter({hasText:'102'})).toHaveClass(/occupied/);
  await expect(page.locator('.locker-tile').filter({hasText:'102'})).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).toHaveClass(/free/);
  await expect(page.locator('.locker-tile').filter({hasText:'104'})).toContainText('Duplo');
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).not.toContainText(/Padrão|Grande|Simples/);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 12','№ 101','№ 102','№ 103','№ 104']);
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Painel da filial'})).toBeVisible();
  await expect(page.getByRole('button',{name:/3 vagas disponíveis/})).toBeVisible();
  await page.getByRole('button',{name:/3 vagas disponíveis/}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(2);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 103','№ 104']);
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await page.getByRole('button',{name:'Com pendência',exact:false}).click();
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['№ 101']);
  await page.getByRole('button',{name:'Armários',exact:true}).click();
  await page.getByLabel('Situação').selectOption('livre');
  await expect(page.locator('.locker-tile')).toHaveCount(2);
  await page.getByLabel('Situação').selectOption('');
  await page.locator('.locker-tile').filter({hasText:'103'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Pesquisar pessoa por nome ou matrícula').fill('0001');
  await page.getByLabel('Pessoas cadastradas').selectOption({label:'Ana Exemplo · 0001 · armário 102'});
  await expect(page.getByText(/Ana Exemplo, armário 102 → 103/)).toBeVisible();
  await page.getByRole('dialog').getByLabel('Cópia da chave ao atribuir').uncheck();
  await page.getByLabel('Motivo da transferência').fill('Melhor altura');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Transferir para este armário'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('transferido');
  const toastTop=await page.locator('.notice').evaluate(element=>element.getBoundingClientRect().top);
  expect(toastTop).toBeGreaterThanOrEqual(0);
  await page.getByLabel('Filtrar por cópia da chave').selectOption('nao');
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
  await expect(page.getByRole('columnheader',{name:'Evento'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Registro'})).toHaveCount(0);
  await page.screenshot({path:'test-results/visual/15-historico.png'});
  await page.getByRole('button',{name:'Administração'}).click();
  await expect(page.getByRole('heading',{name:'Acessos'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/16-administracao.png'});
  await page.getByRole('button',{name:'Setor ocupante'}).first().click();
  await expect(page.getByLabel('Setor que ocupa o armário 12')).toBeVisible();
  await page.getByRole('button',{name:'Cancelar'}).click();
  await page.getByRole('button',{name:'Redefinir senha'}).first().click();
  await expect(page.getByLabel(/Nova senha temporária para/)).toBeVisible();
  await page.getByRole('button',{name:'Cancelar'}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Abrir menu'}).click();
  await page.getByRole('button',{name:'Armários',exact:true}).click();
  await page.waitForTimeout(250);
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
  try{await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
    SELECT b.id,n::text,'padrao',1,'fixo' FROM branches b CROSS JOIN generate_series(1,477) n
    WHERE b.name='Caruaru Demonstração' ON CONFLICT(branch_id,number) DO NOTHING`);await createAdminAlias(pool,'e2e-477');}finally{await pool.end();}
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
  await dialog.getByLabel('Armário duplo').check();
  await dialog.getByLabel('Existe cópia da chave?').uncheck();
  await dialog.getByRole('button',{name:'Salvar dados do armário'}).click();
  await expect(page.locator('.notice')).toContainText('atualizados');
  await page.locator('.locker-tile').last().click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Armário Nº 477'})).toBeVisible();
  await expect(page.getByRole('dialog').locator('.double-badge')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Existe cópia da chave?')).not.toBeChecked();
  const bounds=await page.locator('.notice').evaluate(element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(900);
});

test('pendências de armários seguem ordem numérica e abrem conferência',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{await pool.query(`UPDATE lockers SET migration_status='inconclusivo' WHERE number IN ('12','101');
    INSERT INTO pending_items(branch_id,kind,subject_type,subject_id)
    SELECT branch_id,'migracao_inconclusiva','locker',id FROM lockers WHERE number IN ('12','101')
    ON CONFLICT(branch_id,kind,subject_type,subject_id) DO UPDATE SET state='aberta'`);await createAdminAlias(pool,'e2e-pending');}finally{await pool.end();}
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
  await expect(dialog.locator('datalist option')).toHaveCount(2);
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0001');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Ana Exemplo');
  await dialog.getByLabel('Cadastrar ocupante').uncheck();
  await dialog.getByLabel('Setor ocupante').fill('Restaurante FC revisado');
  await dialog.getByRole('button',{name:'Salvar correções'}).click();
  await expect(page.locator('.notice')).toContainText('Correções salvas');
  await page.locator('.pending-item').first().getByRole('button',{name:'Conferir dados'}).click();
  await expect(page.getByRole('dialog').getByLabel('Setor ocupante')).toHaveValue('Restaurante FC revisado');
  await page.getByRole('dialog').getByLabel('Conferi os dados acima').check();
  await page.getByRole('dialog').getByRole('button',{name:'Concluir conferência'}).click();
  await expect(page.locator('.notice')).toContainText('conferência concluída');
  await page.getByLabel('Exibir').selectOption('resolvida');
  await expect(page.getByRole('heading',{name:'Histórico de pendências resolvidas'})).toBeVisible();
  await expect(page.locator('.pending-item').filter({hasText:'Armário 12'})).toContainText('Motivo: Os dados importados deste armário precisavam de conferência.');
  await expect(page.locator('.pending-item').filter({hasText:'Armário 12'})).toContainText('Resolução: Os dados do armário foram conferidos.');
  await page.screenshot({path:'test-results/visual/12-pendencias-resolvidas.png'});
});

test('card troca matrícula e permite segundo ocupante depois de marcar duplo',async({page})=>{
  await mkdir('test-results/visual',{recursive:true});
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
  try{
    const branch=(await pool.query<{id:string}>("SELECT id FROM branches WHERE name='Caruaru Demonstração'")).rows[0];
    await pool.query("INSERT INTO lockers(branch_id,number,size,capacity,modality) VALUES($1,'500','padrao',1,'fixo')",[branch.id]);
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
  await dialog.getByLabel('Armário duplo').check();
  await dialog.getByLabel('Cadastrar ocupante').check();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0004');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Dora Oficial');
  await expect(dialog.locator('datalist option')).toHaveCount(4);
  await page.screenshot({path:'test-results/visual/13-edicao-matricula.png'});
  await dialog.getByRole('button',{name:'Salvar dados do armário'}).click();
  await expect(page.locator('.notice')).toContainText('Dora Oficial');
  await page.locator('.locker-tile').filter({hasText:'500'}).click();
  await expect(dialog.getByLabel('Adicionar segundo ocupante')).toBeVisible();
  await dialog.getByLabel('Adicionar segundo ocupante').check();
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('0005');
  await expect(dialog.getByLabel('Nome',{exact:true})).toHaveValue('Eva Oficial');
  await dialog.getByRole('button',{name:'Salvar dados do armário'}).click();
  await page.locator('.locker-tile').filter({hasText:'500'}).click();
  await expect(dialog.locator('.list-row')).toHaveCount(2);
  await dialog.getByLabel('Ocupante a corrigir').selectOption({label:'Dora Oficial · 0004'});
  await dialog.getByRole('combobox',{name:'Matrícula',exact:true}).fill('9999');
  await dialog.getByLabel('Nome',{exact:true}).fill('Pessoa conferida');
  await dialog.getByRole('button',{name:'Salvar dados do armário'}).click();
  await expect(page.locator('.notice')).toContainText('atualizados');
  await page.locator('.locker-tile').filter({hasText:'500'}).click();
  await expect(dialog.getByText('Pessoa conferida',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Eva Oficial',{exact:true})).toBeVisible();
});
