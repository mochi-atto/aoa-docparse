/** Disposable offline browser acceptance. No app auth bypass is shipped.
 * npm install --prefix /tmp/aoa-browser playwright
 * AOA_PLAYWRIGHT_MODULE=/tmp/aoa-browser/node_modules/playwright/index.mjs node scripts/verify_utility_browser.mjs
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'frontend/package.json'));
const { createServer } = await import(require.resolve('vite'));
const react = (await import(require.resolve('@vitejs/plugin-react'))).default;
const tailwind = (await import(require.resolve('@tailwindcss/vite'))).default;
const { chromium } = await import(process.env.AOA_PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'aoa-utility-browser-'));
const authFile = join(directory, 'auth.jsx');
await writeFile(authFile, `const token = async () => 'synthetic-offline-token';
export const Auth0Provider = ({children}) => children;
export const useAuth0 = () => ({isAuthenticated:true,isLoading:false,user:{sub:'synthetic-admin',name:'Synthetic Admin'},getAccessTokenSilently:token,logout:()=>{},loginWithRedirect:async()=>{}});`);
const backendCode = `
import os,time,fitz
from datetime import date
from app.main import app
from app.auth import verify_token
from app.database import engine,SessionLocal
from app.migrations import migrate
from app.models.account import Account
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.models.building import Building
from app.models.appraisal import Appraisal
from app.models.utility_bill import UtilityBill
from app.routers import upload
migrate(engine,apply=True)
with SessionLocal() as db:
 db.add(Account(id=1,auth0_sub='synthetic-admin',email='admin@example.test',role='admin'))
 db.add(Parish(id=1,name='Synthetic Utility Demo',owner_account_id=1))
 db.flush()
 db.add(ParishMember(parish_id=1,account_id=1,email='admin@example.test',role='admin'))
 db.add_all([Building(parish_id=1,name='Hall',account_numbers={'electric':'TEST-001'}),Building(parish_id=1,name='Rectory')])
 db.add(Appraisal(parish_id=1,original_filename='valuation.pdf',appraisal_date=date(2025,1,1),raw_extracted={'sections':[{'building_name':'Hall','gross_sq_ft':1000},{'building_name':'Rectory','gross_sq_ft':0}]}))
 db.add(UtilityBill(parish_id=1,original_filename='legacy.pdf',bill_date=date(2025,1,1),total_amount=10,building_name='Hall',utility_type='electric'))
 db.commit()
app.dependency_overrides[verify_token]=lambda:{'sub':'synthetic-admin','email':'admin@example.test','email_verified':True}
failed_once = False
def controlled_parser(path,extracted_text=None):
 global failed_once
 time.sleep(0.2)
 if 'failure' in (extracted_text or '').lower() and not failed_once:
  failed_once = True
  return []
 return [{'bill_date':date(2026,1,31),'billing_period_start':date(2026,1,1),'billing_period_end':date(2026,1,31),'total_amount':42.5,'utility_type':'electric','account_number':'TEST-001','usage_quantity':1200,'usage_unit':'kWh','provider_name':'Synthetic Electric'}]
upload.parse_utility_bill=controlled_parser
for name,content in [('bill','Billed usage 1200 kWh. Current charges 42.50. Prior year 900 kWh. Meter readings 10000 11200. Account TEST-001.'),('failure','Synthetic extraction failure. No utility data. This document is a cover sheet without billed usage.')]:
 with fitz.open() as doc:
  doc.new_page().insert_text((72,72),content)
  doc.save(os.path.join(os.environ['FIXTURE_DIR'],name+'.pdf'))
import uvicorn
uvicorn.run(app,host='127.0.0.1',port=18001,log_level='error')
`;
const backend = spawn(join(root, 'backend/venv/bin/python'), ['-c', backendCode], {
  cwd: join(root, 'backend'), env: { ...process.env, DATABASE_URL: `sqlite:///${directory}/demo.sqlite`,
    AOA_ENV_FILE: '/dev/null', OPENAI_API_KEY: '', AUTH0_DOMAIN: '', FIXTURE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'],
});
let backendLog = '';
backend.stdout.on('data', b => backendLog += b);
backend.stderr.on('data', b => backendLog += b);
let server, browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:18001/api/health')).ok) break; } catch { /* wait for startup */ }
    await new Promise(r => setTimeout(r, 100));
  }
  server = await createServer({ root: join(root, 'frontend'), configFile: false,
    plugins: [react(), tailwind()], resolve: { alias: { '@auth0/auth0-react': authFile } },
    server: { host: '127.0.0.1', port: 15174, strictPort: true, fs: { allow: [root, directory] }, proxy: { '/api': 'http://127.0.0.1:18001' } },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.AOA_BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:15174/dashboard/1');
  await page.getByText('Synthetic Utility Demo', { exact: true }).first().waitFor();
  console.log('Dashboard loaded');
  await page.locator('input[type=file][accept=".pdf"]').setInputFiles(join(directory, 'bill.pdf'));
  await page.getByRole('button', { name: 'Parse & Upload', exact: false }).click();
  await page.getByText('1/1 files uploaded successfully').waitFor();
  // On the consumption PR alone, the main upload form doesn't switch tabs yet.
  await page.getByRole('button', { name: /Utility Use/ }).click();
  await page.getByRole('button', { name: /View\/Edit 2 bills/ }).click();
  await page.getByText('4.094 kBtu/ft² for this bill period', { exact: false }).waitFor();
  await page.getByText('2026-01-01 – 2026-01-31').waitFor();
  await page.getByText('Bill dated 2025-01-01 (period unavailable)').waitFor();
  const addNote = page.getByRole('button', { name: 'Add note', exact: true });
  await addNote.first().click();
  await page.getByRole('textbox', { name: /Usage note for bill/ }).fill('Building closed for repairs');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Usage note: Building closed for repairs').waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Utility Use/ }).click();
  await page.getByRole('button', { name: /View\/Edit 2 bills/ }).click();
  await page.getByText('Usage note: Building closed for repairs').waitFor();
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByRole('textbox', { name: /Usage note for bill/ }).fill('Heating schedule changed');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Usage note: Heating schedule changed').waitFor();
  if (process.env.AOA_SCREENSHOT) await page.screenshot({ path: process.env.AOA_SCREENSHOT, fullPage: true });
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByRole('textbox', { name: /Usage note for bill/ }).fill('');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByText('Usage note: Heating schedule changed').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Enter utility bill manually', exact: true }).click();
  await page.getByLabel('Building', { exact: true }).selectOption({ label: 'Rectory' });
  await page.getByLabel('Bill date', { exact: true }).fill('2026-02-28');
  await page.getByLabel('Current charges ($)', { exact: true }).fill('0');
  await page.getByLabel('Billed usage (kWh)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save bill', exact: true }).click();
  await page.getByRole('button', { name: /View\/Edit 1 bills/ }).click();
  await page.getByText('0 kWh', { exact: true }).waitFor();
  if (process.env.AOA_CHECK_RELIABILITY === '1') {
    await page.locator('input[type=file][accept=".pdf"]').setInputFiles(join(directory, 'failure.pdf'));
    await page.getByRole('button', { name: 'Parse & Upload', exact: false }).click();
    await page.getByText('No utility bill data could be extracted from this document.').waitFor();
    await page.getByRole('button', { name: 'Parse & Upload', exact: false }).waitFor();
    await page.getByRole('button', { name: 'Parse & Upload', exact: false }).click();
    await page.getByText('1/1 files uploaded successfully').waitFor();
    await page.getByRole('button', { name: /View\/Edit 3 bills/ }).waitFor();
    console.log('PASS: empty extraction is shown as failure; staged file retries successfully and becomes visible.');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: real upload form → persisted Utility list → usage/energy/legacy → add/edit/clear note → reload → manual zero-usage bill with missing area. Auth and parser controlled; real local HTTP/ORM/browser.');
} catch (error) {
  console.error(backendLog.slice(-2500));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  backend.kill();
  await new Promise(resolve => backend.once('exit', resolve));
  await rm(directory, { recursive: true, force: true });
}
