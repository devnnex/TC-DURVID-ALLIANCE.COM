import { defineConfig,devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const setupToken=process.env.TEST_SETUP_TOKEN||randomUUID();process.env.TEST_SETUP_TOKEN=setupToken;
const previewPort=Number(process.env.TEST_WEB_PORT||4174);const baseURL=`http://127.0.0.1:${previewPort}`;
export default defineConfig({testDir:'tests/browser',workers:1,use:{baseURL,trace:'retain-on-failure',...devices['Desktop Chrome'],channel:'chrome'},webServer:[
  {command:'npm run dev -w apps/api',url:'http://127.0.0.1:3001/api/v1/health',reuseExistingServer:false,env:{DATA_PROVIDER:'memory',NODE_ENV:'test',JWT_SECRET:randomUUID()+randomUUID(),SETUP_TOKEN:setupToken,WEB_ORIGIN:baseURL}},
  {command:`npm run preview -w apps/web -- --port ${previewPort}`,url:`${baseURL}/admin/`,reuseExistingServer:false,env:{TEST_API_URL:'http://127.0.0.1:3001/api/v1'}}
]});
