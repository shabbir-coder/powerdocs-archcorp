const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

// Read-only reference data (no create/edit UI exists yet, same as the
// lookup tables) — the whole nested shape lives in one JSON column.
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

async function insertMany(pool, templates) {
  for (const t of templates) {
    const { id, name, ...rest } = t;
    await pool.request().input('id', id).input('name', name).input('json', JSON.stringify(rest))
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccWorkflowTemplates WHERE Id = @id)
              INSERT INTO dbo.DccWorkflowTemplates (Id, Name, DataJson) VALUES (@id, @name, @json)`);
  }
}

module.exports = { list, insertMany };
