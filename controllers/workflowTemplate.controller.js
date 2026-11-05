const { getPool } = require('../config/db');
const workflowTemplateModel = require('../models/workflowTemplate.model');
const { genId } = require('../utils/id');
const { withPagination } = require('../utils/listQuery');

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validates the request body and returns a clean template shape, or { error }. */
function normalize(body = {}) {
  const name = str(body.name, 160);
  if (!name) return { error: 'name is required' };

  const statusOnEntry = str(body.statusOnEntry, 120);
  if (!statusOnEntry) return { error: 'statusOnEntry is required' };

  const statusLabels = (Array.isArray(body.statusLabels) ? body.statusLabels : [])
    .map((l) => ({ label: str(l?.label, 80), onCompletion: str(l?.onCompletion, 120) }))
    .filter((l) => l.label);
  if (!statusLabels.length) return { error: 'At least one review status label is required' };
  if (statusLabels.some((l) => !l.onCompletion)) return { error: 'Every status label needs an on-completion document status' };
  if (new Set(statusLabels.map((l) => l.label.toLowerCase())).size !== statusLabels.length) {
    return { error: 'Status labels must be unique' };
  }

  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map((s) => ({ name: str(s?.name, 120), assignee: str(s?.assignee, 120), duration: Math.round(Number(s?.duration)) }))
    .filter((s) => s.name);
  if (!steps.length) return { error: 'At least one workflow step is required' };
  if (steps.some((s) => !s.assignee)) return { error: 'Every step needs an assignee' };
  if (steps.some((s) => !Number.isFinite(s.duration) || s.duration < 1 || s.duration > 365)) {
    return { error: 'Step durations must be between 1 and 365 days' };
  }

  const ini = body.initiator || {};
  return {
    template: {
      name,
      statusOnEntry,
      statusLabels,
      outcomeDecidedBy: str(body.outcomeDecidedBy, 160) || 'Final step outcome (lead reviewer)',
      steps,
      transmittalReason: str(body.transmittalReason, 120) || statusOnEntry,
      flatten: !!body.flatten,
      flattenComponents: str(body.flattenComponents, 60) || 'Both',
      initiator: { editDurations: !!ini.editDurations, editParticipants: !!ini.editParticipants, skipSteps: !!ini.skipSteps },
    },
  };
}

async function list(req, res, next) {
  try {
    const pool = await getPool();
    const { items, pagination } = await workflowTemplateModel.list(pool, req.query);
    res.json(withPagination({ workflowTemplates: items }, pagination));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { template, error } = normalize(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    if (await workflowTemplateModel.findByName(pool, template.name)) {
      return res.status(409).json({ error: 'A workflow template with this name already exists' });
    }
    const workflowTemplate = await workflowTemplateModel.insert(pool, { id: genId('wf'), ...template });
    res.status(201).json({ workflowTemplate });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { template, error } = normalize(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    if (!(await workflowTemplateModel.getById(pool, id))) return res.status(404).json({ error: 'Workflow template not found' });
    const clash = await workflowTemplateModel.findByName(pool, template.name);
    if (clash && clash.id !== id) return res.status(409).json({ error: 'A workflow template with this name already exists' });
    const workflowTemplate = await workflowTemplateModel.update(pool, id, template);
    res.json({ workflowTemplate });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (!(await workflowTemplateModel.getById(pool, id))) return res.status(404).json({ error: 'Workflow template not found' });
    const using = await workflowTemplateModel.projectsUsing(pool, id);
    if (using.length) {
      return res.status(409).json({
        error: `Template is applied to ${using.length} project${using.length > 1 ? 's' : ''} (${using.map((p) => p.pid).join(', ')}) — reassign them in Project Master first`,
        projects: using,
      });
    }
    if ((await workflowTemplateModel.count(pool)) <= 1) {
      return res.status(409).json({ error: 'Cannot delete the last remaining workflow template' });
    }
    await workflowTemplateModel.remove(pool, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
