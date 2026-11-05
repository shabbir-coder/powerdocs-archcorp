const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

// The whole nested shape (status labels, steps, initiator options…) lives in
// one JSON column — nothing ever queries into individual steps at SQL level.
function mapRow(r) {
  return { id: r.Id, name: r.Name, ...JSON.parse(r.DataJson) };
}

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query).search(['Name']).in('id', 'Id');
  const { rows, pagination } = await runList(request, {
    select: 'Id, Name, DataJson', from: 'dbo.DccWorkflowTemplates', filters,
    orderBy: parseSort(query, { name: 'Name' }, { key: 'name', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Name, DataJson FROM dbo.DccWorkflowTemplates WHERE Id = @id');
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function findByName(pool, name) {
  const { recordset } = await pool.request().input('name', name)
    .query('SELECT Id, Name, DataJson FROM dbo.DccWorkflowTemplates WHERE Name = @name');
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function count(pool) {
  const { recordset } = await pool.request().query('SELECT COUNT(*) AS N FROM dbo.DccWorkflowTemplates');
  return recordset[0].N;
}

/** Active projects bound to this template — a template in use can't be deleted. */
async function projectsUsing(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query('SELECT Id, Pid FROM dbo.DccProjects WHERE Workflow = @id AND IsActive = 1 ORDER BY Pid');
  return recordset.map((r) => ({ id: r.Id, pid: r.Pid }));
}

async function insert(pool, t) {
  const { id, name, ...rest } = t;
  await pool.request().input('id', id).input('name', name).input('json', JSON.stringify(rest))
    .query('INSERT INTO dbo.DccWorkflowTemplates (Id, Name, DataJson) VALUES (@id, @name, @json)');
  return getById(pool, id);
}

async function update(pool, id, t) {
  const { name, ...rest } = t;
  delete rest.id;
  await pool.request().input('id', id).input('name', name).input('json', JSON.stringify(rest))
    .query('UPDATE dbo.DccWorkflowTemplates SET Name = @name, DataJson = @json WHERE Id = @id');
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('DELETE FROM dbo.DccWorkflowTemplates WHERE Id = @id');
}

async function insertMany(pool, templates) {
  for (const t of templates) {
    const { id, name, ...rest } = t;
    await pool.request().input('id', id).input('name', name).input('json', JSON.stringify(rest))
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccWorkflowTemplates WHERE Id = @id)
              INSERT INTO dbo.DccWorkflowTemplates (Id, Name, DataJson) VALUES (@id, @name, @json)`);
  }
}

module.exports = { list, getById, findByName, count, projectsUsing, insert, update, remove, insertMany };
