const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return { id: r.Id, name: r.Name, code: r.Code, city: r.City };
}

const SORTS = { name: 'Name', code: 'Code', city: 'City' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query).raw('IsActive = 1')
    .search(['Name', 'Code', 'City']).in('city', 'City').in('code', 'Code');
  const { rows, pagination } = await runList(request, {
    select: 'Id, Name, Code, City', from: 'dbo.DccClients', filters,
    orderBy: parseSort(query, SORTS, { key: 'name', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
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

module.exports = { list, getById, insertMany, insert, update, remove };
