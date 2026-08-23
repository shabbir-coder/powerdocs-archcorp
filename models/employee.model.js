const { sql } = require('../config/db');

function mapRow(r) {
  return { id: r.Id, name: r.Name, email: r.Email, disc: r.Disc, dept: r.Dept, role: r.Role, title: r.Title };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, Name, Email, Disc, Dept, Role, Title FROM dbo.DccEmployees WHERE IsActive = 1 ORDER BY Name');
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, Email, Disc, Dept, Role, Title FROM dbo.DccEmployees WHERE Id = @id');
  return recordset.length ? mapRow(recordset[0]) : null;
}

// Includes PasswordHash — only for login/credential checks, never for general reads.
async function findByEmail(pool, email) {
  const { recordset } = await pool.request().input('email', email)
    .query('SELECT Id, Name, Email, Disc, Dept, Role, Title, PasswordHash FROM dbo.DccEmployees WHERE Email = @email AND IsActive = 1');
  if (!recordset.length) return null;
  const r = recordset[0];
  return { ...mapRow(r), passwordHash: r.PasswordHash };
}

async function setPassword(pool, id, passwordHash) {
  await pool.request().input('id', id).input('hash', sql.NVarChar(255), passwordHash)
    .query('UPDATE dbo.DccEmployees SET PasswordHash = @hash WHERE Id = @id');
}

async function insertMany(pool, employees) {
  for (const e of employees) {
    await pool.request()
      .input('id', e.id).input('name', e.name).input('email', e.email).input('disc', e.disc)
      .input('dept', e.dept).input('role', e.role).input('title', e.title)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccEmployees WHERE Id = @id)
              INSERT INTO dbo.DccEmployees (Id, Name, Email, Disc, Dept, Role, Title)
              VALUES (@id, @name, @email, @disc, @dept, @role, @title)`);
  }
}

async function insert(pool, e) {
  await pool.request()
    .input('id', e.id).input('name', e.name).input('email', e.email).input('disc', e.disc)
    .input('dept', e.dept).input('role', e.role).input('title', e.title)
    .input('hash', sql.NVarChar(255), e.passwordHash || null)
    .query(`INSERT INTO dbo.DccEmployees (Id, Name, Email, Disc, Dept, Role, Title, PasswordHash)
            VALUES (@id, @name, @email, @disc, @dept, @role, @title, @hash)`);
  return getById(pool, e.id);
}

async function update(pool, id, e) {
  await pool.request()
    .input('id', id).input('name', e.name).input('email', e.email).input('disc', e.disc)
    .input('dept', e.dept).input('role', e.role).input('title', e.title)
    .query(`UPDATE dbo.DccEmployees SET Name = @name, Email = @email, Disc = @disc, Dept = @dept,
            Role = @role, Title = @title WHERE Id = @id`);
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccEmployees SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, getById, findByEmail, setPassword, insertMany, insert, update, remove };
