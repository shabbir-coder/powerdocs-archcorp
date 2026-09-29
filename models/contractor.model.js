const { sql } = require('../config/db');

function mapRow(r) {
  return { id: r.Id, name: r.Name, email: r.Email, firm: r.FirmId, title: r.Title };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, Name, Email, FirmId, Title FROM dbo.DccContractors WHERE IsActive = 1 ORDER BY Name');
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, Email, FirmId, Title FROM dbo.DccContractors WHERE Id = @id');
  return recordset.length ? mapRow(recordset[0]) : null;
}

// Active-only lookup by id — used by token refresh so a deactivated account can't keep renewing its session.
async function findActiveById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, Email, FirmId, Title FROM dbo.DccContractors WHERE Id = @id AND IsActive = 1');
  return recordset.length ? mapRow(recordset[0]) : null;
}

// Includes PasswordHash — only for login/credential checks, never for general reads.
async function findByEmail(pool, email) {
  const { recordset } = await pool.request().input('email', email)
    .query('SELECT Id, Name, Email, FirmId, Title, PasswordHash FROM dbo.DccContractors WHERE Email = @email AND IsActive = 1');
  if (!recordset.length) return null;
  const r = recordset[0];
  return { ...mapRow(r), passwordHash: r.PasswordHash };
}

async function setPassword(pool, id, passwordHash) {
  await pool.request().input('id', id).input('hash', sql.NVarChar(255), passwordHash)
    .query('UPDATE dbo.DccContractors SET PasswordHash = @hash WHERE Id = @id');
}

async function insertMany(pool, contractors) {
  for (const c of contractors) {
    await pool.request()
      .input('id', c.id).input('name', c.name).input('email', c.email).input('firm', c.firm).input('title', c.title)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccContractors WHERE Id = @id)
              INSERT INTO dbo.DccContractors (Id, Name, Email, FirmId, Title) VALUES (@id, @name, @email, @firm, @title)`);
  }
}

async function insert(pool, c) {
  await pool.request()
    .input('id', c.id).input('name', c.name).input('email', c.email).input('firm', c.firm).input('title', c.title)
    .input('hash', sql.NVarChar(255), c.passwordHash || null)
    .query(`INSERT INTO dbo.DccContractors (Id, Name, Email, FirmId, Title, PasswordHash)
            VALUES (@id, @name, @email, @firm, @title, @hash)`);
  return getById(pool, c.id);
}

async function update(pool, id, c) {
  await pool.request()
    .input('id', id).input('name', c.name).input('email', c.email).input('firm', c.firm).input('title', c.title)
    .query('UPDATE dbo.DccContractors SET Name = @name, Email = @email, FirmId = @firm, Title = @title WHERE Id = @id');
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccContractors SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, getById, findActiveById, findByEmail, setPassword, insertMany, insert, update, remove };
