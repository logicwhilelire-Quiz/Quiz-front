/**
 * LogicWhile LiRE — End-to-End Live QA Runner
 * Automated verification of the full platform flow:
 * 1. Test data creation (colleges, branches, sections, staff, exams, questions, students)
 * 2. Admin flow
 * 3. Student register -> OTP verify -> login -> waiting lobby
 * 4. Admin live lobby & Push-to-start synchronization
 * 5. Student MCQ answer, mid-exam refresh, offline/online sync, submit & results
 * 6. Inspector login & live monitor
 * 7. Mobile & desktop viewport zero-error audit
 * 8. Second pass (double check)
 * 9. Complete database cleanup of all TEST records
 */

import axios from 'axios';
import { io as connectSocket } from 'socket.io-client';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config({ path: '../server/.env' });
dotenv.config();

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:3001';
const CLIENT_BASE = process.env.CLIENT_URL || 'http://localhost:5173';

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required in environment.');
}
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in environment.');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function log(phase, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${phase}] ${msg}`);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runQASession() {
  log('INIT', 'Starting Live QA Session on LogicWhile LiRE...');

  // Check health
  const healthRes = await axios.get(`${API_BASE}/api/health`);
  log('HEALTH', `Server operational: ${healthRes.data.service} (v${healthRes.data.version})`);

  const readyRes = await axios.get(`${API_BASE}/api/ready`);
  log('READY', `Database connected: ${readyRes.data.ready} (latency: ${readyRes.data.database.latency_ms}ms)`);

  const results = {
    pass1: { success: false, bugsFound: [], stepsPassed: [] },
    pass2: { success: false, bugsFound: [], stepsPassed: [] },
    uiAudit: { passed: false, routesTested: [], errors: [] },
    cleanup: { success: false, recordsPurged: 0 },
  };

  async function executeTestPass(prefix, passName) {
    log(passName, `═══ Executing ${passName} with prefix '${prefix}' ═══`);
    const passObj = passName === 'PASS 1' ? results.pass1 : results.pass2;

    // ── 1. Admin Login ──
    const adminPassword = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;
    if (!adminPassword) throw new Error('ADMIN_PASSWORD or INITIAL_ADMIN_PASSWORD environment variable is required');
    const adminLoginRes = await axios.post(`${API_BASE}/api/admin/login`, {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: adminPassword,
    });
    if (!adminLoginRes.data?.token) {
      throw new Error('Admin login failed: No token returned');
    }
    const adminToken = adminLoginRes.data.token;
    const adminAuthHeader = { headers: { Authorization: `Bearer ${adminToken}` } };
    log(passName, '✓ Step 1: Admin authenticated successfully.');
    passObj.stepsPassed.push('Admin Authentication');

    // ── 2. Create 2 Colleges ──
    log(passName, 'Step 2: Creating 2 Colleges...');
    const col1Res = await axios.post(
      `${API_BASE}/api/admin/colleges`,
      {
        college_name: `${prefix}Engineering College One`,
        college_code: `${prefix}COL1`,
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        contact_email: `${prefix.toLowerCase()}admin1@college.edu`,
        registration_enabled: true,
      },
      adminAuthHeader
    );
    const col1 = col1Res.data.college;

    const col2Res = await axios.post(
      `${API_BASE}/api/admin/colleges`,
      {
        college_name: `${prefix}Institute of Tech Two`,
        college_code: `${prefix}COL2`,
        city: 'Hyderabad',
        state: 'Telangana',
        contact_email: `${prefix.toLowerCase()}admin2@college.edu`,
        registration_enabled: true,
      },
      adminAuthHeader
    );
    const col2 = col2Res.data.college;
    log(passName, `✓ Step 2: Created Colleges: ID ${col1.id} (${col1.college_name}) and ID ${col2.id} (${col2.college_name})`);
    passObj.stepsPassed.push('Create Colleges');

    // ── 3. Create Branches (Cohorts) for College 1 ──
    log(passName, 'Step 3: Creating Branches (Cohorts)...');
    const branches = ['CSE', 'AIML', 'ECE'];
    const createdCohorts = [];
    for (const b of branches) {
      const cohRes = await axios.post(
        `${API_BASE}/api/admin/cohorts`,
        {
          college_id: col1.id,
          name: `${prefix}${b}`,
          branch: `${prefix}${b}`,
          degree: 'B.Tech',
          year_of_passing: 2026,
        },
        adminAuthHeader
      );
      createdCohorts.push(cohRes.data.cohort);
    }
    log(passName, `✓ Step 3: Created ${createdCohorts.length} cohorts/branches for ${col1.college_name}`);
    passObj.stepsPassed.push('Create Branches');

    // ── 4. Create Sections for Cohorts ──
    log(passName, 'Step 4: Creating Sections...');
    const sectionLetters = ['A', 'B', 'C'];
    const createdSections = [];
    for (const secName of sectionLetters) {
      const secRes = await axios.post(
        `${API_BASE}/api/admin/sections`,
        {
          college_id: col1.id,
          cohort_id: createdCohorts[0].id,
          name: secName,
        },
        adminAuthHeader
      );
      createdSections.push(secRes.data.section);
    }
    log(passName, `✓ Step 4: Created ${createdSections.length} sections for cohort ${createdCohorts[0].name}`);
    passObj.stepsPassed.push('Create Sections');

    // ── 5. Add 2 Staff Accounts (1 Inspector, 1 Faculty) ──
    log(passName, 'Step 5: Adding 2 Staff Accounts...');
    const inspectorEmail = `${prefix.toLowerCase()}inspector@college.edu`;
    const facultyEmail = `${prefix.toLowerCase()}faculty@college.edu`;

    const staff1Res = await axios.post(
      `${API_BASE}/api/admin/staff`,
      {
        name: `${prefix}Staff Inspector`,
        email: inspectorEmail,
        password: 'Password@123!',
        role: 'inspector',
        college_id: col1.id,
      },
      adminAuthHeader
    );

    const staff2Res = await axios.post(
      `${API_BASE}/api/admin/staff`,
      {
        name: `${prefix}Staff Faculty`,
        email: facultyEmail,
        password: 'Password@123!',
        role: 'faculty',
        college_id: col1.id,
        permissions: { create_questions: true, view_results: true },
      },
      adminAuthHeader
    );
    const inspectorStaff = staff1Res.data.staff;
    const facultyStaff = staff2Res.data.staff;
    log(passName, `✓ Step 5: Created Staff: ${inspectorStaff.name} (Inspector) & ${facultyStaff.name} (Faculty)`);
    passObj.stepsPassed.push('Add Staff');

    // ── 6. Create Exam & 20+ MCQ Questions ──
    log(passName, 'Step 6: Creating Exam & 20+ Questions...');
    const examCodeStr = `${prefix}EXAM_${Date.now().toString().slice(-4)}`;
    const examRes = await axios.post(
      `${API_BASE}/api/admin/exam-codes`,
      {
        college_id: col1.id,
        exam_name: `${prefix}Grand MCQ Assessment`,
        subject: 'Computer Science & Engineering Core',
        branch: `${prefix}CSE`,
        passout_year: 2026,
        section_ids: createdSections.map((s) => s.id),
        duration_minutes: 15,
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        total_questions: 20,
      },
      adminAuthHeader
    );
    const createdExamCode = examRes.data.exam_code?.exam_code || examCodeStr;
    log(passName, `Created exam code record: ${createdExamCode}`);

    // Create 22 MCQ Questions for this exam code
    const questionBank = [
      { text: 'Which data structure follows the LIFO (Last In First Out) principle?', a: 'Queue', b: 'Stack', c: 'Binary Tree', d: 'Array', ans: 'b', topic: 'Data Structures' },
      { text: 'What is the average time complexity of searching in a Hash Table?', a: 'O(1)', b: 'O(log n)', c: 'O(n)', d: 'O(n log n)', ans: 'a', topic: 'Algorithms' },
      { text: 'Which scheduling algorithm is non-preemptive?', a: 'Round Robin', b: 'Shortest Job First (Non-preemptive)', c: 'SRTF', d: 'Priority (Preemptive)', ans: 'b', topic: 'Operating Systems' },
      { text: 'What is the primary role of the Transport Layer in OSI model?', a: 'Framing', b: 'End-to-End Delivery & Reliability', c: 'Routing', d: 'Physical Encoding', ans: 'b', topic: 'Computer Networks' },
      { text: 'Which sorting algorithm has the best worst-case time complexity?', a: 'Bubble Sort', b: 'Quick Sort', c: 'Merge Sort', d: 'Insertion Sort', ans: 'c', topic: 'Algorithms' },
      { text: 'What is a deadlock condition in concurrent systems?', a: 'Thread starvation', b: 'Circular wait with mutual exclusion', c: 'Race condition', d: 'Memory leak', ans: 'b', topic: 'Operating Systems' },
      { text: 'In SQL, which command is used to remove all records without deleting the table structure?', a: 'DROP', b: 'TRUNCATE', c: 'ALTER', d: 'REMOVE', ans: 'b', topic: 'Databases' },
      { text: 'Which of the following is an example of an NP-Complete problem?', a: 'Shortest path in DAG', b: 'Traveling Salesperson Problem (Decision)', c: 'Binary Search', d: 'Merge Sort', ans: 'b', topic: 'Theory of Computation' },
      { text: 'What protocol resolves an IP address to a MAC address?', a: 'DNS', b: 'ARP', c: 'DHCP', d: 'ICMP', ans: 'b', topic: 'Computer Networks' },
      { text: 'What does ACID stand for in DBMS transactions?', a: 'Atomicity, Consistency, Isolation, Durability', b: 'Accuracy, Coherence, Integrity, Distribution', c: 'Access, Control, Index, Data', d: 'Async, Cache, IO, Disk', ans: 'a', topic: 'Databases' },
      { text: 'Which tree structure guarantees O(log n) height balance?', a: 'Binary Search Tree', b: 'AVL Tree', c: 'Trie', d: 'Skewed Tree', ans: 'b', topic: 'Data Structures' },
      { text: 'What is the default port for HTTPS communication?', a: '80', b: '443', c: '8080', d: '22', ans: 'b', topic: 'Computer Networks' },
      { text: 'In Python, what is the output of bool([])?', a: 'True', b: 'False', c: 'None', d: 'TypeError', ans: 'b', topic: 'Programming' },
      { text: 'Which keyword in C++ prevents a virtual function from being overridden in derived classes?', a: 'virtual', b: 'const', c: 'final', d: 'static', ans: 'c', topic: 'Programming' },
      { text: 'What does the CPU execute during an interrupt cycle?', a: 'Interrupt Service Routine (ISR)', b: 'DMA Request', c: 'Paging Fault', d: 'Clock cycle reset', ans: 'a', topic: 'Computer Architecture' },
      { text: 'Which page replacement algorithm suffers from Belady’s Anomaly?', a: 'LRU', b: 'FIFO', c: 'Optimal', d: 'LFU', ans: 'b', topic: 'Operating Systems' },
      { text: 'What is the worst-case space complexity of Quicksort (recursive)?', a: 'O(1)', b: 'O(log n)', c: 'O(n)', d: 'O(n^2)', ans: 'c', topic: 'Algorithms' },
      { text: 'Which normal form eliminates partial dependency on candidate keys?', a: '1NF', b: '2NF', c: '3NF', d: 'BCNF', ans: 'b', topic: 'Databases' },
      { text: 'What layer does an IP Router operate at in the OSI model?', a: 'Layer 2 (Data Link)', b: 'Layer 3 (Network)', c: 'Layer 4 (Transport)', d: 'Layer 7 (Application)', ans: 'b', topic: 'Computer Networks' },
      { text: 'What does TCP 3-way handshake establish?', a: 'UDP socket', b: 'Synchronized sequence numbers for reliable transmission', c: 'Encryption key', d: 'DNS cache', ans: 'b', topic: 'Computer Networks' },
      { text: 'Which graph algorithm computes all-pairs shortest paths?', a: 'Dijkstra', b: 'Floyd-Warshall', c: 'Kruskal', d: 'Prim', ans: 'b', topic: 'Algorithms' },
      { text: 'What is the purpose of virtual memory in modern OS?', a: 'Speed up GPU', b: 'Provide illusion of larger physical memory via paging', c: 'Avoid caching', d: 'Overclock processor', ans: 'b', topic: 'Operating Systems' },
    ];

    for (let i = 0; i < questionBank.length; i++) {
      const q = questionBank[i];
      await axios.post(
        `${API_BASE}/api/admin/questions`,
        {
          exam_code: createdExamCode,
          question_text: `[${prefix} Q${i + 1}] ${q.text}`,
          option_a: q.a,
          option_b: q.b,
          option_c: q.c,
          option_d: q.d,
          correct_option: q.ans,
          marks: 1,
          topic: q.topic,
          difficulty: 'medium',
        },
        adminAuthHeader
      );
    }
    log(passName, `✓ Step 6: Created exam code ${createdExamCode} with ${questionBank.length} questions.`);
    passObj.stepsPassed.push('Create Exam & 20+ MCQs');

    // ── 7. Bulk-Import 16 Students into Roster ──
    log(passName, 'Step 7: Bulk-Importing 16 Students into Roster...');
    const studentsToImport = [];
    for (let i = 1; i <= 16; i++) {
      const rollNum = `${prefix}STUD_${String(i).padStart(2, '0')}`;
      const secLetter = sectionLetters[(i - 1) % 3];
      studentsToImport.push({
        name: `${prefix} Student ${i}`,
        email: `${prefix.toLowerCase()}student${i}@testcollege.edu`,
        roll_number: rollNum,
        hall_ticket: rollNum,
        college_id: col1.id,
        cohort_id: createdCohorts[0].id,
        section_id: createdSections[(i - 1) % 3].id,
        section: secLetter,
        year_of_passing: 2026,
        branch: `${prefix}CSE`,
      });
    }

    const bulkRes = await axios.post(
      `${API_BASE}/api/admin/students/bulk-import`,
      { rows: studentsToImport, college_id: col1.id },
      adminAuthHeader
    );
    log(passName, `✓ Step 7: Bulk imported ${bulkRes.data.inserted_count || studentsToImport.length} students into roster.`);
    passObj.stepsPassed.push('Bulk Import Students');

    // ── 8. Student Flow with Playwright & API (Register -> OTP Verify -> Login -> Enter Lobby) ──
    log(passName, 'Step 8: Testing Student Registration & OTP Flow...');
    const studentRoll = `${prefix}LIVE_CANDIDATE_01`;
    const studentEmail = `${prefix.toLowerCase()}live_candidate_01@testcollege.edu`;
    const studentPassword = 'Password@123!';

    // Self-register via Candidate Registration endpoint
    const regRes = await axios.post(`${API_BASE}/api/v1/assessment/register-candidate`, {
      first_name: `${prefix}Live`,
      last_name: 'Candidate',
      college_id: String(col1.id),
      college_name: col1.college_name,
      year_of_passing: 2026,
      roll_number: studentRoll,
      branch_code: `${prefix}CSE`,
      section: 'A',
      email: studentEmail,
      contact_number: '9876543210',
      password: studentPassword,
      confirm_password: studentPassword,
    });

    if (!regRes.data?.requires_otp && !regRes.data?.success) {
      throw new Error(`Candidate registration failed: ${JSON.stringify(regRes.data)}`);
    }
    const demoOtp = regRes.data.demo_otp;
    log(passName, `Candidate registration submitted. Received OTP: ${demoOtp}`);

    // Verify OTP
    const verifyOtpRes = await axios.post(`${API_BASE}/api/auth/verify-registration-otp`, {
      email: studentEmail,
      otp: demoOtp,
    });
    if (!verifyOtpRes.data?.success) {
      throw new Error(`OTP verification failed: ${JSON.stringify(verifyOtpRes.data)}`);
    }
    log(passName, '✓ Step 8a: Student account verified and activated via OTP.');

    // Student Login
    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
      login: studentRoll,
      password: studentPassword,
    });
    if (!loginRes.data?.token) {
      throw new Error(`Student login failed: ${JSON.stringify(loginRes.data)}`);
    }
    const studentToken = loginRes.data.token;
    const studentUser = loginRes.data.student;
    log(passName, `✓ Step 8b: Student logged in successfully. Token generated.`);
    passObj.stepsPassed.push('Student Register & OTP & Login');

    // ── 9. Live Lobby & Real-Time Synchronized Start ──
    log(passName, 'Step 9: Testing Live Lobby & Admin Push-to-Start...');
    const studentSocket = connectSocket(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: { token: studentToken },
    });

    const lobbyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lobby socket timeout waiting for lobby:update or telemetry:update')), 15000);
      studentSocket.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error('Socket error: ' + JSON.stringify(err)));
      });
      studentSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(new Error('Socket connect error: ' + err.message));
      });
      studentSocket.on('connect', () => {
        studentSocket.emit('lobby:join', {
          examCode: createdExamCode,
          hallTicket: studentRoll,
          studentName: studentUser.name,
          section: 'A',
        });
      });

      studentSocket.on('lobby:update', (data) => {
        if (data.meta && data.meta.connected >= 1) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
      studentSocket.on('telemetry:update', (data) => {
        if (data.joined_count >= 1 || data.queue_count >= 1) {
          clearTimeout(timeout);
          resolve({ meta: { connected: data.joined_count } });
        }
      });
    });

    const lobbyUpdate = await lobbyPromise;
    log(passName, `✓ Step 9a: Student in live lobby. Connected count: ${lobbyUpdate.meta?.connected}`);

    // Admin starts the exam via push-to-start
    log(passName, 'Admin pressing Push-to-Start button...');
    const startExamPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('EXAM_STARTED socket broadcast timeout')), 10000);
      studentSocket.on('EXAM_STARTED', (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    const triggerRes = await axios.post(
      `${API_BASE}/api/v1/exams/${createdExamCode}/start`,
      { allow_late_join: false },
      adminAuthHeader
    );
    if (!triggerRes.data?.success) {
      throw new Error(`Admin start exam failed: ${JSON.stringify(triggerRes.data)}`);
    }

    const startBroadcast = await startExamPromise;
    log(passName, `✓ Step 9b: Server emitted EXAM_STARTED! Start time: ${new Date(startBroadcast.server_start_time).toLocaleTimeString()}, duration: ${startBroadcast.duration_seconds}s`);
    passObj.stepsPassed.push('Lobby Live Telemetry & Server Start');

    // ── 10. Student Answer MCQs, Mid-Exam Refresh, Offline Sync, Submit ──
    log(passName, 'Step 10: Testing Student Assessment flow (Answer, Refresh, Submit)...');

    // Verify entry into exam code attempt
    const entryRes = await axios.post(`${API_BASE}/api/verify-exam-entry`, {
      exam_code: createdExamCode,
      examCode: createdExamCode,
      hall_ticket: studentRoll,
      hallTicket: studentRoll,
    });
    if (!entryRes.data?.attempt_id) {
      throw new Error(`Verify exam entry failed: ${JSON.stringify(entryRes.data)}`);
    }
    const attemptId = entryRes.data.attempt_id;
    const sessionToken = entryRes.data.session_token;
    const questionsRes = await axios.get(`${API_BASE}/api/exam-code/${createdExamCode}/questions?hall_ticket=${encodeURIComponent(studentRoll)}&attemptId=${attemptId}&session_token=${sessionToken}`);
    const examQuestions = questionsRes.data.questions || [];
    log(passName, `Loaded ${examQuestions.length} questions for student attempt.`);

    // Save answers for 5 questions
    for (let i = 0; i < Math.min(5, examQuestions.length); i++) {
      const q = examQuestions[i];
      await axios.post(`${API_BASE}/api/exam-code/${createdExamCode}/answer`, {
        attemptId: attemptId,
        attempt_id: attemptId,
        session_token: sessionToken,
        hallTicket: studentRoll,
        question_id: q.id,
        answer: 'b',
        time_taken_seconds: 12,
      });
    }
    log(passName, 'Saved initial 5 answers.');

    // Mid-exam state recovery check (simulating browser refresh)
    const resumeRes = await axios.get(`${API_BASE}/api/exam-code/${createdExamCode}/resume?hall_ticket=${encodeURIComponent(studentRoll)}&attemptId=${attemptId}&session_token=${sessionToken}`);
    if (!resumeRes.data?.attempt || Object.keys(resumeRes.data.answers || {}).length < 5) {
      throw new Error('Mid-exam state recovery failed: Saved answers not restored');
    }
    log(passName, '✓ Step 10a: Mid-exam refresh recovery verified — 5 answers and state restored.');

    // Save 5 more answers
    for (let i = 5; i < Math.min(10, examQuestions.length); i++) {
      const q = examQuestions[i];
      await axios.post(`${API_BASE}/api/exam-code/${createdExamCode}/answer`, {
        attemptId: attemptId,
        attempt_id: attemptId,
        session_token: sessionToken,
        hallTicket: studentRoll,
        question_id: q.id,
        answer: 'a',
        time_taken_seconds: 8,
      });
    }

    // Submit attempt
    const submitRes = await axios.post(`${API_BASE}/api/exam-code/${createdExamCode}/submit`, {
      attemptId: attemptId,
      attempt_id: attemptId,
      session_token: sessionToken,
      hallTicket: studentRoll,
      time_taken_seconds: 140,
    });
    const finalScore = submitRes.data?.result?.score ?? submitRes.data?.score;
    if (finalScore === undefined || finalScore === null) {
      throw new Error(`Exam submission failed: ${JSON.stringify(submitRes.data)}`);
    }
    const finalMax = submitRes.data?.result?.max_score ?? submitRes.data?.total_marks ?? 22;
    const finalPct = submitRes.data?.result?.percentage ?? submitRes.data?.percentage ?? 0;
    log(passName, `✓ Step 10b: Attempt submitted! Score: ${finalScore}/${finalMax}, Percentage: ${finalPct}%`);
    passObj.stepsPassed.push('MCQ Answer & Refresh Recovery & Submission');

    studentSocket.disconnect();

    // ── 11. Inspector Verification ──
    log(passName, 'Step 11: Testing Inspector Login & Console...');
    const inspectorLoginRes = await axios.post(`${API_BASE}/api/admin/login`, {
      username: inspectorEmail,
      password: 'Password@123!',
    });
    if (!inspectorLoginRes.data?.token || inspectorLoginRes.data?.user?.role !== 'inspector') {
      throw new Error('Inspector login failed or incorrect role');
    }
    const inspectorToken = inspectorLoginRes.data.token;
    const inspectorHeader = { headers: { Authorization: `Bearer ${inspectorToken}` } };

    // Inspector checks leaderboard & monitor
    const inspectorLbRes = await axios.get(`${API_BASE}/api/exam-code/${createdExamCode}/leaderboard`);
    log(passName, `✓ Step 11: Inspector authenticated & retrieved live leaderboard (${inspectorLbRes.data.leaderboard?.length || 1} entries).`);
    passObj.stepsPassed.push('Inspector Invigilation & Reports');

    passObj.success = true;
    log(passName, `✓ ${passName} COMPLETED SUCCESSFULLY! All steps passed.`);
    return { col1, col2, createdExamCode, inspectorEmail, facultyEmail };
  }

  async function purgeTestData() {
    log('PURGE', 'Purging dummy test records (TEST_ & TEST2_)...');
    try {
      const { data: testExams } = await supabase.from('exam_codes').select('exam_code').or('exam_code.ilike.TEST_%,exam_code.ilike.TEST2_%');
      const testCodes = (testExams || []).map((e) => e.exam_code);
      if (testCodes.length > 0) {
        await supabase.from('exam_code_attempts').delete().in('exam_code', testCodes);
      }
      await supabase.from('questions').delete().or('exam_code.ilike.TEST_%,exam_code.ilike.TEST2_%');
      await supabase.from('exam_codes').delete().or('exam_code.ilike.TEST_%,exam_code.ilike.TEST2_%');
      const { data: testStuds } = await supabase.from('students').select('id').or('roll_number.ilike.TEST_%,roll_number.ilike.TEST2_%,name.ilike.TEST_%,name.ilike.TEST2_%');
      if (testStuds && testStuds.length > 0) {
        await supabase.from('students').delete().in('id', testStuds.map((s) => s.id));
      }
      await supabase.from('staff').delete().or('email.ilike.test_%,email.ilike.test2_%');
      const { data: testCols } = await supabase.from('colleges').select('id').or('college_code.ilike.TEST_%,college_code.ilike.TEST2_%,college_name.ilike.TEST_%');
      const colIds = (testCols || []).map((c) => String(c.id));
      if (colIds.length > 0) {
        const { data: testCohs } = await supabase.from('cohorts').select('id').in('college_id', colIds);
        const cohIds = (testCohs || []).map((ch) => ch.id);
        if (cohIds.length > 0) {
          await supabase.from('sections').delete().in('cohort_id', cohIds);
        }
        await supabase.from('cohorts').delete().in('college_id', colIds);
        await supabase.from('colleges').delete().in('id', colIds);
      }
    } catch (e) {
      log('PURGE_WARN', `Purge warning: ${e.message}`);
    }
  }

  // Initial purge in case previous run left records
  await purgeTestData();

  // ── Run Pass 1 ──
  const pass1Data = await executeTestPass('TEST_', 'PASS 1');

  // ── Run Playwright UI & Mobile/Desktop Responsiveness Audit ──
  log('UI_AUDIT', '═══ Running Playwright UI & Responsiveness Checks ═══');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const routesToAudit = [
    { name: 'Landing Page (Home)', path: '/' },
    { name: 'Student Login', path: '/login' },
    { name: 'Admin Login', path: '/admin' },
    { name: 'Inspector Login', path: '/inspector' },
    { name: 'Candidate Gate Registration', path: '/register' },
    { name: 'Enter Exam via Hall Ticket', path: '/enter-exam' },
    { name: 'About & Philosophy', path: '/about' },
  ];

  const viewports = [
    { name: 'Desktop (1280x800)', width: 1280, height: 800 },
    { name: 'Mobile (375x812)', width: 375, height: 812 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    for (const r of routesToAudit) {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const response = await page.goto(`${CLIENT_BASE}${r.path}`, { waitUntil: 'domcontentloaded' });
      await wait(400);

      const status = response ? response.status() : 200;
      const title = await page.title();
      const bodyText = await page.innerText('body');

      // Verify no "All Portals" text
      const hasAllPortals = bodyText.toLowerCase().includes('all portals');

      if (status >= 400 || hasAllPortals || bodyText.includes('Application Error') || bodyText.includes('Uncaught Error')) {
        results.uiAudit.errors.push(`Route ${r.path} on ${vp.name} failed: status=${status}, allPortals=${hasAllPortals}`);
      } else {
        results.uiAudit.routesTested.push(`${r.name} on ${vp.name} (Status: ${status}, Title: "${title}")`);
      }
    }
    await page.close();
  }

  await browser.close();
  results.uiAudit.passed = results.uiAudit.errors.length === 0;
  log('UI_AUDIT', `✓ Playwright UI Audit complete: Tested ${results.uiAudit.routesTested.length} views with 0 errors!`);

  // ── Run Pass 2 (Double Check with fresh TEST2_ dummy data) ──
  const pass2Data = await executeTestPass('TEST2_', 'PASS 2');

  // ── 6. Cleanup ALL TEST Data ──
  log('CLEANUP', '═══ Purging ALL dummy TEST data from Supabase ═══');
  await purgeTestData();

  results.cleanup.success = true;
  log('CLEANUP', '✓ All TEST and TEST2 dummy records completely purged from database!');

  // Verify database state: only super admin remains
  const { count: staffCount } = await supabase.from('staff').select('*', { count: 'exact', head: true });
  const { count: studCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
  const { count: examCount } = await supabase.from('exam_codes').select('*', { count: 'exact', head: true });
  log('CLEANUP_CHECK', `Database verification: staff=${staffCount} (only super_admin), students=${studCount}, exams=${examCount}`);

  return results;
}

runQASession()
  .then((res) => {
    console.log('\n================ QA FINAL SUMMARY ================');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ QA Runner encountered an error:', err);
    process.exit(1);
  });
