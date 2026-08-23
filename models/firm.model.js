function mapRow(r) {
  return { id: r.Id, name: r.Name, code: r.Code };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, Name, Code FROM dbo.DccFirms WHERE IsActive = 1 ORDER BY Name');
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, Code FROM dbo.DccFirms WHERE Id = @id');
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function insertMany(pool, firms) {
  for (const f of firms) {
    await pool.request()
      .input('id', f.id).input('name', f.name).input('code', f.code)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccFirms WHERE Id = @id)
              INSERT INTO dbo.DccFirms (Id, Name, Code) VALUES (@id, @name, @code)`);
  }
}

async function insert(pool, f) {
  await pool.request()
    .input('id', f.id).input('name', f.name).input('code', f.code)
    .query('INSERT INTO dbo.DccFirms (Id, Name, Code) VALUES (@id, @name, @code)');
  return getById(pool, f.id);
}

async function update(pool, id, f) {
  await pool.request()
    .input('id', id).input('name', f.name).input('code', f.code)
    .query('UPDATE dbo.DccFirms SET Name = @name, Code = @code WHERE Id = @id');
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccFirms SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, getById, insertMany, insert, update, remove };
