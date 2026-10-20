// Shared by the PowerDocs → DCC migration scripts (phase 1: people/projects,
// phase 2: documents/history/files). NCRM is only ever read.
const crypto = require('crypto');
const { sql } = require('../config/db');

const LEGACY_DB = process.env.LEGACY_DB_DATABASE || 'NCRM';

const LEGACY_CLIENT = { id: 'cl_pdlegacy', name: 'PowerDocs Legacy (client not set)', code: 'PD-LEGACY', city: '-' };

// Shared "Admin" login on a personal gmail — not a real person, not carried over.
const SKIP_USER_IDS = [1];

// Deterministic ids, so every run maps a legacy row to the same DCC row.
const ids = {
  employee: (uId) => `e_pd${uId}`,
  contractor: (id) => `c_pd${id}`,
  project: (id) => `p_pd${id}`,
  firm: (name) => `f_pd${crypto.createHash('sha1').update(normName(name)).digest('hex').slice(0, 8)}`,
  document: (id) => `d_pd${id}`,
  history: (id) => `h_pd${id}`,
  migrationNote: (docId) => `hm_pd${docId}`,
  remark: (docId) => `th_pd${docId}`,
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

// Employee columns in NCRM, with the designation/section lookups phase 1 maps from.
const EMPLOYEE_SELECT = `
  SELECT u.U_id, u.Full_Name, u.U_Email_ID, u.is_powerdocs_admin, d.Description AS designation, s.Description AS section
  FROM dbo.DbUsers u
  LEFT JOIN dbo.User_desg d ON CAST(d.id AS NVARCHAR(50)) = u.desgnation
  LEFT JOIN dbo.User_Type_section s ON s.id = u.Section`;

async function openLegacy() {
  return new sql.ConnectionPool({
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
}

/** Inserts one legacy DbUsers row as a DCC employee (same mapping as phase 1). */
async function insertEmployee(request, u, id) {
  await request
    .input('id', id).input('name', u.Full_Name.trim()).input('email', normEmail(u.U_Email_ID))
    .input('disc', toDisc(u.section)).input('dept', toDept(u.section))
    .input('role', u.is_powerdocs_admin ? 'Admin' : 'Reviewer')
    .input('title', (u.designation || '-').trim().slice(0, 150))
    .query(`INSERT INTO dbo.DccEmployees (Id, Name, Email, Disc, Dept, Role, Title)
            VALUES (@id, @name, @email, @disc, @dept, @role, @title)`);
}

module.exports = {
  LEGACY_DB, LEGACY_CLIENT, SKIP_USER_IDS, EMPLOYEE_SELECT, ids,
  normName, normEmail, toDisc, toDept, firmCode, openLegacy, insertEmployee,
};
