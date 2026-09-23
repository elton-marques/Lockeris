import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {Pool} from 'pg';
import argon2 from 'argon2';

test('login, painel, compartilhamento, promotor, TI, pendências e offline',async({page,context})=>{
  await mkdir('test-results/visual',{recursive:true});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Entrar'})).toBeVisible();
  await page.screenshot({path:'test-results/visual/01-login.png'});
  await page.getByLabel('Nome de usuário').fill('e2e');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.getByRole('heading',{name:'Armários'})).toBeVisible();
  await expect(page.getByText('3 resultados')).toBeVisible();
  await page.screenshot({path:'test-results/visual/02-painel.png'});
  await page.getByRole('button',{name:/102/}).click();
  await expect(page.getByRole('heading',{name:'Armário 102'})).toBeVisible();
  await expect(page.getByText('Ana Exemplo').last()).toBeVisible();
  await expect(page.getByText('Bia Fictícia').last()).toBeVisible();
  await page.screenshot({path:'test-results/visual/03-compartilhado.png'});
  await page.getByRole('dialog').getByRole('button',{name:'Fechar'}).click();
  await page.getByRole('button',{name:'Pessoas'}).click();
  await page.getByRole('heading',{name:'Cadastrar pessoa externa'}).scrollIntoViewIfNeeded();
  await page.getByLabel('Nome',{exact:true}).fill('Promotora Teste');
  await page.getByLabel('Matrícula',{exact:true}).last().fill('0003');
  await page.getByRole('button',{name:'Salvar cadastro'}).click();
  await expect(page.getByText('Promotora Teste').first()).toBeVisible();
  await page.screenshot({path:'test-results/visual/04-promotor.png'});
  await page.getByRole('button',{name:'Importação'}).click();
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
  await expect(page.getByText('Promotora Teste')).toBeVisible();
  await page.screenshot({path:'test-results/visual/06-pendencias.png'});
  await page.getByRole('button',{name:'Administração'}).click();
  await page.getByRole('button',{name:'Autorizar este navegador'}).click();
  await expect(page.getByText('Este navegador foi autorizado')).toBeVisible();
  await expect(page.getByRole('button',{name:'Revogar'})).toBeVisible();
  await page.waitForFunction(async()=>{const request=indexedDB.open('armarios-offline',1);return new Promise(resolve=>{request.onsuccess=()=>{const tx=request.result.transaction('state','readonly'),get=tx.objectStore('state').get('copy');get.onsuccess=()=>resolve(!!get.result);};request.onerror=()=>resolve(false);});});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Armários'})).toBeVisible();
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline · somente consulta/)).toBeVisible();
  await expect(page.getByText(/Cópia de/)).toBeVisible();
  await page.screenshot({path:'test-results/visual/07-offline.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/visual/08-offline-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Sair'}).click();
  await expect(page.getByRole('heading',{name:'Consulta indisponível'})).toBeVisible();
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
  await expect(page.getByRole('button',{name:'Importação'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Histórico'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Administração'})).toHaveCount(0);
  await page.getByRole('button',{name:'Movimentações'}).click();
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
  }finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.locker-tile').filter({hasText:'101'})).toHaveClass(/has-pending/);
  await expect(page.locator('.locker-tile').filter({hasText:'102'})).toHaveClass(/occupied/);
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).toHaveClass(/free/);
  await expect(page.locator('.locker-tile').filter({hasText:'104'})).toContainText('Duplo');
  await expect(page.locator('.locker-tile').filter({hasText:'103'})).not.toContainText(/Padrão|Grande|Simples/);
  await expect(page.locator('.locker-tile .tile-top strong')).toHaveText(['12','101','102','103','104']);
  await page.getByLabel('Situação').selectOption('livre');
  await expect(page.locator('.locker-tile')).toHaveCount(2);
  await page.getByLabel('Situação').selectOption('');
  await page.locator('.locker-tile').filter({hasText:'103'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Pesquisar pessoa por nome ou matrícula').fill('0001');
  await page.getByLabel('Pessoas cadastradas').selectOption({label:'Ana Exemplo · 0001 · armário 102'});
  await expect(page.getByText('ocupa o armário 102')).toBeVisible();
  await page.getByRole('dialog').getByLabel('Cópia da chave').selectOption('nao');
  await page.getByLabel('Motivo da transferência').fill('Melhor altura');
  await page.getByRole('button',{name:'Transferir para este armário'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('transferido');
  const toastTop=await page.locator('.notice').evaluate(element=>element.getBoundingClientRect().top);
  expect(toastTop).toBeGreaterThanOrEqual(0);
  await page.getByLabel('Filtrar por cópia da chave').selectOption('nao');
  await expect(page.locator('.locker-tile')).toHaveCount(1);
  await page.screenshot({path:'test-results/visual/09-status-armarios.png'});
});

test('armário 477 abre no ponto atual e o aviso fica visível',async({page})=>{
  const pool=new Pool({connectionString:process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e'});
  try{await pool.query(`INSERT INTO lockers(branch_id,number,size,capacity,modality)
    SELECT b.id,n::text,'padrao',1,'fixo' FROM branches b CROSS JOIN generate_series(1,477) n
    WHERE b.name='Caruaru Demonstração' ON CONFLICT(branch_id,number) DO NOTHING`);}finally{await pool.end();}
  await page.goto('/');
  await page.getByLabel('Nome de usuário').fill('e2e');
  await page.getByLabel('Senha').fill('Testing-Password-123');
  await page.getByRole('button',{name:'Entrar'}).click();
  await expect(page.locator('.locker-tile')).toHaveCount(477);
  await expect(page.locator('.locker-tile .tile-top strong').first()).toHaveText('1');
  await expect(page.locator('.locker-tile .tile-top strong').last()).toHaveText('477');
  await page.locator('.locker-tile').last().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Armário 477'})).toBeVisible();
  await dialog.getByLabel('Cópia da chave').selectOption('sim');
  await dialog.getByRole('button',{name:'Salvar situação da chave'}).click();
  await expect(page.locator('.notice')).toContainText('atualizada');
  const bounds=await page.locator('.notice').evaluate(element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};});
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(900);
});
