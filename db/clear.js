// Deletes all seeded BUSINESS data (clients, projects, employees, contractors,
// firms, documents + their files/thread/history, snags, dues, schedule
// activities) plus the placeholder files that went with them in Firebase
// Storage. Lookup/config tables (disciplines, departments, categories,
// priorities, review codes, doc types, statuses) are left untouched — that's
// the Aconex numbering standard the app needs to keep functioning.
//
// Run this once before switching a project over to real data.
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');
const { bucket } = require('../config/firebase');

// Child tables first, respecting FK dependencies.
const TABLES_IN_ORDER = [
  'DccDocumentThread',
  'DccDocumentHistory',
  'DccDocumentFiles',
  'DccDocuments',
  'DccProjectAssignments',
  'DccSnags',
  'DccDues',
  'DccScheduleActivities',
  'DccContractors',
  'DccProjects',
  'DccEmployees',
  'DccFirms',
  'DccClients',
];

async function clear() {
  const pool = await getPool();
  for (const table of TABLES_IN_ORDER) {
    const result = await pool.request().query(`DELETE FROM dbo.${table}`);
    console.log(`${table.padEnd(25)} ${result.rowsAffected[0]} row(s) deleted`);
  }

  const [files] = await bucket.getFiles({ prefix: 'documents/' });
  await Promise.all(files.map((f) => f.delete()));
  console.log(`Firebase Storage      ${files.length} file(s) deleted under documents/`);

  console.log('Business data cleared. Lookup/config tables were left untouched.');
  await sql.close();
}

clear().catch((err) => {
  console.error('Clear failed:', err.message);
  process.exit(1);
});
