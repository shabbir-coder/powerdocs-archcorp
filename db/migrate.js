const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');

async function migrate() {
  const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = raw.split('@@SPLIT@@').map((s) => s.trim()).filter(Boolean);

  const pool = await getPool();
  for (const [i, statement] of statements.entries()) {
    try {
      await pool.request().query(statement);
    } catch (err) {
      console.error(`Statement ${i + 1} failed:\n${statement}\n`);
      throw err;
    }
  }
  console.log(`Migration complete — ${statements.length} table(s) verified.`);
  await sql.close();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
