const { Filters, parsePaging, parseSort, runList } = require('../utils/listQuery');

function mapRow(r) {
  return {
    id: r.Id,
    kind: r.Kind,
    project: r.ProjectId,
    party: r.Party,
    number: r.Number,
    amount: r.Amount,
    paid: r.Paid,
    issued: r.Issued.toISOString(),
    due: r.DueDate.toISOString(),
    status: r.Status,
  };
}

const COLUMNS = 'Id, Kind, ProjectId, Party, Number, Amount, Paid, Issued, DueDate, Status';

const SORTS = { issued: 'Issued', due: 'DueDate', amount: 'Amount', paid: 'Paid', number: 'Number', party: 'Party', status: 'Status' };

async function list(pool, query) {
  const request = pool.request();
  const filters = new Filters(request, query)
    .search(['Number', 'Party'])
    .in('kind', 'Kind').in('project', 'ProjectId').in('party', 'Party').in('status', 'Status')
    .dateRange('issuedFrom', 'issuedTo', 'Issued').dateRange('dueFrom', 'dueTo', 'DueDate')
    .flag('outstanding', 'Paid < Amount', 'Paid >= Amount');
  const { rows, pagination } = await runList(request, {
    select: COLUMNS, from: 'dbo.DccDues', filters,
    orderBy: parseSort(query, SORTS, { key: 'issued', order: 'desc' }, 'Id'), paging: parsePaging(query),
  });
  return { items: rows.map(mapRow), pagination };
}

async function insert(pool, d) {
  await pool.request()
    .input('id', d.id).input('kind', d.kind).input('project', d.project).input('party', d.party)
    .input('number', d.number).input('amount', d.amount).input('paid', d.paid).input('issued', d.issued)
    .input('due', d.due).input('status', d.status)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.DccDues WHERE Id = @id)
            INSERT INTO dbo.DccDues (Id, Kind, ProjectId, Party, Number, Amount, Paid, Issued, DueDate, Status)
            VALUES (@id, @kind, @project, @party, @number, @amount, @paid, @issued, @due, @status)`);
}

module.exports = { list, insert };
