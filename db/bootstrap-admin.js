// One-time bootstrap: creates the first Admin account after `npm run clear`,
// so there's a real way back into the app before other employee/contractor
// data is entered by hand through the Admin panel.
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');
const employeeModel = require('../models/employee.model');
const { hashPassword } = require('../utils/password');
const { genId } = require('../utils/id');

const ADMIN = {
  name: 'Vibin Verghese',
  email: 'vibin.v@archcorp.ae',
  disc: 'BIM',
  dept: 'BIM & Technology',
  role: 'Admin',
  title: 'IT Lead & Super Admin',
  password: 'powerdocs2026',
};

async function run() {
  const pool = await getPool();
  const existing = await employeeModel.findByEmail(pool, ADMIN.email);
  const passwordHash = await hashPassword(ADMIN.password);
  if (existing) {
    await employeeModel.setPassword(pool, existing.id, passwordHash);
    console.log(`${ADMIN.email} already existed (Id ${existing.id}) — password reset instead.`);
  } else {
    const employee = await employeeModel.insert(pool, { id: genId('e'), ...ADMIN, passwordHash });
    console.log(`Created Admin ${employee.name} (${employee.id}, ${employee.email}).`);
  }
  await sql.close();
}

run().catch((err) => {
  console.error('Bootstrap admin failed:', err.message);
  process.exit(1);
});
