// Opt-in pagination, filtering and sorting for the GET list endpoints.
//
// Every list keeps its original response when called with no query params
// (the web app loads full sets on boot). Clients that want less pass:
//   ?page=2&limit=50          → adds `pagination: { page, limit, total, totalPages }`
//   ?status=A,B or ?status=A&status=B → OR within one filter, AND across filters
//   ?q=text                   → case-insensitive contains-search over the list's text columns
//   ?createdFrom=…&createdTo=… → ISO dates; a date-only `…To` includes that whole day
//   ?sort=field&order=asc|desc
// Unknown/invalid values come back as 400s instead of being silently ignored.

const { sql } = require('../config/db');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function toList(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((v) => String(v).split(',')).map((v) => v.trim()).filter(Boolean);
}

function toInt(value, key, min, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${key} must be an integer between ${min} and ${max === Number.MAX_SAFE_INTEGER ? '∞' : max}`);
  }
  return n;
}

function toBool(value, key) {
  if (value === undefined || value === '') return undefined;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw badRequest(`${key} must be true or false`);
}

function toDate(value, key, endOfDay = false) {
  if (value === undefined || value === '') return undefined;
  const s = String(value);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`${key} must be a valid ISO-8601 date`);
  if (endOfDay && DATE_ONLY.test(s)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function escapeLike(text) {
  return text.replace(/[\\%_[]/g, (c) => `\\${c}`);
}

function parsePaging(query) {
  if (query.page === undefined && query.limit === undefined) return null;
  const page = query.page === undefined ? 1 : toInt(query.page, 'page', 1);
  const limit = query.limit === undefined ? DEFAULT_LIMIT : toInt(query.limit, 'limit', 1, MAX_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
}

// `sorts` maps the public sort key to its SQL expression. `tiebreak` keeps
// paging stable when the sort column has duplicates.
function parseSort(query, sorts, defaultSort, tiebreak) {
  const key = query.sort === undefined ? defaultSort.key : String(query.sort);
  if (!sorts[key]) throw badRequest(`sort must be one of: ${Object.keys(sorts).join(', ')}`);
  let dir = query.sort === undefined ? defaultSort.order : 'asc';
  if (query.order !== undefined) {
    dir = String(query.order).toLowerCase();
    if (dir !== 'asc' && dir !== 'desc') throw badRequest('order must be asc or desc');
  }
  const parts = [].concat(sorts[key]).map((col) => `${col} ${dir.toUpperCase()}`);
  if (tiebreak) parts.push(`${tiebreak} ${dir.toUpperCase()}`);
  return parts.join(', ');
}

// Collects parameterized WHERE conditions on one mssql request. Every method
// is a no-op when its query param is absent, so filters chain unconditionally.
class Filters {
  constructor(request, query) {
    this.request = request;
    this.query = query;
    this.conditions = [];
    this.count = 0;
  }

  param(value) {
    const name = `f${this.count++}`;
    // Untyped Dates bind as legacy DATETIME (~3ms rounding), which skews comparisons against DATETIME2 columns.
    if (value instanceof Date) this.request.input(name, sql.DateTime2, value);
    else this.request.input(name, value);
    return `@${name}`;
  }

  raw(condition) {
    this.conditions.push(condition);
    return this;
  }

  in(key, column) {
    const values = toList(this.query[key]);
    if (values.length) this.conditions.push(`${column} IN (${values.map((v) => this.param(v)).join(', ')})`);
    return this;
  }

  // `offset` maps a public number onto the column, e.g. revision "00" → Round 1.
  intIn(key, column, offset = 0) {
    const values = toList(this.query[key]).map((v) => toInt(v, key, 0) + offset);
    if (values.length) this.conditions.push(`${column} IN (${values.map((v) => this.param(v)).join(', ')})`);
    return this;
  }

  // For the comma-joined id columns (ReviewerIds, ToPersons, ...): matches rows containing any of the values.
  inCsv(key, column) {
    const values = toList(this.query[key]);
    if (values.length) {
      const any = values.map((v) => `(',' + ${column} + ',') LIKE '%,' + ${this.param(v)} + ',%'`);
      this.conditions.push(`(${any.join(' OR ')})`);
    }
    return this;
  }

  search(columns, key = 'q') {
    const text = typeof this.query[key] === 'string' ? this.query[key].trim() : '';
    if (text) {
      const p = this.param(`%${escapeLike(text)}%`);
      this.conditions.push(`(${columns.map((c) => `${c} LIKE ${p} ESCAPE '\\'`).join(' OR ')})`);
    }
    return this;
  }

  dateRange(fromKey, toKey, column) {
    const from = toDate(this.query[fromKey], fromKey);
    const to = toDate(this.query[toKey], toKey, true);
    if (from) this.conditions.push(`${column} >= ${this.param(from)}`);
    if (to) {
      const inclusiveDay = DATE_ONLY.test(String(this.query[toKey]));
      this.conditions.push(`${column} ${inclusiveDay ? '<' : '<='} ${this.param(to)}`);
    }
    return this;
  }

  bool(key, column) {
    const value = toBool(this.query[key], key);
    if (value !== undefined) this.conditions.push(`${column} = ${value ? 1 : 0}`);
    return this;
  }

  // Lets a list add a filter whose SQL is not a plain column match (e.g. "overdue").
  flag(key, whenTrue, whenFalse) {
    const value = toBool(this.query[key], key);
    if (value === true) this.conditions.push(whenTrue);
    if (value === false) this.conditions.push(whenFalse);
    return this;
  }

  get where() {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }
}

// Runs the list query; with paging it also counts the matches in the same round trip.
async function runList(request, { select, from, filters, orderBy, paging }) {
  const where = filters.where;
  if (!paging) {
    const { recordset } = await request.query(`SELECT ${select} FROM ${from} ${where} ORDER BY ${orderBy}`);
    return { rows: recordset, pagination: null };
  }
  request.input('pageOffset', paging.offset).input('pageLimit', paging.limit);
  const { recordsets } = await request.query(
    `SELECT COUNT(*) AS total FROM ${from} ${where};
     SELECT ${select} FROM ${from} ${where} ORDER BY ${orderBy} OFFSET @pageOffset ROWS FETCH NEXT @pageLimit ROWS ONLY;`
  );
  const total = recordsets[0][0].total;
  return { rows: recordsets[1], pagination: paginationMeta(paging, total) };
}

function paginationMeta(paging, total) {
  return { page: paging.page, limit: paging.limit, total, totalPages: Math.ceil(total / paging.limit) };
}

// Same filters/sort/paging contract for lists that are not backed by SQL (e.g. the ACC proxy).
function pageArray(items, paging) {
  if (!paging) return { rows: items, pagination: null };
  return { rows: items.slice(paging.offset, paging.offset + paging.limit), pagination: paginationMeta(paging, items.length) };
}

// Adds `pagination` to a response body only when the caller asked for a page.
function withPagination(body, pagination) {
  return pagination ? { ...body, pagination } : body;
}

module.exports = {
  Filters, parsePaging, parseSort, runList, pageArray, withPagination,
  toList, toInt, toBool, toDate, badRequest, DEFAULT_LIMIT, MAX_LIMIT,
};
