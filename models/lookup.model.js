const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

// Generic CRUD for the 5 lookup tables that share the same
// (Id, Name, SortOrder) shape. DocTypes and Statuses have extra
// columns so they get their own dedicated functions below.
const SIMPLE = {
  disciplines: 'DccDisciplines',
  departments: 'DccDepartments',
  categories: 'DccCategories',
  priorities: 'DccPriorities',
  'review-codes': 'DccReviewCodes',
};

function simpleTable(type) {
  const table = SIMPLE[type];
  if (!table) throw Object.assign(new Error(`Unknown lookup type: ${type}`), { status: 400 });
  return table;
}

function mapSimpleRow(r) {
  return { id: r.Id, name: r.Name, sortOrder: r.SortOrder };
}

async function getAllSimple(pool, type) {
  const table = simpleTable(type);
  const { recordset } = await pool.request().query(`SELECT Id, Name, SortOrder FROM dbo.${table} ORDER BY SortOrder, Name`);
  return recordset.map(mapSimpleRow);
}

const SORTS = { sortOrder: ['SortOrder', 'Name'], name: 'Name' };
const DEFAULT_SORT = { key: 'sortOrder', order: 'asc' };

async function listSimple(pool, type, query) {
  const table = simpleTable(type);
  const request = pool.request();
  const filters = new Filters(request, query).search(['Id', 'Name']).in('id', 'Id');
  const { rows, pagination } = await runList(request, {
    select: 'Id, Name, SortOrder', from: `dbo.${table}`, filters,
    orderBy: parseSort(query, SORTS, DEFAULT_SORT, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapSimpleRow), pagination };
}

async function insertSimple(pool, type, item) {
  const table = simpleTable(type);
  await pool.request()
    .input('id', item.id).input('name', item.name).input('sort', item.sortOrder || 0)
    .query(`INSERT INTO dbo.${table} (Id, Name, SortOrder) VALUES (@id, @name, @sort)`);
}

async function updateSimple(pool, type, id, item) {
  const table = simpleTable(type);
  await pool.request()
    .input('id', id).input('name', item.name).input('sort', item.sortOrder || 0)
    .query(`UPDATE dbo.${table} SET Name = @name, SortOrder = @sort WHERE Id = @id`);
}

async function removeSimple(pool, type, id) {
  const table = simpleTable(type);
  await pool.request().input('id', id).query(`DELETE FROM dbo.${table} WHERE Id = @id`);
}

function mapDocType(r) {
  return { id: r.Id, name: r.Name, category: r.CategoryId, refCode: r.RefCode, defaultDueDays: r.DefaultDueDays, sortOrder: r.SortOrder };
}

async function getAllDocTypes(pool) {
  const { recordset } = await pool.request()
    .query('SELECT Id, Name, CategoryId, RefCode, DefaultDueDays, SortOrder FROM dbo.DccDocTypes ORDER BY SortOrder, Name');
  return recordset.map(mapDocType);
}

async function listDocTypes(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Id', 'Name', 'RefCode']).in('id', 'Id').in('category', 'CategoryId').in('refCode', 'RefCode');
  const { rows, pagination } = await runList(request, {
    select: 'Id, Name, CategoryId, RefCode, DefaultDueDays, SortOrder', from: 'dbo.DccDocTypes', filters,
    orderBy: parseSort(query, { ...SORTS, refCode: 'RefCode', defaultDueDays: 'DefaultDueDays' }, DEFAULT_SORT, 'Id'),
    paging: parsePaging(query),
  });
  return { items: rows.map(mapDocType), pagination };
}

async function getDocTypeByName(pool, name) {
  const { recordset } = await pool.request().input('name', name)
    .query('SELECT Id, Name, CategoryId, RefCode, DefaultDueDays, SortOrder FROM dbo.DccDocTypes WHERE Id = @name');
  return recordset.length ? mapDocType(recordset[0]) : null;
}

async function insertDocType(pool, dt) {
  await pool.request()
    .input('id', dt.id).input('name', dt.name).input('cat', dt.category).input('ref', dt.refCode)
    .input('due', dt.defaultDueDays).input('sort', dt.sortOrder || 0)
    .query(`INSERT INTO dbo.DccDocTypes (Id, Name, CategoryId, RefCode, DefaultDueDays, SortOrder)
            VALUES (@id, @name, @cat, @ref, @due, @sort)`);
}

async function updateDocType(pool, id, dt) {
  await pool.request()
    .input('id', id).input('name', dt.name).input('cat', dt.category).input('ref', dt.refCode)
    .input('due', dt.defaultDueDays).input('sort', dt.sortOrder || 0)
    .query(`UPDATE dbo.DccDocTypes SET Name = @name, CategoryId = @cat, RefCode = @ref,
            DefaultDueDays = @due, SortOrder = @sort WHERE Id = @id`);
}

async function removeDocType(pool, id) {
  await pool.request().input('id', id).query('DELETE FROM dbo.DccDocTypes WHERE Id = @id');
}

function mapStatus(r) {
  return { id: r.Id, name: r.Name, cssClass: r.CssClass, reviewCode: r.ReviewCode, isCompletedFlow: r.IsCompletedFlow, sortOrder: r.SortOrder };
}

async function getAllStatuses(pool) {
  const { recordset } = await pool.request()
    .query('SELECT Id, Name, CssClass, ReviewCode, IsCompletedFlow, SortOrder FROM dbo.DccStatuses ORDER BY SortOrder, Name');
  return recordset.map(mapStatus);
}

async function listStatuses(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Id', 'Name']).in('id', 'Id').in('reviewCode', 'ReviewCode').in('cssClass', 'CssClass')
    .bool('isCompletedFlow', 'IsCompletedFlow');
  const { rows, pagination } = await runList(request, {
    select: 'Id, Name, CssClass, ReviewCode, IsCompletedFlow, SortOrder', from: 'dbo.DccStatuses', filters,
    orderBy: parseSort(query, { ...SORTS, reviewCode: 'ReviewCode' }, DEFAULT_SORT, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapStatus), pagination };
}

async function getStatusByName(pool, name) {
  const { recordset } = await pool.request().input('name', name)
    .query('SELECT Id, Name, CssClass, ReviewCode, IsCompletedFlow, SortOrder FROM dbo.DccStatuses WHERE Id = @name');
  return recordset.length ? mapStatus(recordset[0]) : null;
}

async function insertStatus(pool, s) {
  await pool.request()
    .input('id', s.id).input('name', s.name).input('css', s.cssClass).input('code', s.reviewCode)
    .input('completed', !!s.isCompletedFlow).input('sort', s.sortOrder || 0)
    .query(`INSERT INTO dbo.DccStatuses (Id, Name, CssClass, ReviewCode, IsCompletedFlow, SortOrder)
            VALUES (@id, @name, @css, @code, @completed, @sort)`);
}

async function updateStatus(pool, id, s) {
  await pool.request()
    .input('id', id).input('name', s.name).input('css', s.cssClass).input('code', s.reviewCode)
    .input('completed', !!s.isCompletedFlow).input('sort', s.sortOrder || 0)
    .query(`UPDATE dbo.DccStatuses SET Name = @name, CssClass = @css, ReviewCode = @code,
            IsCompletedFlow = @completed, SortOrder = @sort WHERE Id = @id`);
}

async function removeStatus(pool, id) {
  await pool.request().input('id', id).query('DELETE FROM dbo.DccStatuses WHERE Id = @id');
}

async function getBundle(pool) {
  const [disciplines, departments, categories, priorities, reviewCodes, docTypes, statuses] = await Promise.all([
    getAllSimple(pool, 'disciplines'),
    getAllSimple(pool, 'departments'),
    getAllSimple(pool, 'categories'),
    getAllSimple(pool, 'priorities'),
    getAllSimple(pool, 'review-codes'),
    getAllDocTypes(pool),
    getAllStatuses(pool),
  ]);
  return { disciplines, departments, categories, priorities, reviewCodes, docTypes, statuses };
}

module.exports = {
  SIMPLE, getAllSimple, listSimple, insertSimple, updateSimple, removeSimple,
  getAllDocTypes, listDocTypes, getDocTypeByName, insertDocType, updateDocType, removeDocType,
  getAllStatuses, listStatuses, getStatusByName, insertStatus, updateStatus, removeStatus,
  getBundle,
};
