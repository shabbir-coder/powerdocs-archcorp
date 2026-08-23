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

async function getAll(pool) {
  const { recordset } = await pool.request().query(`SELECT ${COLUMNS} FROM dbo.DccDues ORDER BY Issued DESC`);
  return recordset.map(mapRow);
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

module.exports = { getAll, insert };
