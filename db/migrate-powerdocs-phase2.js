// Phase 2 of the PowerDocs → DCC migration: documents, their history, remarks and
// files. NCRM is only ever read (SELECTs only) — the old app keeps running untouched.
// Needs phase 1 (people, firms, projects) to have been applied first.
//
//   npm run migrate:powerdocs2                       dry run: does every write, prints a report, rolls back
//   npm run migrate:powerdocs2 -- --apply            same, but commits
//   npm run migrate:powerdocs2 -- --copy-files       dry run of the file copy: checks every linked file on the old server
//   npm run migrate:powerdocs2 -- --copy-files --apply [--limit N]
//                                                    copies linked files into Firebase Storage
//
// Files are first *linked* to the old server (it serves them at LEGACY_FILES_BASE), so
// documents are usable the moment rows are applied; --copy-files then moves them into
// Firebase so nothing depends on the old server. Both steps are resumable.
//
// Safe to re-run while PowerDocs is still in use: new legacy documents, history and
// files are added; a migrated document that nobody has touched in DCC yet is refreshed
// from PowerDocs; one that has been worked on in DCC is left alone (counted in the report).
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');
const { LEGACY_DB, LEGACY_CLIENT, SKIP_USER_IDS, EMPLOYEE_SELECT, ids, normName, normEmail, firmCode, openLegacy, insertEmployee } =
  require('./powerdocs-common');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const COPY_FILES = args.includes('--copy-files');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const LEGACY_FILES_BASE = (process.env.LEGACY_FILES_BASE || 'http://62.171.154.41:5005/powerdocs/').replace(/\/?$/, '/');
// PowerDocs stamped times with datetime.now() on a server running UAE time (GST,
// UTC+4, no DST) — checked against the old server's Last-Modified headers.
const LEGACY_UTC_OFFSET_MS = 4 * 3600 * 1000;

const ARCHCORP_FIRM = { id: 'f_pd_archcorp', name: 'Archcorp Architectural Engineering' };
const NO_PROJECT = { id: 'p_pd_none', pid: 'PD-NO-PROJECT', name: 'PowerDocs — documents without a project' };
// Actor ids that resolve to no person (the UI shows "Unknown"); the name is kept in the comment.
const UNKNOWN_ACTOR = 'pd_unknown';
const MIGRATION_ACTOR = 'pd_migration';

// ---------------------------------------------------------------- legacy value mapping

function legacyTime(d) {
  return d ? new Date(d.getTime() - LEGACY_UTC_OFFSET_MS) : null;
}

// Stored file names are `<docId>_<title>_<YYYYMMDDHHMMSS>_<original name>`.
function parseStoredPath(p) {
  const base = p.split(/[\\/]/).pop();
  const m = /^\d+_.*?_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/.exec(base);
  if (!m) return { original: base, at: null };
  const [, y, mo, d, h, mi, s, original] = m;
  return { original, at: new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s) - LEGACY_UTC_OFFSET_MS) };
}

// Paths mix separators (`/proj/Type/In\file.zip`); the old server's static mount serves them.
function legacyUrl(p) {
  return LEGACY_FILES_BASE + p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

function splitList(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function mapStatus(d, hasReviewers) {
  const status = String(d.doc_status || '').trim();
  const flow = d.flow_status === 'Completed' ? 'Completed' : 'In-Process';
  if (status) return { status, flow };
  // Closed in PowerDocs without a review code — the nearest DCC status is "D · Reviewed".
  if (flow === 'Completed') return { status: 'For Information', flow };
  return { status: hasReviewers ? 'Under Review' : 'Submitted', flow };
}

function sizeLabel(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---------------------------------------------------------------- reads

async function readLegacy() {
  const pool = await openLegacy();
  const q = async (text) => (await pool.request().query(text)).recordset;

  const documents = await q(`
    SELECT id, title, project_id, architect_engineer, filename, priority, status, current_step, created_by, created_at,
           updated_at, remarks, contractor_documents, archcorp_documents, reference_no, document_type, disciplines,
           flow_status, doc_status, days_to_complete
    FROM dbo.documents ORDER BY id`);
  const history = await q('SELECT id, document_id, action, user_role, timestamp, comment FROM dbo.history ORDER BY id');
  const contractors = await q('SELECT id, first_name, last_name, email FROM dbo.contractors');

  // Everyone a document points at: reviewers by id, submitters and history actors by name.
  const reviewerIds = [...new Set(documents.flatMap((d) => splitList(d.architect_engineer)))].filter((x) => /^\d+$/.test(x));
  const employees = await q(`${EMPLOYEE_SELECT}
    WHERE u.U_id IN (${reviewerIds.length ? reviewerIds.join(',') : 'NULL'})
       OR LTRIM(RTRIM(u.Full_Name)) IN (SELECT LTRIM(RTRIM(created_by)) FROM dbo.documents
                                        UNION SELECT LTRIM(RTRIM(user_role)) FROM dbo.history)`);
  await pool.close();
  return { documents, history, contractors, employees, reviewerIds: new Set(reviewerIds) };
}

// ---------------------------------------------------------------- bulk tables

function table(name, columns) {
  const t = new sql.Table(name);
  t.create = false;
  for (const [col, type, nullable] of columns) t.columns.add(col, type, { nullable: !!nullable });
  return t;
}

const docTable = () => table('dbo.DccDocuments', [
  ['Id', sql.VarChar(20)], ['Ref', sql.VarChar(50)], ['ProjectId', sql.VarChar(20)], ['Type', sql.NVarChar(100)],
  ['Title', sql.NVarChar(400)], ['Disciplines', sql.NVarChar(200)], ['FirmId', sql.VarChar(20)], ['SubmittedBy', sql.VarChar(20)],
  ['ReviewerIds', sql.NVarChar(200)], ['Status', sql.NVarChar(50)], ['Flow', sql.NVarChar(20)], ['Priority', sql.NVarChar(10)],
  ['Round', sql.Int], ['Category', sql.NVarChar(100)], ['DueDays', sql.Int], ['Created', sql.DateTime2], ['Updated', sql.DateTime2],
  ['Storage', sql.NVarChar(400)], ['Mode', sql.VarChar(20)], ['CreatedByOrg', sql.NVarChar(200), true],
]);
const historyTable = () => table('dbo.DccDocumentHistory', [
  ['Id', sql.VarChar(20)], ['DocumentId', sql.VarChar(20)], ['ProjectId', sql.VarChar(20)], ['At', sql.DateTime2],
  ['Action', sql.NVarChar(100)], ['Actor', sql.VarChar(20)], ['Role', sql.NVarChar(20)], ['Round', sql.Int], ['Comment', sql.NVarChar(sql.MAX), true],
]);
const threadTable = () => table('dbo.DccDocumentThread', [
  ['Id', sql.VarChar(20)], ['DocumentId', sql.VarChar(20)], ['SeqIndex', sql.Int], ['ByPerson', sql.VarChar(20)], ['Role', sql.NVarChar(20)],
  ['Type', sql.VarChar(10)], ['Txt', sql.NVarChar(sql.MAX)], ['CreatedAt', sql.DateTime2], ['Page', sql.Int],
]);
const fileTable = () => table('dbo.DccDocumentFiles', [
  ['DocumentId', sql.VarChar(20)], ['Kind', sql.VarChar(10)], ['OriginalName', sql.NVarChar(300)], ['StoredName', sql.NVarChar(1000)],
  ['Version', sql.Int], ['SizeLabel', sql.VarChar(20)], ['UploadedAt', sql.DateTime2],
]);

// ---------------------------------------------------------------- documents step

async function migrateDocuments() {
  const legacy = await readLegacy();
  const report = { inserted: {}, updated: {}, unchanged: {}, kept: {}, notes: {}, statusMap: {} };
  const bump = (bucket, key, n = 1) => { report[bucket][key] = (report[bucket][key] || 0) + n; };

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const req = () => new sql.Request(tx);
  const q = async (text) => (await req().query(text)).recordset;

  try {
    // ── SB state ──
    const sbEmployees = await q('SELECT Id, LOWER(LTRIM(RTRIM(Email))) AS e FROM dbo.DccEmployees');
    const sbContractors = await q('SELECT Id, LOWER(LTRIM(RTRIM(Email))) AS e, FirmId FROM dbo.DccContractors');
    const empById = new Set(sbEmployees.map((r) => r.Id));
    const empByEmail = new Map(sbEmployees.map((r) => [r.e, r.Id]));
    const conById = new Map(sbContractors.map((r) => [r.Id, r]));
    const conByEmail = new Map(sbContractors.map((r) => [r.e, r]));
    const firms = await q('SELECT Id, Name, Code FROM dbo.DccFirms');
    const firmName = new Map(firms.map((f) => [f.Id, f.Name]));
    const projects = new Map((await q('SELECT Id, Pid FROM dbo.DccProjects')).map((p) => [p.Id, p.Pid]));
    const docTypes = new Map((await q('SELECT Name, CategoryId, DefaultDueDays FROM dbo.DccDocTypes')).map((t) => [normName(t.Name), t]));
    const disciplines = new Map((await q('SELECT Name FROM dbo.DccDisciplines')).map((d) => [normName(d.Name), d.Name]));
    const statuses = new Set((await q('SELECT Name FROM dbo.DccStatuses')).map((s) => s.Name));

    // ── Archcorp's own firm (documents submitted by Archcorp staff) ──
    let archcorpFirm = firms.find((f) => f.Id === ARCHCORP_FIRM.id || normName(f.Name) === normName(ARCHCORP_FIRM.name))?.Id;
    if (!archcorpFirm) {
      archcorpFirm = ARCHCORP_FIRM.id;
      await req().input('id', archcorpFirm).input('name', ARCHCORP_FIRM.name)
        .input('code', firmCode(ARCHCORP_FIRM.name, new Set(firms.map((f) => f.Code))))
        .query('INSERT INTO dbo.DccFirms (Id, Name, Code) VALUES (@id, @name, @code)');
      firmName.set(archcorpFirm, ARCHCORP_FIRM.name);
      bump('inserted', 'firms');
    }

    // ── People: legacy id → DCC id (phase 1 ids, or an existing DCC person by email) ──
    const contractorFor = new Map();
    for (const c of legacy.contractors) {
      const row = conById.get(ids.contractor(c.id)) || conByEmail.get(normEmail(c.email));
      if (row) contractorFor.set(String(c.id), row);
    }
    const employeeFor = new Map();
    const byName = new Map(); // normalized name → Set of { id, type }
    const addName = (name, person) => {
      const key = normName(name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, new Map());
      byName.get(key).set(person.id, person);
    };
    for (const c of legacy.contractors) {
      const row = contractorFor.get(String(c.id));
      if (row) addName(`${c.first_name || ''} ${c.last_name || ''}`, { id: row.Id, type: 'contractor', firm: row.FirmId });
    }
    const dbUsersPerName = new Map();
    for (const u of legacy.employees) dbUsersPerName.set(normName(u.Full_Name), (dbUsersPerName.get(normName(u.Full_Name)) || 0) + 1);

    for (const u of legacy.employees) {
      const email = normEmail(u.U_Email_ID);
      let id = empById.has(ids.employee(u.U_id)) ? ids.employee(u.U_id) : empByEmail.get(email);
      // Top up people phase 1 didn't carry (no longer on any project) but whom documents
      // still reference — a reviewer by id, or an unambiguous submitter/history name.
      const referenced = legacy.reviewerIds.has(String(u.U_id)) || dbUsersPerName.get(normName(u.Full_Name)) === 1;
      if (!id && referenced && !SKIP_USER_IDS.includes(Number(u.U_id)) && email && u.Full_Name && !conByEmail.has(email)) {
        id = ids.employee(u.U_id);
        await insertEmployee(req(), u, id);
        empById.add(id);
        empByEmail.set(email, id);
        bump('inserted', 'employees');
      }
      if (id) {
        employeeFor.set(String(u.U_id), id);
        addName(u.Full_Name, { id, type: 'employee' });
      }
    }
    const personByName = (name) => {
      const found = byName.get(normName(name));
      return found && found.size === 1 ? [...found.values()][0] : null;
    };
    const roleOf = (person) => (person?.type === 'contractor' ? 'Contractor' : 'Reviewer');

    // ── Holding project for documents PowerDocs never filed under a project ──
    const needsNoProject = legacy.documents.some((d) => d.project_id == null || !projects.has(ids.project(d.project_id)));
    if (needsNoProject && !projects.has(NO_PROJECT.id)) {
      const [client] = await q(`SELECT COUNT(*) AS n FROM dbo.DccClients WHERE Id = '${LEGACY_CLIENT.id}'`);
      if (!client.n) {
        await req().input('id', LEGACY_CLIENT.id).input('name', LEGACY_CLIENT.name).input('code', LEGACY_CLIENT.code).input('city', LEGACY_CLIENT.city)
          .query('INSERT INTO dbo.DccClients (Id, Name, Code, City) VALUES (@id, @name, @code, @city)');
      }
      const first = legacy.documents.filter((d) => d.project_id == null).map((d) => legacyTime(d.created_at)).sort((a, b) => a - b)[0];
      await req().input('id', NO_PROJECT.id).input('pid', NO_PROJECT.pid).input('name', NO_PROJECT.name).input('client', LEGACY_CLIENT.id)
        .input('city', '-').input('status', 'Construction').input('start', sql.Date, first || new Date())
        .query(`INSERT INTO dbo.DccProjects (Id, Pid, Name, ClientId, City, Status, StartDate)
                VALUES (@id, @pid, @name, @client, @city, @status, @start)`);
      projects.set(NO_PROJECT.id, NO_PROJECT.pid);
      bump('inserted', 'projects');
    }

    // ── What's already migrated, and which of those DCC users have since worked on ──
    const existingDocs = new Map((await q(`SELECT Id, Ref, ProjectId, Type, Title, Disciplines, FirmId, SubmittedBy, ReviewerIds, Status, Flow,
        Priority, Category, DueDays, Created, Updated, Storage, CreatedByOrg FROM dbo.DccDocuments WHERE Id LIKE 'd[_]pd%'`)).map((r) => [r.Id, r]));
    const touched = new Set((await q(`
      SELECT DocumentId FROM dbo.DccDocumentHistory WHERE DocumentId LIKE 'd[_]pd%' AND Id NOT LIKE 'h[_]pd%' AND Id NOT LIKE 'hm[_]pd%'
      UNION SELECT DocumentId FROM dbo.DccDocumentThread WHERE DocumentId LIKE 'd[_]pd%' AND Id NOT LIKE 'th[_]pd%'
      UNION SELECT DocumentId FROM dbo.DccMemberReviews WHERE DocumentId LIKE 'd[_]pd%'
      UNION SELECT DocumentId FROM dbo.DccDocumentMarkups WHERE DocumentId LIKE 'd[_]pd%'`)).map((r) => r.DocumentId));
    const existingHistory = new Map((await q(`SELECT Id, Comment FROM dbo.DccDocumentHistory WHERE Id LIKE 'h[_]pd%' OR Id LIKE 'hm[_]pd%'`))
      .map((r) => [r.Id, r.Comment]));
    const existingRemarks = new Map((await q(`SELECT Id, Txt FROM dbo.DccDocumentThread WHERE Id LIKE 'th[_]pd%'`)).map((r) => [r.Id, r.Txt]));
    const fileKey = (docId, kind, name, at) => `${docId}|${kind}|${name}|${at.toISOString()}`;
    const existingFiles = new Set((await q(`SELECT DocumentId, Kind, OriginalName, UploadedAt FROM dbo.DccDocumentFiles WHERE DocumentId LIKE 'd[_]pd%'`))
      .map((r) => fileKey(r.DocumentId, r.Kind, r.OriginalName, r.UploadedAt)));

    const historyByDoc = new Map();
    for (const h of legacy.history) {
      if (!historyByDoc.has(h.document_id)) historyByDoc.set(h.document_id, []);
      historyByDoc.get(h.document_id).push(h);
    }

    const newDocs = docTable();
    const newHistory = historyTable();
    const newThread = threadTable();
    const newFiles = fileTable();
    const updates = [];

    for (const d of legacy.documents) {
      const id = ids.document(d.id);
      const notes = [];
      const note = (key, text) => { notes.push(text); bump('notes', key); };

      // project
      let projectId = d.project_id != null ? ids.project(d.project_id) : null;
      if (!projectId || !projects.has(projectId)) {
        note('no project → PD-NO-PROJECT', d.project_id == null ? 'no project in PowerDocs' : `PowerDocs project ${d.project_id} not migrated`);
        projectId = NO_PROJECT.id;
      }
      // type / category / due days
      let type = docTypes.get(normName(d.document_type));
      if (!type) {
        note('unknown type → Others', `type "${d.document_type || ''}" mapped to Others`);
        type = docTypes.get('others');
      }
      // submitter + firm
      const submitter = personByName(d.created_by);
      if (!submitter) note('submitter not resolved', `submitted by "${d.created_by}" (not matched to a DCC person)`);
      const firm = submitter?.type === 'contractor' ? submitter.firm : archcorpFirm;
      // reviewers
      const reviewers = [];
      const lostReviewers = [];
      for (const r of splitList(d.architect_engineer)) {
        const rid = employeeFor.get(r);
        if (rid) { if (!reviewers.includes(rid)) reviewers.push(rid); } else lostReviewers.push(r);
      }
      if (lostReviewers.length) note('reviewer no longer in PowerDocs', `reviewer user id(s) ${lostReviewers.join(', ')} no longer exist in PowerDocs`);
      // ref / title
      let ref = String(d.reference_no || '').trim() || `PD-${d.id}`;
      if (ref.length > 50) {
        note('reference shortened', `full reference: ${ref}`);
        ref = ref.slice(0, 50);
      }
      const title = String(d.title || '').trim().slice(0, 400) || '(untitled)';
      const discs = splitList(d.disciplines).map((x) => disciplines.get(normName(x)) || x);
      const { status, flow } = mapStatus(d, reviewers.length > 0);
      if (!statuses.has(status)) note('status not in DCC lookup', `status "${status}" is not a DCC status`);
      report.statusMap[`${d.flow_status || '∅'} / ${d.doc_status || '∅'} → ${flow} / ${status}`] =
        (report.statusMap[`${d.flow_status || '∅'} / ${d.doc_status || '∅'} → ${flow} / ${status}`] || 0) + 1;
      const created = legacyTime(d.created_at);
      const row = {
        Id: id, Ref: ref, ProjectId: projectId, Type: type.Name, Title: title, Disciplines: discs.join(','),
        FirmId: firm, SubmittedBy: submitter?.id || UNKNOWN_ACTOR, ReviewerIds: reviewers.join(','), Status: status, Flow: flow,
        Priority: ['High', 'Medium', 'Low'].includes(d.priority) ? d.priority : 'Medium', Category: type.CategoryId,
        DueDays: d.days_to_complete ?? type.DefaultDueDays ?? 14, Created: created, Updated: legacyTime(d.updated_at) || created,
        Storage: `/${projects.get(projectId)}/${type.CategoryId}/`, CreatedByOrg: firmName.get(firm) || null,
      };
      if (row.ReviewerIds.length > 200 || row.Disciplines.length > 200) throw new Error(`document ${d.id}: reviewers/disciplines exceed column size`);

      const existing = existingDocs.get(id);
      const isTouched = touched.has(id);
      if (!existing) {
        newDocs.rows.add(row.Id, row.Ref, row.ProjectId, row.Type, row.Title, row.Disciplines, row.FirmId, row.SubmittedBy, row.ReviewerIds,
          row.Status, row.Flow, row.Priority, 1, row.Category, row.DueDays, row.Created, row.Updated, row.Storage, 'review', row.CreatedByOrg);
        bump('inserted', 'documents');
      } else if (isTouched) {
        bump('kept', 'documents worked on in DCC (PowerDocs changes not applied)');
      } else {
        const changed = Object.keys(row).filter((k) => {
          const a = existing[k], b = row[k];
          return a instanceof Date ? a.getTime() !== b.getTime() : String(a ?? '') !== String(b ?? '');
        });
        if (changed.length) {
          updates.push(row);
          bump('updated', 'documents');
        } else bump('unchanged', 'documents');
      }

      // migration note — keeps every legacy value that has no DCC column
      const noteId = ids.migrationNote(d.id);
      const noteText = `Migrated from PowerDocs #${d.id} · status ${d.status || '—'} / step ${d.current_step || '—'} · flow ${d.flow_status || '—'}` +
        ` · doc status ${d.doc_status || '—'}${notes.length ? ' · ' + notes.join('; ') : ''}`;
      if (!existingHistory.has(noteId)) {
        newHistory.rows.add(noteId, id, projectId, created, 'Migrated from PowerDocs', MIGRATION_ACTOR, 'Reviewer', 1, noteText);
      } else if (!isTouched && existingHistory.get(noteId) !== noteText) {
        updates.push({ noteId, noteText });
      }

      // history
      for (const h of historyByDoc.get(d.id) || []) {
        const hid = ids.history(h.id);
        if (existingHistory.has(hid)) continue;
        const actor = personByName(h.user_role);
        let action = h.action;
        let comment = h.comment || '';
        if (h.action === 'Uploaded') { action = 'Submitted'; comment = comment || 'Submitted in PowerDocs'; }
        if (h.action === 'File uploaded' && actor && actor.type !== 'contractor') action = 'Response uploaded';
        if (!actor) { comment = `[${String(h.user_role || '').trim()}] ${comment}`.trim(); bump('notes', 'history actor not resolved'); }
        newHistory.rows.add(hid, id, projectId, legacyTime(h.timestamp), action.slice(0, 100), actor?.id || UNKNOWN_ACTOR, roleOf(actor), 1, comment || null);
        bump('inserted', 'history');
      }

      // remarks → the document's first comment
      const remarks = String(d.remarks || '').trim();
      const remarkId = ids.remark(d.id);
      if (remarks && !existingRemarks.has(remarkId) && !existing) {
        newThread.rows.add(remarkId, id, 0, submitter?.id || UNKNOWN_ACTOR, roleOf(submitter), 'comment', remarks, created, 1);
        bump('inserted', 'remarks');
      } else if (remarks && existingRemarks.has(remarkId) && !isTouched && existingRemarks.get(remarkId) !== remarks) {
        updates.push({ remarkId, remarks });
      }

      // files — linked to the old server until --copy-files moves them
      const inPaths = splitList(d.contractor_documents);
      const outPaths = splitList(d.archcorp_documents);
      if (!inPaths.length) bump('notes', 'no submitted file in PowerDocs');
      for (const [kind, paths] of [['in', inPaths], ['out', outPaths]]) {
        for (const p of paths) {
          const parsed = parseStoredPath(p);
          const original = String((kind === 'in' && d.filename) || parsed.original).slice(0, 300);
          const at = parsed.at || row.Updated;
          const key = fileKey(id, kind, original, at);
          if (existingFiles.has(key)) continue;
          existingFiles.add(key);
          newFiles.rows.add(id, kind, original, legacyUrl(p), 1, '—', at);
          bump('inserted', `${kind} files (linked)`);
        }
      }
    }

    // ── Writes: bulk for new rows (keeps the transaction short), row-by-row for refreshes ──
    const bulk = async (t) => { if (t.rows.length) await req().bulk(t, { checkConstraints: true }); };
    await bulk(newDocs);
    await bulk(newHistory);
    await bulk(newThread);
    await bulk(newFiles);
    for (const u of updates) {
      if (u.noteId) {
        await req().input('id', u.noteId).input('c', u.noteText).query('UPDATE dbo.DccDocumentHistory SET Comment = @c WHERE Id = @id');
      } else if (u.remarkId) {
        await req().input('id', u.remarkId).input('t', u.remarks).query('UPDATE dbo.DccDocumentThread SET Txt = @t WHERE Id = @id');
      } else {
        await req().input('id', u.Id).input('ref', u.Ref).input('project', u.ProjectId).input('type', u.Type).input('title', u.Title)
          .input('disc', u.Disciplines).input('firm', u.FirmId).input('by', u.SubmittedBy).input('rev', u.ReviewerIds)
          .input('status', u.Status).input('flow', u.Flow).input('prio', u.Priority).input('cat', u.Category).input('due', u.DueDays)
          .input('created', u.Created).input('updated', u.Updated).input('storage', u.Storage).input('org', u.CreatedByOrg)
          .query(`UPDATE dbo.DccDocuments SET Ref = @ref, ProjectId = @project, Type = @type, Title = @title, Disciplines = @disc,
                  FirmId = @firm, SubmittedBy = @by, ReviewerIds = @rev, Status = @status, Flow = @flow, Priority = @prio,
                  Category = @cat, DueDays = @due, Created = @created, Updated = @updated, Storage = @storage, CreatedByOrg = @org
                  WHERE Id = @id`);
      }
    }

    if (APPLY) await tx.commit();
    else await tx.rollback();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }

  console.log(`\nPowerDocs Phase 2 (documents) — ${LEGACY_DB} → ${process.env.DB_DATABASE} ${APPLY ? '(APPLIED)' : '(DRY RUN — rolled back)'}`);
  console.log(`Legacy: ${legacy.documents.length} documents, ${legacy.history.length} history rows`);
  console.log('Inserted:', report.inserted);
  if (Object.keys(report.updated).length) console.log('Refreshed from PowerDocs:', report.updated);
  if (Object.keys(report.unchanged).length) console.log('Unchanged:', report.unchanged);
  if (Object.keys(report.kept).length) console.log('Kept as edited in DCC:', report.kept);
  console.log('Status mapping (PowerDocs flow / doc status → DCC flow / status):');
  console.table(Object.entries(report.statusMap).sort((a, b) => b[1] - a[1]).map(([mapping, docs]) => ({ mapping, docs })));
  if (Object.keys(report.notes).length) console.log('Recorded in each document\'s "Migrated from PowerDocs" history entry:', report.notes);
  if (!APPLY) console.log('\nRe-run with --apply to commit.');
  await pool.close();
}

// ---------------------------------------------------------------- file copy step

async function copyFiles() {
  const pool = await getPool();
  const rows = (await pool.request().input('base', `${LEGACY_FILES_BASE}%`)
    .query('SELECT Id, DocumentId, Kind, OriginalName, StoredName FROM dbo.DccDocumentFiles WHERE StoredName LIKE @base ORDER BY Id'))
    .recordset.slice(0, LIMIT);
  console.log(`\nPowerDocs Phase 2 (files) — ${rows.length} file(s) still linked to ${LEGACY_FILES_BASE} ${APPLY ? '(COPYING)' : '(DRY RUN — checking only)'}`);

  let firebase = null;
  let getDownloadURL = null;
  if (APPLY) {
    firebase = require('../config/firebase');
    ({ getDownloadURL } = require('firebase-admin/storage'));
  }
  const stats = { ok: 0, bytes: 0, missing: [], failed: [] };
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const f = rows[next++];
      try {
        const res = await fetch(f.StoredName, { method: APPLY ? 'GET' : 'HEAD' });
        if (res.status === 404) { stats.missing.push(`${f.DocumentId} ${f.Kind}: ${f.OriginalName}`); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let bytes = Number(res.headers.get('content-length')) || 0;
        if (APPLY) {
          const safe = f.OriginalName.replace(/[^\w.\- ]+/g, '_').slice(-120);
          const dest = firebase.bucket.file(`documents/${f.DocumentId}/legacy/${f.Kind}_${f.Id}_${safe}`);
          let counted = 0;
          const counter = new Transform({ transform(chunk, _enc, cb) { counted += chunk.length; cb(null, chunk); } });
          await pipeline(Readable.fromWeb(res.body), counter, dest.createWriteStream({
            resumable: false, metadata: { contentType: res.headers.get('content-type') || 'application/octet-stream' },
          }));
          bytes = counted;
          const url = await getDownloadURL(dest);
          await pool.request().input('id', f.Id).input('old', f.StoredName).input('url', url).input('size', sizeLabel(bytes))
            .query('UPDATE dbo.DccDocumentFiles SET StoredName = @url, SizeLabel = @size WHERE Id = @id AND StoredName = @old');
        }
        stats.ok++;
        stats.bytes += bytes;
        if (stats.ok % 100 === 0) console.log(`  … ${stats.ok}/${rows.length} (${(stats.bytes / 1024 ** 3).toFixed(2)} GB)`);
      } catch (err) {
        stats.failed.push(`${f.DocumentId} ${f.Kind}: ${f.OriginalName} — ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  console.log(`${APPLY ? 'Copied' : 'Reachable'}: ${stats.ok} file(s), ${(stats.bytes / 1024 ** 3).toFixed(2)} GB`);
  if (stats.missing.length) console.log(`Missing on the old server (left linked, ${stats.missing.length}):\n  ` + stats.missing.slice(0, 50).join('\n  '));
  if (stats.failed.length) console.log(`Failed — re-run to retry (${stats.failed.length}):\n  ` + stats.failed.slice(0, 50).join('\n  '));
  if (!APPLY) console.log('\nRe-run with --copy-files --apply to copy into Firebase Storage.');
  await pool.close();
}

(COPY_FILES ? copyFiles() : migrateDocuments()).catch((err) => {
  console.error('PowerDocs Phase 2 migration failed:', err.message);
  process.exit(1);
});
