import {defineConfig} from '@playwright/test';
const database=process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e';
if(!database.includes('armarios_e2e'))throw new Error('Playwright exige banco isolado armarios_e2e');
export default defineConfig({
  testDir:'./e2e',timeout:60000,retries:0,workers:1,reporter:'list',globalSetup:'./e2e/setup.ts',
  use:{baseURL:'http://localhost:5174',browserName:'chromium',channel:process.env.E2E_BROWSER_CHANNEL||undefined,headless:true,viewport:{width:1440,height:900},trace:'retain-on-failure'},
  webServer:[
    {command:'npm run dev:api',url:'http://localhost:3002/api/health',reuseExistingServer:false,timeout:30000,env:{DATABASE_URL:database,PORT:'3002',COOKIE_SECURE:'false',NODE_ENV:'development',
      // A suíte não testa rate limit (coberto por testes de integração); sem isso o 6º login de 'e2e' tomaria 429.
      AUTH_LOGIN_MAX_USER:'1000',AUTH_LOGIN_MAX_IP:'1000'}},
    {command:'npm run dev -w @armarios/web -- --port 5174',url:'http://localhost:5174',reuseExistingServer:false,timeout:30000,env:{VITE_API_TARGET:'http://localhost:3002'}}
  ]
});
