/**
 * LogicWhileLiRE — Real Browser Playwright Test Suite
 * Tests Admin, Student, and Inspector portals on Desktop (1280x800) and Mobile (375x812) viewports.
 * Captures browser console errors, page errors, and extracts actual rendered DOM output.
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load server/.env without external dependencies
try {
  const envPath = path.resolve(__dirname, '../server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

const CLIENT_BASE = process.env.VITE_CLIENT_URL || 'http://localhost:5173';
const SERVER_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:3001';

const VIEWPORTS = [
  { name: 'Desktop (1280x800)', width: 1280, height: 800, isMobile: false },
  { name: 'Mobile (375x812)', width: 375, height: 812, isMobile: true },
];

const PAGES_TO_TEST = [
  // ── Student Pages ──
  {
    role: 'Student',
    path: '/login',
    expectedSelector: 'form, input[type="text"], input[name="username"], input[name="hall_ticket"], button[type="submit"]',
    label: 'Student Login Portal',
  },
  {
    role: 'Student',
    path: '/register',
    expectedSelector: 'form, select, button, input',
    label: 'Student Registration Gate',
  },
  {
    role: 'Student',
    path: '/exam/enter',
    expectedSelector: 'input, button',
    label: 'Student Enter Exam Portal',
  },

  // ── Admin Pages ──
  {
    role: 'Admin',
    path: '/admin/login',
    expectedSelector: 'form, input[type="password"], button[type="submit"]',
    label: 'Admin Login Portal',
  },
  {
    role: 'Admin',
    path: '/admin/dashboard',
    authRole: 'admin',
    expectedSelector: 'main, h1, h2, nav, .dashboard',
    label: 'Admin Control Center / Dashboard',
  },
  {
    role: 'Admin',
    path: '/admin/monitor',
    authRole: 'admin',
    expectedSelector: 'main, h1, h2, nav, .monitor',
    label: 'Admin Live Exam Monitor',
  },

  // ── Inspector Pages ──
  {
    role: 'Inspector',
    path: '/inspector/login',
    expectedSelector: 'form, input, button',
    label: 'Inspector Authentication Portal',
  },
  {
    role: 'Inspector',
    path: '/inspector/monitor',
    authRole: 'inspector',
    expectedSelector: 'main, h1, h2, .monitor, table, div',
    label: 'Inspector Live Room Monitor',
  },
  {
    role: 'Inspector',
    path: '/inspector/results',
    authRole: 'inspector',
    expectedSelector: 'main, h1, h2, table, div',
    label: 'Inspector Results & Analytics',
  },
];

async function getAdminToken() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn('ADMIN_PASSWORD / INITIAL_ADMIN_PASSWORD not set in environment.');
    return null;
  }
  try {
    const res = await fetch(`${SERVER_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword }),
    });
    const data = await res.json();
    return data.token || null;
  } catch (err) {
    console.warn('Could not fetch admin token via API:', err.message);
    return null;
  }
}

async function runBrowserTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🌐 LOGICWHILELIRE — REAL BROWSER PLAYWRIGHT CROSS-VIEWPORT TEST');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  console.log('Fetching administrative session token for authenticated routes...');
  const adminToken = await getAdminToken();
  console.log(`  ✓ Admin session token: ${adminToken ? 'OBTAINED (Bearer ...' + adminToken.slice(-10) + ')' : 'NONE'}\n`);

  console.log('Launching Chromium engine (Google Chrome / Microsoft Edge)...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  console.log(`  ✓ Browser engine active: ${browser.version()}\n`);

  let totalTested = 0;
  let totalErrors = 0;
  const testResults = [];

  for (const vp of VIEWPORTS) {
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.log(`📱 TESTING VIEWPORT: ${vp.name.toUpperCase()} (Width: ${vp.width}px, Height: ${vp.height}px)`);
    console.log('───────────────────────────────────────────────────────────────────────────────');

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      userAgent: vp.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    // Inject auth token in localStorage if admin token is available
    if (adminToken) {
      await context.addInitScript(({ token }) => {
        localStorage.setItem('admin_token', token);
        localStorage.setItem('adminToken', token);
        localStorage.setItem('token', token);
        localStorage.setItem('lire_admin_token', token);
        localStorage.setItem('inspectorToken', token);
        localStorage.setItem('admin_user', JSON.stringify({ role: 'super_admin', username: 'admin', name: 'Admin User' }));
        sessionStorage.setItem('admin_token', token);
        sessionStorage.setItem('admin_user', JSON.stringify({ role: 'super_admin', username: 'admin', name: 'Admin User' }));
      }, { token: adminToken });
    }

    const page = await context.newPage();

    for (const testCase of PAGES_TO_TEST) {
      totalTested++;
      const consoleMessages = [];
      const consoleErrors = [];
      const pageErrors = [];

      page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        consoleMessages.push(`[${type}] ${text}`);
        if (type === 'error') {
          // Ignore harmless favicon or vite ws reconnection notices
          if (!text.includes('favicon') && !text.includes('vite') && !text.includes('manifest')) {
            consoleErrors.push(text);
          }
        }
      });

      page.on('pageerror', (err) => {
        pageErrors.push(err.message || String(err));
      });

      page.on('response', (res) => {
        if (res.status() >= 400) {
          console.log(`     ⚠️ HTTP ${res.status()}: ${res.url()}`);
        }
      });

      const targetUrl = `${CLIENT_BASE}${testCase.path}`;
      process.stdout.write(`  [${testCase.role}] ${testCase.label} (${testCase.path})... `);

      try {
        const resp = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(600); // Allow react hydrate/lazy component load

        // Extract DOM details
        const pageTitle = await page.title();
        const heading = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          if (h1 && h1.textContent) return h1.textContent.trim().replace(/\s+/g, ' ');
          const h2 = document.querySelector('h2');
          if (h2 && h2.textContent) return h2.textContent.trim().replace(/\s+/g, ' ');
          const titleEl = document.querySelector('.title, header');
          return titleEl ? titleEl.textContent.trim().replace(/\s+/g, ' ') : '(No heading tag)';
        });

        // Extract key interactive elements summary
        const domSummary = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input, select, textarea').length;
          const buttons = document.querySelectorAll('button, a[role="button"]').length;
          const forms = document.querySelectorAll('form').length;
          const bodyWidth = document.body.scrollWidth;
          const clientWidth = document.documentElement.clientWidth;
          const hasHorizontalOverflow = bodyWidth > clientWidth + 2;
          return { inputs, buttons, forms, bodyWidth, clientWidth, hasHorizontalOverflow };
        });

        const isClean = consoleErrors.length === 0 && pageErrors.length === 0;

        if (isClean) {
          console.log(`✅ OK (${resp?.status() || 200})`);
        } else {
          console.log(`⚠️ ISSUES DETECTED`);
          totalErrors += consoleErrors.length + pageErrors.length;
        }

        console.log(`     • Page Title   : "${pageTitle}"`);
        console.log(`     • Rendered H1  : "${heading.slice(0, 70)}"`);
        console.log(`     • DOM Elements : Forms: ${domSummary.forms}, Inputs: ${domSummary.inputs}, Buttons: ${domSummary.buttons}`);
        console.log(`     • Layout Check : Width=${domSummary.bodyWidth}px (Viewport=${domSummary.clientWidth}px) ${domSummary.hasHorizontalOverflow ? '❌ HORIZONTAL OVERFLOW' : '✓ Responsive Fit'}`);
        console.log(`     • Console Logs : ${consoleMessages.length} event(s) captured`);

        if (consoleErrors.length > 0) {
          console.log(`     ❌ Console Errors (${consoleErrors.length}):`);
          consoleErrors.forEach((e) => console.log(`        - ${e}`));
        } else {
          console.log(`     ✓ Console Errors: 0 clean`);
        }

        if (pageErrors.length > 0) {
          console.log(`     ❌ Uncaught Exceptions (${pageErrors.length}):`);
          pageErrors.forEach((e) => console.log(`        - ${e}`));
        } else {
          console.log(`     ✓ Uncaught Exceptions: 0 clean`);
        }
        console.log('');

        testResults.push({
          viewport: vp.name,
          role: testCase.role,
          label: testCase.label,
          path: testCase.path,
          status: resp?.status() || 200,
          title: pageTitle,
          heading,
          consoleErrorsCount: consoleErrors.length,
          pageErrorsCount: pageErrors.length,
          overflow: domSummary.hasHorizontalOverflow,
        });
      } catch (navErr) {
        console.log(`❌ FAILED: ${navErr.message}\n`);
        totalErrors++;
        testResults.push({
          viewport: vp.name,
          role: testCase.role,
          label: testCase.label,
          path: testCase.path,
          error: navErr.message,
        });
      }
    }

    await context.close();
  }

  await browser.close();

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📊 PLAYWRIGHT CROSS-VIEWPORT TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Total Pages & Viewports Tested : ${totalTested}`);
  console.log(`Total Errors / Exceptions      : ${totalErrors}`);
  console.log(`Pass Rate                      : ${totalErrors === 0 ? '100% PERFECT' : ((1 - totalErrors / totalTested) * 100).toFixed(1) + '%'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  if (totalErrors > 0) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('Fatal Playwright runner error:', err);
  process.exit(1);
});
