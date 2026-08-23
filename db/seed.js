// Seeds only the lookup/config tables (the Aconex numbering standard the app
// needs to function — disciplines, departments, categories, priorities, review
// codes, doc types, statuses). Demo business data (clients, projects, employees,
// contractors, firms, documents, snags, dues, schedule activities) has been
// removed — real data is entered through the app from here on.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { getPool, sql } = require('../config/db');
const lookupModel = require('../models/lookup.model');
const workflowTemplateModel = require('../models/workflowTemplate.model');

const disciplines = ['Architecture', 'Structure', 'Civil', 'Mechanical', 'Electrical', 'QS', 'BIM']
  .map((name, i) => ({ id: name, name, sortOrder: i }));
const departments = ['Design', 'Engineering', 'Supervision', 'Cost & Commercial', 'BIM & Technology']
  .map((name, i) => ({ id: name, name, sortOrder: i }));
const categories = ['Shop Drawings', 'Material Submittals', 'Method Statements', 'RFIs', 'Inspection Requests', 'As-Built', 'O&M & Warranties', 'Correspondence', 'Others']
  .map((name, i) => ({ id: name, name, sortOrder: i }));
const priorities = ['High', 'Medium', 'Low'].map((name, i) => ({ id: name, name, sortOrder: i }));
const reviewCodes = [
  { id: 'A', name: 'Approved' },
  { id: 'B', name: 'Approved with comments — proceed' },
  { id: 'C', name: 'Revise & resubmit' },
  { id: 'D', name: 'Rejected' },
  { id: 'NA', name: 'In review — no code yet' },
].map((r, i) => ({ ...r, sortOrder: i }));
const docTypes = [
  { id: 'Material Submittal', category: 'Material Submittals', refCode: 'MS', defaultDueDays: 14 },
  { id: 'Document Submittal', category: 'Correspondence', refCode: 'DS', defaultDueDays: 14 },
  { id: 'Shop Drawing', category: 'Shop Drawings', refCode: 'SD', defaultDueDays: 14 },
  { id: 'Method Statement', category: 'Method Statements', refCode: 'MST', defaultDueDays: 14 },
  { id: 'RFI', category: 'RFIs', refCode: 'RFI', defaultDueDays: 7 },
  { id: 'Prequalification', category: 'Correspondence', refCode: 'PQ', defaultDueDays: 14 },
  { id: 'Inspection Request (IR)', category: 'Inspection Requests', refCode: 'IR', defaultDueDays: 14 },
  { id: 'Material Inspection Request (MIR)', category: 'Inspection Requests', refCode: 'MIR', defaultDueDays: 14 },
  { id: 'As Built Drawings', category: 'As-Built', refCode: 'AB', defaultDueDays: 14 },
  { id: 'Warranties', category: 'O&M & Warranties', refCode: 'WAR', defaultDueDays: 14 },
  { id: 'O&M Manual', category: 'O&M & Warranties', refCode: 'OM', defaultDueDays: 14 },
  { id: 'Others', category: 'Others', refCode: 'DOC', defaultDueDays: 14 },
].map((t, i) => ({ ...t, name: t.id, sortOrder: i }));
const statuses = [
  { id: 'Submitted', cssClass: 's-submitted', reviewCode: 'NA', isCompletedFlow: false },
  { id: 'Under Review', cssClass: 's-review', reviewCode: 'NA', isCompletedFlow: false },
  { id: 'Approved', cssClass: 's-approved', reviewCode: 'A', isCompletedFlow: true },
  { id: 'Approved with Comments', cssClass: 's-comments', reviewCode: 'B', isCompletedFlow: true },
  { id: 'Revise and re-submit', cssClass: 's-revise', reviewCode: 'C', isCompletedFlow: false },
  { id: 'Rejected', cssClass: 's-rejected', reviewCode: 'D', isCompletedFlow: false },
  { id: 'For Information', cssClass: 's-info', reviewCode: 'B', isCompletedFlow: true },
].map((s, i) => ({ ...s, name: s.id, sortOrder: i }));

// Reference workflow templates — read-only in the app today (no create/edit UI
// exists yet), so these are seeded once as shared config rather than left to
// drift per-browser in Angular local state.
const workflowTemplates = [
  {
    id: 'wf1', name: 'Document Review — Standard (7 day)', statusOnEntry: 'Issued For Approval',
    statusLabels: [
      { label: 'Code 1', onCompletion: 'Approved' },
      { label: 'Code 2', onCompletion: 'Approved - Approved As Noted' },
      { label: 'Code 3', onCompletion: 'Revise & Re-Submit' },
      { label: 'DS PM Reviewed', onCompletion: 'Reviewed' },
      { label: 'Code 4', onCompletion: 'Rejected' },
      { label: 'QA Checked And Passed', onCompletion: 'Reviewed' },
    ],
    outcomeDecidedBy: 'Final step outcome (lead reviewer)',
    steps: [
      { name: 'Discipline Engineer Review', assignee: 'Discipline reviewer', duration: 6 },
      { name: 'QA Check', assignee: 'QA / QC', duration: 1 },
    ],
    transmittalReason: 'Issued for Approval', flatten: true, flattenComponents: 'Both',
    initiator: { editDurations: true, editParticipants: true, skipSteps: false },
  },
  {
    id: 'wf2', name: 'Drawing Approval — 3 Stage', statusOnEntry: 'For Approval',
    statusLabels: [
      { label: 'Code A', onCompletion: 'Approved' },
      { label: 'Code B', onCompletion: 'Approved - Approved As Noted' },
      { label: 'Code C', onCompletion: 'Revise & Re-Submit' },
      { label: 'Code D', onCompletion: 'Rejected' },
    ],
    outcomeDecidedBy: 'Lead consultant (final step)',
    steps: [
      { name: 'Design Review', assignee: 'Discipline reviewer', duration: 4 },
      { name: 'Lead Verification', assignee: 'Lead reviewer', duration: 2 },
      { name: 'QA Check', assignee: 'QA / QC', duration: 1 },
    ],
    transmittalReason: 'For Approval', flatten: true, flattenComponents: 'Both',
    initiator: { editDurations: true, editParticipants: true, skipSteps: false },
  },
  {
    id: 'wf3', name: 'Fast-Track RFI Response', statusOnEntry: 'Issued For Approval',
    statusLabels: [
      { label: 'Responded', onCompletion: 'For Information' },
      { label: 'Revise', onCompletion: 'Revise & Re-Submit' },
    ],
    outcomeDecidedBy: 'Responding engineer',
    steps: [{ name: 'Engineer Response', assignee: 'Discipline reviewer', duration: 3 }],
    transmittalReason: 'For Information', flatten: false, flattenComponents: 'Annotations only',
    initiator: { editDurations: true, editParticipants: false, skipSteps: true },
  },
];

async function seed() {
  const pool = await getPool();

  const lookupTypes = [
    ['disciplines', disciplines], ['departments', departments], ['categories', categories],
    ['priorities', priorities], ['review-codes', reviewCodes],
  ];
  for (const [type, list] of lookupTypes) {
    const existing = await lookupModel.getAllSimple(pool, type);
    const existingIds = new Set(existing.map((x) => x.id));
    for (const item of list) {
      if (existingIds.has(item.id)) continue;
      await lookupModel.insertSimple(pool, type, item);
    }
  }
  const existingDocTypes = new Set((await lookupModel.getAllDocTypes(pool)).map((x) => x.id));
  for (const dt of docTypes) {
    if (existingDocTypes.has(dt.id)) continue;
    await lookupModel.insertDocType(pool, dt);
  }
  const existingStatuses = new Set((await lookupModel.getAllStatuses(pool)).map((x) => x.id));
  for (const s of statuses) {
    if (existingStatuses.has(s.id)) continue;
    await lookupModel.insertStatus(pool, s);
  }

  await workflowTemplateModel.insertMany(pool, workflowTemplates);

  console.log('Lookup/config tables and workflow templates seeded.');
  await sql.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
