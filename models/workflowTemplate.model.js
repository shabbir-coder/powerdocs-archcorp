// Read-only reference data (no create/edit UI exists yet, same as the
// lookup tables) — the whole nested shape lives in one JSON column.
function mapRow(r) {
  return { id: r.Id, name: r.Name, ...JSON.parse(r.DataJson) };
}

async function getAll(pool) {
  const { recordset } = await pool.request().query('SELECT Id, Name, DataJson FROM dbo.DccWorkflowTemplates ORDER BY Name');
  return recordset.map(mapRow);
}

async function insertMany(pool, templates) {
  for (const t of templates) {
    const { id, name, ...rest } = t;
    await pool.request().input('id', id).input('name', name).input('json', JSON.stringify(rest))
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccWorkflowTemplates WHERE Id = @id)
              INSERT INTO dbo.DccWorkflowTemplates (Id, Name, DataJson) VALUES (@id, @name, @json)`);
  }
}

module.exports = { getAll, insertMany };
