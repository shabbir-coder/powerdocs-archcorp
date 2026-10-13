const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return { id: r.Id, to: r.ToEmail, firm: r.FirmName, subject: r.Subject, body: r.Body, doc: r.DocumentId, at: r.CreatedAt.toISOString(), type: r.Type };
}

const SORTS = { at: 'CreatedAt', subject: 'Subject', to: 'ToEmail', firm: 'FirmName', type: 'Type' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Subject', 'ToEmail', 'FirmName', 'Body'])
    .in('to', 'ToEmail').in('firm', 'FirmName').in('doc', 'DocumentId').in('type', 'Type')
    .dateRange('dateFrom', 'dateTo', 'CreatedAt');
  const { rows, pagination } = await runList(request, {
    select: 'Id, ToEmail, FirmName, Subject, Body, DocumentId, CreatedAt, Type', from: 'dbo.DccEmailLog', filters,
    orderBy: parseSort(query, SORTS, { key: 'at', order: 'desc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function insert(pool, e) {
  await pool.request()
    .input('id', e.id).input('to', e.to).input('firm', e.firm).input('subject', e.subject).input('body', e.body)
    .input('doc', e.doc).input('at', e.at).input('type', e.type)
    .query(`INSERT INTO dbo.DccEmailLog (Id, ToEmail, FirmName, Subject, Body, DocumentId, CreatedAt, Type)
            VALUES (@id, @to, @firm, @subject, @body, @doc, @at, @type)`);
  return e;
}

module.exports = { list, insert };
