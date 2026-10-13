const { parsePaging, pageArray, withPagination, toList, toDate, badRequest } = require('../utils/listQuery');

const ACC_PROJECTS_URL = 'https://task.archcorp.ai/functions/accProjectsPublic';

const SORTS = ['name', 'status', 'type', 'createdAt', 'updatedAt'];

// The upstream feed has no query support, so filters/sort/paging run in memory
// with the same params and 400s as the SQL-backed lists.
function applyQuery(projects, query) {
  const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
  const statuses = toList(query.status);
  const types = toList(query.type);
  const ids = toList(query.id);
  const createdFrom = toDate(query.createdFrom, 'createdFrom');
  const createdTo = toDate(query.createdTo, 'createdTo', true);
  const createdToExclusive = /^\d{4}-\d{2}-\d{2}$/.test(String(query.createdTo || ''));
  const sort = query.sort === undefined ? null : String(query.sort);
  if (sort && !SORTS.includes(sort)) throw badRequest(`sort must be one of: ${SORTS.join(', ')}`);
  const order = query.order === undefined ? 'asc' : String(query.order).toLowerCase();
  if (order !== 'asc' && order !== 'desc') throw badRequest('order must be asc or desc');

  let result = projects.filter((p) => {
    if (q && !`${p.name || ''} ${p.id || ''}`.toLowerCase().includes(q)) return false;
    if (statuses.length && !statuses.includes(p.status)) return false;
    if (types.length && !types.includes(p.type)) return false;
    if (ids.length && !ids.includes(p.id)) return false;
    const created = p.createdAt ? new Date(p.createdAt) : null;
    if (createdFrom && !(created && created >= createdFrom)) return false;
    if (createdTo && !(created && (createdToExclusive ? created < createdTo : created <= createdTo))) return false;
    return true;
  });
  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) * dir);
  }
  return result;
}

// Proxied server-side (not fetched directly from the browser) so it's consistent with
// the rest of the API — same auth gate, same origin for the frontend to call.
async function listProjects(req, res, next) {
  try {
    const paging = parsePaging(req.query);
    applyQuery([], req.query); // surface bad params as 400 before calling upstream
    const upstream = await fetch(ACC_PROJECTS_URL);
    if (!upstream.ok) return res.status(502).json({ error: 'Could not reach the ACC projects feed' });
    const data = await upstream.json();
    const { rows, pagination } = pageArray(applyQuery(data.projects || [], req.query), paging);
    res.json(withPagination({ projects: rows }, pagination));
  } catch (err) {
    next(err);
  }
}

module.exports = { listProjects };
