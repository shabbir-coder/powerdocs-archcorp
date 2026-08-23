function mapRow(r) {
  return { id: r.Id, name: r.Name, code: r.Code, city: r.City };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, Name, Code, City FROM dbo.DccClients WHERE IsActive = 1 ORDER BY Name');
  return recordset.map(mapRow);
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, Code, City FROM dbo.DccClients WHERE Id = @id');
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function insertMany(pool, clients) {
  for (const c of clients) {
    await pool.request()
      .input('id', c.id).input('name', c.name).input('code', c.code).input('city', c.city)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccClients WHERE Id = @id)
              INSERT INTO dbo.DccClients (Id, Name, Code, City) VALUES (@id, @name, @code, @city)`);
  }
}

async function insert(pool, c) {
  await pool.request()
    .input('id', c.id).input('name', c.name).input('code', c.code).input('city', c.city)
    .query('INSERT INTO dbo.DccClients (Id, Name, Code, City) VALUES (@id, @name, @code, @city)');
  return getById(pool, c.id);
}

async function update(pool, id, c) {
  await pool.request()
    .input('id', id).input('name', c.name).input('code', c.code).input('city', c.city)
    .query('UPDATE dbo.DccClients SET Name = @name, Code = @code, City = @city WHERE Id = @id');
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccClients SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, getById, insertMany, insert, update, remove };
