const { Filters, parsePaging, parseSort, runList, toList } = require('../utils/listQuery');

function mapRow(r) {
  return {
    id: r.Id,
    pid: r.Pid,
    name: r.Name,
    client: r.ClientId,
    city: r.City,
    status: r.Status,
    start: r.StartDate.toISOString().slice(0, 10),
    workflow: r.Workflow || undefined,
    disciplines: r.Disciplines ? r.Disciplines.split(',').filter(Boolean) : undefined,
    categories: r.Categories ? r.Categories.split(',').filter(Boolean) : undefined,
    numbering: r.Numbering || undefined,
    numberingConfig: r.NumberingConfig ? JSON.parse(r.NumberingConfig) : undefined,
    accId: r.AccId || undefined,
  };
}

const COLUMNS = 'Id, Pid, Name, ClientId, City, Status, StartDate, Workflow, Disciplines, Categories, Numbering, NumberingConfig, AccId';

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccProjects WHERE IsActive = 1 ORDER BY Pid`);
  return recordset.map(mapRow);
}

const SORTS = { pid: 'Pid', name: 'Name', start: 'StartDate', status: 'Status', city: 'City', client: 'ClientId' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query).raw('p.IsActive = 1')
    .search(['p.Pid', 'p.Name', 'p.City'])
    .in('status', 'p.Status').in('client', 'p.ClientId').in('city', 'p.City').in('workflow', 'p.Workflow')
    .in('accId', 'p.AccId').inCsv('discipline', 'p.Disciplines').inCsv('category', 'p.Categories')
    .dateRange('startFrom', 'startTo', 'p.StartDate');
  const members = toList(query.member);
  if (members.length) {
    filters.raw(`EXISTS (SELECT 1 FROM dbo.DccProjectAssignments a WHERE a.ProjectId = p.Id
      AND a.PersonId IN (${members.map((m) => filters.param(m)).join(', ')}))`);
  }
  const { rows, pagination } = await runList(request, {
    select: COLUMNS, from: 'dbo.DccProjects p', filters,
    orderBy: parseSort(query, SORTS, { key: 'pid', order: 'asc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function getById(pool, id) {
  const { recordset } = await pool.request().input('id', id)
    .query(`SELECT ${COLUMNS} FROM dbo.DccProjects WHERE Id = @id`);
  return recordset.length ? mapRow(recordset[0]) : null;
}

async function insertMany(pool, projects) {
  for (const p of projects) {
    await pool.request()
      .input('id', p.id).input('pid', p.pid).input('name', p.name).input('client', p.client)
      .input('city', p.city).input('status', p.status).input('start', p.start)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccProjects WHERE Id = @id)
              INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate)
              VALUES (@id, @pid, @name, @client, @city, @status, @start)`);
  }
}

async function insert(pool, p) {
  await pool.request()
    .input('id', p.id).input('pid', p.pid).input('name', p.name).input('client', p.client)
    .input('city', p.city).input('status', p.status).input('start', p.start)
    .input('workflow', p.workflow || null)
    .input('disciplines', p.disciplines?.length ? p.disciplines.join(',') : null)
    .input('categories', p.categories?.length ? p.categories.join(',') : null)
    .input('numbering', p.numbering || null)
    .input('numberingConfig', p.numberingConfig ? JSON.stringify(p.numberingConfig) : null)
    .input('accId', p.accId || null)
    .query(`INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate, Workflow, Disciplines, Categories, Numbering, NumberingConfig, AccId)
            VALUES (@id, @pid, @name, @client, @city, @status, @start, @workflow, @disciplines, @categories, @numbering, @numberingConfig, @accId)`);
  return getById(pool, p.id);
}

async function update(pool, id, p) {
  await pool.request()
    .input('id', id).input('pid', p.pid).input('name', p.name).input('client', p.client)
    .input('city', p.city).input('status', p.status).input('start', p.start)
    .query(`UPDATE dbo.DccProjects SET Pid = @pid, Name = @name, ClientId = @client, City = @city,
            Status = @status, StartDate = @start WHERE Id = @id`);
  return getById(pool, id);
}

async function updateEnrichment(pool, id, p) {
  await pool.request()
    .input('id', id).input('workflow', p.workflow || null)
    .input('disciplines', p.disciplines?.length ? p.disciplines.join(',') : null)
    .input('categories', p.categories?.length ? p.categories.join(',') : null)
    .input('numbering', p.numbering || null)
    .input('numberingConfig', p.numberingConfig ? JSON.stringify(p.numberingConfig) : null)
    .query(`UPDATE dbo.DccProjects SET Workflow = @workflow, Disciplines = @disciplines, Categories = @categories,
            Numbering = @numbering, NumberingConfig = @numberingConfig WHERE Id = @id`);
  return getById(pool, id);
}

async function remove(pool, id) {
  await pool.request().input('id', id).query('UPDATE dbo.DccProjects SET IsActive = 0 WHERE Id = @id');
}

module.exports = { getAll, list, getById, insertMany, insert, update, updateEnrichment, remove };
