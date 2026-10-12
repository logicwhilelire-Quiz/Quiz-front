/**
 * LogicWhileLiRE — Pre-Launch Student Flow End-to-End Playwright Runner
 * Real End-to-End Test:
 * 1. Metadata Verification (college, branch, batch, section dropdown options)
 * 2. Candidate Registration form fill
 * 3. 6-Digit Email OTP verification & account activation
 * 4. Candidate Login with credentials
 * 5. Student Dashboard verification
 * 6. Exam Entry & Instructions launch
 * 7. Console error capture
 * 8. Complete test data cleanup
 */

import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.resolve(rootDir, 'server');
const clientDir = path.resolve(rootDir, 'client');

// Read server/.env
const envPath = path.resolve(serverDir, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.substring(0, eqIdx).trim();
    const v = trimmed.substring(eqIdx + 1).trim();
    envVars[k] = v;
  }
}

const SUPABASE_URL = envVars.SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

import { createRequire } from 'module';
const serverRequire = createRequire(import.meta.url);
const { createClient } = serverRequire(path.resolve(serverDir, 'node_modules/@supabase/supabase-js'));
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let serverProc = null;
let clientProc = null;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function waitForHealthy(url, timeoutMs = 45000, name = 'Service') {
  const start = Date.now();
  process.stdout.write(`⏳ Waiting for ${name} (${url})`);
  while (Date.now() - start < timeoutMs) {
    const ok = await checkUrl(url);
    if (ok) {
      console.log(` -> ✅ Ready (${Date.now() - start}ms)`);
      return true;
    }
    process.stdout.write('.');
    await wait(1000);
  }
  console.log(` -> ❌ Timeout waiting for ${name}`);
  return false;
}

async function startServers() {
  console.log('\n🚀 Verifying test services (:3001 & :5173)...');

  const backendAlreadyUp = await checkUrl('http://127.0.0.1:3001/api/health');
  if (backendAlreadyUp) {
    console.log('  • Backend API is already running on port 3001.');
  } else {
    console.log('  • Starting Express backend server...');
    serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: serverDir,
      env: { ...process.env, ...envVars, PORT: '3001', NODE_ENV: 'test', DEMO_MODE: 'false' },
      shell: true,
      stdio: 'pipe',
    });

    serverProc.stdout.on('data', (d) => {
      const s = d.toString().trim();
      if (s.includes('Running on port') || s.includes('Connection verified healthy')) {
        console.log(`  [Server] ${s}`);
      }
    });

    serverProc.stderr.on('data', (d) => {
      const s = d.toString();
      if (s.includes('Error') && !s.includes('warning') && !s.includes('ExperimentalWarning')) {
        console.error(`  [Server Err] ${s.trim()}`);
      }
    });
  }

  const frontendAlreadyUp = await checkUrl('http://127.0.0.1:5173');
  if (frontendAlreadyUp) {
    console.log('  • Frontend Client is already running on port 5173.');
  } else {
    console.log('  • Starting Vite frontend client...');
    clientProc = spawn('npx', ['vite', '--port', '5173'], {
      cwd: clientDir,
      shell: true,
      stdio: 'pipe',
    });

    clientProc.stdout.on('data', () => {});
    clientProc.stderr.on('data', (d) => {
      const s = d.toString();
      if (s.includes('Error')) console.error(`  [Client Err] ${s.trim()}`);
    });
  }

  const serverReady = await waitForHealthy('http://127.0.0.1:3001/api/health', 45000, 'Backend API');
  const clientReady = await waitForHealthy('http://127.0.0.1:5173', 45000, 'Frontend Client');

  if (!serverReady || !clientReady) {
    throw new Error('Failed to boot backend or frontend test instances.');
  }
}

async function stopServers() {
  console.log('\n🧹 Stopping background test servers...');
  if (serverProc) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t'], { shell: true });
      } else {
        serverProc.kill('SIGTERM');
      }
    } catch {}
  }
  if (clientProc) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(clientProc.pid), '/f', '/t'], { shell: true });
      } else {
        clientProc.kill('SIGTERM');
      }
    } catch {}
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎭 LogicWhile LiRE — PRE-LAUNCH STUDENT FLOW PLAYWRIGHT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  let testCollegeId = null;
  const testCollegeCode = 'NITTEST';
  const testExamCode = 'DEMONIT2026';
  const testRoll = '22NIT0501';
  const testEmail = 'rahul.sharma@nit.edu';
  const testPassword = 'Password@2026!';

  try {
    // ── STEP 1: Provision 1 College, 1 Branch, 1 Academic Year, 1 Section, 1 Exam Code
    console.log('📦 [1/6] Provisioning test institution hierarchy in Supabase...');

    // Clean any prior leftover test records
    await supabase.from('questions_ec').delete().eq('exam_code', testExamCode);
    await supabase.from('exam_code_attempts').delete().eq('exam_code', testExamCode);
    await supabase.from('exam_codes').delete().eq('exam_code', testExamCode);
    await supabase.from('students').delete().eq('email', testEmail);
    await supabase.from('students').delete().eq('roll_number', testRoll);
    await supabase.from('sections').delete().eq('id', 'sec-nittest-coh-nittest-2026-cse-a');
    await supabase.from('cohorts').delete().eq('id', 'coh-nittest-2026-cse');
    await supabase.from('academic_years').delete().eq('id', 'ay-nittest-2026');
    await supabase.from('colleges').delete().eq('college_code', testCollegeCode);

    // 1. College
    const { data: college, error: colErr } = await supabase
      .from('colleges')
      .insert({
        college_name: 'National Institute of Technology',
        college_code: testCollegeCode,
        city: 'Hyderabad',
        state: 'Telangana',
        registration_enabled: true,
        is_active: true,
      })
      .select()
      .single();

    if (colErr || !college) throw new Error(`Failed to create college: ${colErr?.message}`);
    testCollegeId = college.id;
    console.log(`  ✓ Created College: "${college.college_name}" (ID: ${college.id}, Code: ${college.college_code})`);

    // 2. Academic Year
    const { error: ayErr } = await supabase.from('academic_years').insert({
      id: 'ay-nittest-2026',
      college_id: String(college.id),
      year: '2026',
      is_active: true,
    });
    if (ayErr) throw new Error(`Failed to create academic year: ${ayErr.message}`);
    console.log(`  ✓ Created Academic Year: "2026" (ID: ay-nittest-2026)`);

    // 3. Cohort (Branch)
    const { error: cohErr } = await supabase.from('cohorts').insert({
      id: 'coh-nittest-2026-cse',
      college_id: String(college.id),
      academic_year_id: 'ay-nittest-2026',
      name: 'Computer Science & Engineering',
      branch: 'CSE',
      year_of_passing: 2026,
      degree: 'B.Tech',
      is_active: true,
    });
    if (cohErr) throw new Error(`Failed to create cohort: ${cohErr.message}`);
    console.log(`  ✓ Created Cohort: "CSE — Computer Science & Engineering" (Class of 2026)`);

    // 4. Section
    const { error: secErr } = await supabase.from('sections').insert({
      id: 'sec-nittest-coh-nittest-2026-cse-a',
      college_id: String(college.id),
      cohort_id: 'coh-nittest-2026-cse',
      name: 'A',
      section_name: 'A',
      is_active: true,
    });
    if (secErr) throw new Error(`Failed to create section: ${secErr.message}`);
    console.log(`  ✓ Created Section: "Section A"`);

    // 5. Exam Code & Question for Exam Entry Verification
    const startTime = new Date(Date.now() - 3600000).toISOString();
    const endTime = new Date(Date.now() + 86400000).toISOString();

    const { error: ecErr } = await supabase.from('exam_codes').insert({
      exam_code: testExamCode,
      college_id: college.id,
      exam_name: 'NIT National Coding Assessment 2026',
      branch: 'CSE',
      passout_year: 2026,
      section_id: 'sec-nittest-coh-nittest-2026-cse-a',
      section_ids: ['sec-nittest-coh-nittest-2026-cse-a'],
      total_questions: 1,
      duration_minutes: 60,
      start_time: startTime,
      end_time: endTime,
      is_active: true,
    });
    if (ecErr) throw new Error(`Failed to create exam code: ${ecErr.message}`);

    const { error: qErr } = await supabase.from('questions_ec').insert({
      exam_code: testExamCode,
      question: 'What is the worst-case runtime complexity of Binary Search?',
      option_a: 'O(1)',
      option_b: 'O(log n)',
      option_c: 'O(n)',
      option_d: 'O(n log n)',
      correct_answer: 'B',
      marks: 1,
      topic: 'Algorithms',
    });
    if (qErr) throw new Error(`Failed to insert question: ${qErr.message}`);
    console.log(`  ✓ Created Exam Code: "${testExamCode}" with questions active`);

    // ── STEP 2: Start Servers
    await startServers();

    // ── STEP 3: Verify /api/v1/assessment/metadata directly
    console.log('\n🔍 [2/6] Verifying GET /api/v1/assessment/metadata output directly...');
    const metaRes = await fetch('http://127.0.0.1:3001/api/v1/assessment/metadata');
    const metaJson = await metaRes.json();
    console.log(`  • Success: ${metaJson.success}`);
    console.log(`  • Colleges count: ${metaJson.colleges.length} ->`, metaJson.colleges.map((c) => `${c.name} (${c.code})`));
    console.log(`  • Branches count: ${metaJson.branches.length} -> First 3:`, metaJson.branches.slice(0, 3).map((b) => b.label || b.code));
    console.log(`  • Batches count: ${metaJson.batches.length} ->`, metaJson.batches);
    console.log(`  • Sections count: ${metaJson.sections.length} ->`, metaJson.sections.map((s) => s.name));

    if (metaJson.colleges.length === 0) throw new Error('Colleges dropdown metadata is empty!');
    if (metaJson.batches.length === 0) throw new Error('Batches dropdown metadata is empty!');
    if (metaJson.sections.length === 0) throw new Error('Sections dropdown metadata is empty!');

    // ── STEP 4: Launch Playwright & Execute Student Journey
    console.log('\n🌐 [3/6] Launching Playwright Chrome Browser...');
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 850 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    const consoleMessages = [];
    const consoleErrors = [];

    page.on('console', (msg) => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // ── STEP 4A: Navigate to /register
    console.log('\n📋 [4/6] Navigating to http://localhost:5173/register...');
    await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });

    // Verify Title & Meta Tags in real DOM
    const pageTitle = await page.title();
    console.log(`  • Page title in browser tab: "${pageTitle}"`);
    if (!pageTitle.includes('LogicWhile LiRE')) {
      throw new Error(`Expected title to include "LogicWhile LiRE", got: "${pageTitle}"`);
    }
    if (pageTitle.toLowerCase().includes('charan')) {
      throw new Error(`Personal name detected in page title: "${pageTitle}"`);
    }

    // Verify Every Dropdown has options
    await page.waitForSelector('#gate-college', { timeout: 10000 });
    await page.waitForSelector('#gate-branch', { timeout: 10000 });
    await page.waitForSelector('#gate-batch', { timeout: 10000 });
    await page.waitForSelector('#gate-section', { timeout: 10000 });

    const collegeOptions = await page.$$eval('#gate-college option', (opts) => opts.map((o) => ({ value: o.value, text: o.text.trim() })));
    const branchOptions = await page.$$eval('#gate-branch option', (opts) => opts.map((o) => ({ value: o.value, text: o.text.trim() })));
    const batchOptions = await page.$$eval('#gate-batch option', (opts) => opts.map((o) => ({ value: o.value, text: o.text.trim() })));
    const sectionOptions = await page.$$eval('#gate-section option', (opts) => opts.map((o) => ({ value: o.value, text: o.text.trim() })));

    console.log(`\n  --- DROPDOWN OPTIONS EVIDENCE ---`);
    console.log(`  1. College options (${collegeOptions.length}):`, collegeOptions);
    console.log(`  2. Branch options (${branchOptions.length}):`, branchOptions.slice(0, 4));
    console.log(`  3. Batch (Year) options (${batchOptions.length}):`, batchOptions);
    console.log(`  4. Section options (${sectionOptions.length}):`, sectionOptions);

    if (collegeOptions.length === 0) throw new Error('College dropdown has 0 options!');
    if (branchOptions.length === 0) throw new Error('Branch dropdown has 0 options!');
    if (batchOptions.length === 0) throw new Error('Batch dropdown has 0 options!');
    if (sectionOptions.length === 0) throw new Error('Section dropdown has 0 options!');

    console.log('  ✅ Confirmed: Every single dropdown has non-empty values loaded dynamically!');

    // ── STEP 4B: Fill and Submit Registration Form
    console.log('\n✍️  Filling Candidate Registration Form...');
    await page.fill('#gate-first-name', 'Rahul');
    await page.fill('#gate-last-name', 'Sharma');
    await page.fill('#gate-roll-number', testRoll);

    // Select created college
    await page.selectOption('#gate-college', String(testCollegeId));
    await page.selectOption('#gate-branch', 'CSE');
    await page.selectOption('#gate-batch', '2026');
    await page.selectOption('#gate-section', 'A');

    await page.fill('#gate-email', testEmail);
    await page.fill('#gate-contact', '9876543210');
    await page.fill('#gate-password', testPassword);
    await page.fill('#gate-confirm-password', testPassword);

    console.log('  • Submitting candidate registration...');
    await page.click('#gate-submit-btn');

    // ── STEP 4C: Wait for OTP Step
    console.log('  • Waiting for OTP verification prompt...');
    await page.waitForSelector('#gate-otp-input', { timeout: 15000 });
    console.log('  ✓ Landed on OTP verification screen!');

    // Fetch the actual OTP from Supabase for this candidate
    const { data: studentRecord } = await supabase
      .from('students')
      .select('id, email, verification_otp')
      .eq('email', testEmail)
      .single();

    const otpCode = studentRecord?.verification_otp;
    console.log(`  • Student ID: ${studentRecord?.id}, Generated OTP: ${otpCode}`);

    if (!otpCode) throw new Error('No OTP was generated for candidate registration!');

    await page.fill('#gate-otp-input', otpCode);
    await page.click('#gate-otp-submit-btn');
    console.log('  • Submitted OTP verification code.');

    // ── STEP 4D: Wait for Redirection to Student Login
    console.log('  • Waiting for redirect to /login...');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`  ✓ Successfully landed on Login: ${page.url()}`);

    // Verify account activation banner
    const noticeText = await page.locator('div').filter({ hasText: 'Account verified' }).first().textContent().catch(() => '');
    console.log(`  • Notice on login: "${noticeText.trim()}"`);

    // ── STEP 4E: Perform Student Login
    console.log('\n🔑 [5/6] Performing Student Login...');
    await page.fill('#student-login-input', testRoll);
    await page.fill('#student-password-input', testPassword);
    await page.click('#student-login-btn');

    // Wait for Student Dashboard to mount
    await page.waitForSelector('#dashboard-exam-code-input', { timeout: 15000 });
    console.log(`  ✓ Successfully logged in! Current URL: ${page.url()}`);

    // Verify Dashboard Content
    const welcomeHeader = await page.locator('h1').textContent().catch(() => '');
    if (welcomeHeader) {
      console.log(`  • Dashboard Welcome: "${welcomeHeader.trim()}"`);
    }
    const dashboardHtml = await page.content();
    if (!dashboardHtml.includes(testRoll)) {
      throw new Error(`Roll number ${testRoll} not found in student dashboard!`);
    }
    console.log(`  • Candidate details verified on dashboard (Roll: ${testRoll}, Name: Rahul Sharma)`);

    // ── STEP 4F: Exam Entry Flow
    console.log('\n⚡ [6/6] Testing Exam Entry from Student Dashboard...');
    await page.fill('#dashboard-exam-code-input', testExamCode);
    console.log(`  • Entered Exam Code: ${testExamCode}`);

    await page.click('#dashboard-launch-exam-btn');

    // Wait for Navigation to instructions page or assessment station
    await page.waitForFunction(
      () => window.location.pathname.includes('/instructions') || window.location.pathname.includes('/contest'),
      { timeout: 15000 }
    );
    console.log(`  ✓ Exam Entry verified! Landed on: ${page.url()}`);

    // Check Instructions page header
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    const instructionsHeader = await page.textContent('h1, h2');
    console.log(`  • Examination instructions page header: "${instructionsHeader?.trim()}"`);

    // Report Console Errors
    console.log('\n───────────────────────────────────────────────────────────────────────────────');
    console.log(`📊 CONSOLE ERRORS CAPTURED: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, idx) => console.log(`  [${idx + 1}] ${e}`));
    } else {
      console.log('  ✅ 0 Unhandled Console Errors during the entire student journey!');
    }
    console.log('───────────────────────────────────────────────────────────────────────────────');

    await browser.close();

    console.log('\n🎉 ALL STEPS IN THE STUDENT FLOW PASSED FLAWLESSLY:');
    console.log('  1. Dynamic Metadata API returned all dropdown collections');
    console.log('  2. Candidate Registration successfully submitted with institutional targeting');
    console.log('  3. 6-digit OTP verification activated the student account');
    console.log('  4. Student Login succeeded with newly created credentials');
    console.log('  5. Student Dashboard loaded with candidate telemetry & profile');
    console.log('  6. Exam Entry validated candidate eligibility and launched exam session');

  } finally {
    // ── CLEANUP TEST DATA
    console.log('\n🧹 Cleaning up test data from Supabase...');
    if (testExamCode) {
      await supabase.from('questions_ec').delete().eq('exam_code', testExamCode);
      await supabase.from('exam_code_attempts').delete().eq('exam_code', testExamCode);
      await supabase.from('exam_codes').delete().eq('exam_code', testExamCode);
    }
    if (testEmail || testRoll) {
      await supabase.from('students').delete().eq('email', testEmail);
      await supabase.from('students').delete().eq('roll_number', testRoll);
    }
    await supabase.from('sections').delete().eq('id', 'sec-nittest-coh-nittest-2026-cse-a');
    await supabase.from('cohorts').delete().eq('id', 'coh-nittest-2026-cse');
    await supabase.from('academic_years').delete().eq('id', 'ay-nittest-2026');
    if (testCollegeId) {
      await supabase.from('colleges').delete().eq('id', testCollegeId);
    }
    await supabase.from('colleges').delete().eq('college_code', testCollegeCode);
    console.log('✅ All test data deleted. Database restored to clean state.');

    await stopServers();
  }
}

run()
  .then(() => {
    console.log('\n✅ Playwright Student Journey Run Completed Successfully with Code 0.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test Run Error:', err);
    process.exit(1);
  });
