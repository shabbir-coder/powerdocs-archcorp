// Phase 1 of the PowerDocs → DCC migration: copies people, firms, projects and
// project assignments from the legacy PowerDocs tables in NCRM into the Dcc* tables
// in SB. NCRM is only ever read (SELECTs only) — the old app keeps running untouched.
//
//   npm run migrate:powerdocs            dry run: does every insert, prints a report, rolls back
//   npm run migrate:powerdocs -- --apply   same, but commits
//
// Ids are deterministic (e_pd<U_id>, c_pd<id>, p_pd<id>, f_pd<hash>) so the script is
// safe to re-run and Phase 2 (documents) can map legacy ids without a lookup table.
// Rows that already exist are left as they are — re-running never overwrites edits
// made in DCC since the last run.
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');

const APPLY = process.argv.includes('--apply');
const LEGACY_DB = process.env.LEGACY_DB_DATABASE || 'NCRM';

// Shared "Admin" login on a personal gmail — not a real person, not carried over.
const SKIP_USER_IDS = [1];

const LEGACY_CLIENT = { id: 'cl_pdlegacy', name: 'PowerDocs Legacy (client not set)', code: 'PD-LEGACY', city: '-' };

const ids = {
  employee: (uId) => `e_pd${uId}`,
  contractor: (id) => `c_pd${id}`,
  project: (id) => `p_pd${id}`,
  firm: (name) => `f_pd${crypto.createHash('sha1').update(normName(name)).digest('hex').slice(0, 8)}`,
};

function normName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normEmail(s) {
  return String(s || '').trim().toLowerCase();
}

// NCRM "Section" → DCC discipline. Sections that aren't a discipline (Admin, Document
// Controller, Planning…) get '-' for an admin to set in the Employees screen.
function toDisc(section) {
  const s = normName(section);
  if (s.includes('archit')) return 'Architecture';
  if (s.includes('struct')) return 'Structure';
  if (s.includes('civil')) return 'Civil';
  if (s.includes('mechan')) return 'Mechanical';
  if (s.includes('electr')) return 'Electrical';
  if (s === 'it' || s.includes('developer')) return 'BIM';
  return '-';
}

function toDept(section) {
  const s = normName(section);
  if (!s) return '-';
  if (s.includes('inspector') || s.includes('resident') || s.includes('site')) return 'Supervision';
  if (s.includes('engineer') || s.includes('struct')) return 'Engineering';
  if (s.includes('archit')) return 'Design';
  if (s === 'it' || s.includes('developer')) return 'BIM & Technology';
  return String(section).trim();
}

const NOISE = new Set(['llc', 'l.l.c', 'l.l.c.', 'co', 'co.', 'and', '&', 'the']);
function firmCode(name, taken) {
  const words = String(name).trim().split(/\s+/).filter((w) => !NOISE.has(w.toLowerCase()));
  const base = (words.map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'FIRM').slice(0, 6);
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
  taken.add(code);
  return code;
}

async function readLegacy() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: LEGACY_DB,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      readOnlyIntent: true,
    },
  }).connect();
  const q = async (text) => (await pool.request().query(text)).recordset;

  const assignments = await q('SELECT project_id, assignee_id, assignee_type FROM dbo.project_assignment');

  // Only projects PowerDocs actually used — A_project is the company-wide project list.
  const projects = await q(`
    SELECT p.id, p.Unique_Project_Code, p.Description,
           (SELECT MIN(d.created_at) FROM dbo.documents d WHERE d.project_id = p.id) AS first_doc
    FROM dbo.A_project p
    WHERE p.id IN (SELECT project_id FROM dbo.project_assignment UNION SELECT project_id FROM dbo.documents)`);

  const employees = await q(`
    SELECT u.U_id, u.Full_Name, u.U_Email_ID, u.is_powerdocs_admin, d.Description AS designation, s.Description AS section
    FROM dbo.DbUsers u
    LEFT JOIN dbo.User_desg d ON CAST(d.id AS NVARCHAR(50)) = u.desgnation
    LEFT JOIN dbo.User_Type_section s ON s.id = u.Section
    WHERE u.U_id IN (SELECT assignee_id FROM dbo.project_assignment WHERE assignee_type <> 'CONTRACTOR')
       OR (u.is_powerdocs_admin = 1 AND u.IsActive = 1)`);

  const contractors = await q(
    'SELECT id, first_name, last_name, email, password, designation, representing_firm FROM dbo.contractors');

  await pool.close();
  return { assignments, projects, employees, contractors };
}

async function run() {
  const legacy = await readLegacy();
  const report = { inserted: {}, existing: {}, skipped: [] };
  const bump = (bucket, key) => { report[bucket][key] = (report[bucket][key] || 0) + 1; };

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const req = () => new sql.Request(tx);
  const q = async (text) => (await req().query(text)).recordset;

  try {
    // ── Existing SB state (for idempotency + email collisions) ──
    const sbEmployees = new Map((await q('SELECT Id, LOWER(LTRIM(RTRIM(Email))) AS e FROM dbo.DccEmployees')).map((r) => [r.e, r.Id]));
    const sbContractors = new Map((await q('SELECT Id, LOWER(LTRIM(RTRIM(Email))) AS e FROM dbo.DccContractors')).map((r) => [r.e, r.Id]));
    const sbFirms = await q('SELECT Id, Name, Code FROM dbo.DccFirms');
    const firmByName = new Map(sbFirms.map((f) => [normName(f.Name), f.Id]));
    const takenCodes = new Set(sbFirms.map((f) => f.Code));
    const sbProjects = await q('SELECT Id, Pid FROM dbo.DccProjects');
    const projectIds = new Set(sbProjects.map((p) => p.Id));
    const projectByPid = new Map(sbProjects.map((p) => [p.Pid, p.Id]));

    // legacy id → DCC id, filled as each entity is resolved
    const empMap = new Map();
    const conMap = new Map();
    const projMap = new Map();

    // ── Employees ──
    for (const u of legacy.employees) {
      const email = normEmail(u.U_Email_ID);
      if (SKIP_USER_IDS.includes(Number(u.U_id))) { report.skipped.push(`employee ${u.U_id} (${u.Full_Name}): shared admin account`); continue; }
      if (!email || !u.Full_Name) { report.skipped.push(`employee ${u.U_id}: missing name or email`); continue; }
      if (sbContractors.has(email)) { report.skipped.push(`employee ${u.U_id} (${email}): email already used by contractor ${sbContractors.get(email)}`); continue; }
      if (sbEmployees.has(email)) { empMap.set(String(u.U_id), sbEmployees.get(email)); bump('existing', 'employees'); continue; }

      const id = ids.employee(u.U_id);
      await req()
        .input('id', id).input('name', u.Full_Name.trim()).input('email', email)
        .input('disc', toDisc(u.section)).input('dept', toDept(u.section))
        .input('role', u.is_powerdocs_admin ? 'Admin' : 'Reviewer')
        .input('title', (u.designation || '-').trim().slice(0, 150))
        .query(`INSERT INTO dbo.DccEmployees (Id, Name, Email, Disc, Dept, Role, Title)
                VALUES (@id, @name, @email, @disc, @dept, @role, @title)`);
      sbEmployees.set(email, id);
      empMap.set(String(u.U_id), id);
      bump('inserted', 'employees');
    }

    // ── Firms + contractors ──
    for (const c of legacy.contractors) {
      const email = normEmail(c.email);
      const name = `${(c.first_name || '').trim()} ${(c.last_name || '').trim()}`.trim();
      if (!email || !name) { report.skipped.push(`contractor ${c.id}: missing name or email`); continue; }
      if (!c.representing_firm || !c.representing_firm.trim()) { report.skipped.push(`contractor ${c.id} (${email}): no representing firm`); continue; }
      if (sbEmployees.has(email)) { report.skipped.push(`contractor ${c.id} (${email}): email already used by employee ${sbEmployees.get(email)}`); continue; }
      if (sbContractors.has(email)) { conMap.set(String(c.id), sbContractors.get(email)); bump('existing', 'contractors'); continue; }

      const firmName = c.representing_firm.trim().replace(/\s+/g, ' ');
      let firmId = firmByName.get(normName(firmName));
      if (!firmId) {
        firmId = ids.firm(firmName);
        await req().input('id', firmId).input('name', firmName.slice(0, 200)).input('code', firmCode(firmName, takenCodes))
          .query('INSERT INTO dbo.DccFirms (Id, Name, Code) VALUES (@id, @name, @code)');
        firmByName.set(normName(firmName), firmId);
        bump('inserted', 'firms');
      }

      const id = ids.contractor(c.id);
      // Legacy hashes are bcrypt ($2b$) — bcryptjs verifies them, so passwords keep working.
      await req()
        .input('id', id).input('name', name).input('email', email).input('firm', firmId)
        .input('title', (c.designation || '-').trim().slice(0, 150))
        .input('hash', sql.NVarChar(255), c.password || null)
        .query(`INSERT INTO dbo.DccContractors (Id, Name, Email, FirmId, Title, PasswordHash)
                VALUES (@id, @name, @email, @firm, @title, @hash)`);
      sbContractors.set(email, id);
      conMap.set(String(c.id), id);
      bump('inserted', 'contractors');
    }

    // ── Projects ──
    // PowerDocs never stored a client, city or start date — they get placeholders here.
    const [clientExists] = await q(`SELECT COUNT(*) AS n FROM dbo.DccClients WHERE Id = '${LEGACY_CLIENT.id}'`);
    if (!clientExists.n) {
      await req().input('id', LEGACY_CLIENT.id).input('name', LEGACY_CLIENT.name).input('code', LEGACY_CLIENT.code).input('city', LEGACY_CLIENT.city)
        .query('INSERT INTO dbo.DccClients (Id, Name, Code, City) VALUES (@id, @name, @code, @city)');
      bump('inserted', 'clients');
    }

    for (const p of legacy.projects) {
      const id = ids.project(p.id);
      const pid = String(p.Unique_Project_Code || '').trim();
      if (projectIds.has(id)) { projMap.set(String(p.id), id); bump('existing', 'projects'); continue; }
      if (!pid) { report.skipped.push(`project ${p.id}: no Unique_Project_Code`); continue; }
      if (projectByPid.has(pid)) { report.skipped.push(`project ${p.id}: Pid ${pid} already used by ${projectByPid.get(pid)}`); continue; }

      await req()
        .input('id', id).input('pid', pid)
        .input('name', String(p.Description || pid).trim().slice(0, 300))
        .input('client', LEGACY_CLIENT.id).input('city', '-').input('status', 'Construction')
        .input('start', sql.Date, p.first_doc || new Date())
        .query(`INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate)
                VALUES (@id, @pid, @name, @client, @city, @status, @start)`);
      projectIds.add(id);
      projectByPid.set(pid, id);
      projMap.set(String(p.id), id);
      bump('inserted', 'projects');
    }

    // ── Assignments ──
    // ENGINEER and RE/DC both become 'internal' — DCC has no RE/DC role, so a person
    // listed as both on one project collapses to a single row.
    const existingAssignments = new Set(
      (await q('SELECT ProjectId, PersonId, PersonType FROM dbo.DccProjectAssignments'))
        .map((a) => `${a.ProjectId}|${a.PersonId}|${a.PersonType}`));

    for (const a of legacy.assignments) {
      const isContractor = a.assignee_type === 'CONTRACTOR';
      const personType = isContractor ? 'contractor' : 'internal';
      const personId = (isContractor ? conMap : empMap).get(String(a.assignee_id));
      const projectId = projMap.get(String(a.project_id));
      if (!personId || !projectId) {
        bump('existing', 'assignments skipped (person/project not migrated)');
        continue;
      }
      const key = `${projectId}|${personId}|${personType}`;
      if (existingAssignments.has(key)) { bump('existing', 'assignments'); continue; }

      await req().input('project', projectId).input('person', personId).input('type', personType)
        .query('INSERT INTO dbo.DccProjectAssignments (ProjectId, PersonId, PersonType) VALUES (@project, @person, @type)');
      existingAssignments.add(key);
      bump('inserted', 'assignments');
    }

    if (APPLY) await tx.commit();
    else await tx.rollback();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }

  console.log(`\nPowerDocs Phase 1 — ${LEGACY_DB} → ${process.env.DB_DATABASE} ${APPLY ? '(APPLIED)' : '(DRY RUN — rolled back)'}`);
  console.log('Inserted:', report.inserted);
  console.log('Already present / not carried:', report.existing);
  if (report.skipped.length) console.log('Skipped:\n  ' + report.skipped.join('\n  '));
  if (!APPLY) console.log('\nRe-run with --apply to commit.');
  await pool.close();
}

run().catch((err) => {
  console.error('PowerDocs Phase 1 migration failed:', err.message);
  process.exit(1);
});
