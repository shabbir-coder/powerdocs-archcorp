const { getPool } = require('../config/db');
const employeeModel = require('../models/employee.model');
const contractorModel = require('../models/contractor.model');
const { comparePassword } = require('../utils/password');
const { signSession } = require('../utils/jwt');
const { verifyMicrosoftToken } = require('../utils/msVerify');

const DEV_BYPASS = process.env.AUTH_DEV_BYPASS === 'true';

function toPublicUser(id, role, name, email, extra) {
  return { id, role, name, email, ...extra };
}

async function loginReviewer(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const pool = await getPool();
    const employee = await employeeModel.findByEmail(pool, email);
    if (!employee || employee.role !== 'Reviewer') return res.status(401).json({ error: 'Invalid email or password' });
    if (!(await comparePassword(password, employee.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    const user = toPublicUser(employee.id, 'Reviewer', employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json({ token: signSession(user), user });
  } catch (err) {
    next(err);
  }
}

async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const pool = await getPool();
    const employee = await employeeModel.findByEmail(pool, email);
    if (!employee || employee.role !== 'Admin') return res.status(401).json({ error: 'Invalid email or password' });
    if (!(await comparePassword(password, employee.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    const user = toPublicUser(employee.id, 'Admin', employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json({ token: signSession(user), user });
  } catch (err) {
    next(err);
  }
}

async function loginContractor(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const pool = await getPool();
    const contractor = await contractorModel.findByEmail(pool, email);
    if (!contractor) return res.status(401).json({ error: 'Invalid email or password' });
    if (!(await comparePassword(password, contractor.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    const user = toPublicUser(contractor.id, 'Contractor', contractor.name, contractor.email, { firm: contractor.firm, title: contractor.title });
    res.json({ token: signSession(user), user });
  } catch (err) {
    next(err);
  }
}

async function devOptions(req, res, next) {
  try {
    if (!DEV_BYPASS) return res.status(404).json({ error: 'Not found' });
    const pool = await getPool();
    const employees = await employeeModel.getAll(pool);
    res.json({ employees: employees.filter((e) => ['Admin', 'Reviewer'].includes(e.role)).map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, title: e.title })) });
  } catch (err) {
    next(err);
  }
}

async function loginDev(req, res, next) {
  try {
    if (!DEV_BYPASS) return res.status(404).json({ error: 'Not found' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const pool = await getPool();
    const employee = await employeeModel.getById(pool, employeeId);
    if (!employee || !['Admin', 'Reviewer'].includes(employee.role)) return res.status(404).json({ error: 'Employee not found' });
    const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json({ token: signSession(user), user });
  } catch (err) {
    next(err);
  }
}

async function loginMicrosoft(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    let claims;
    try {
      claims = await verifyMicrosoftToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: `Microsoft sign-in failed: ${err.message}` });
    }

    const email = (claims.preferred_username || claims.email || claims.upn || '').toLowerCase();
    if (!email) return res.status(401).json({ error: 'Microsoft account has no email/UPN claim' });

    const pool = await getPool();
    const employee = await employeeModel.findByEmail(pool, email);
    if (!employee || !['Admin', 'Reviewer'].includes(employee.role)) {
      return res.status(403).json({ error: `No Archcorp DCC staff account found for ${email}` });
    }

    const user = toPublicUser(employee.id, employee.role, employee.name, employee.email, { disc: employee.disc, title: employee.title });
    res.json({ token: signSession(user), user });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { loginAdmin, loginReviewer, loginContractor, loginDev, devOptions, loginMicrosoft, me };
