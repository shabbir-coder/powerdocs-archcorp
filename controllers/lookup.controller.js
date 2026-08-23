const { getPool } = require('../config/db');
const lookupModel = require('../models/lookup.model');
const { genId } = require('../utils/id');

const COMPLEX_TYPES = ['doc-types', 'statuses'];

async function getBundle(req, res, next) {
  try {
    const pool = await getPool();
    res.json(await lookupModel.getBundle(pool));
  } catch (err) {
    next(err);
  }
}

async function getAllByType(req, res, next) {
  try {
    const pool = await getPool();
    const { type } = req.params;
    if (type === 'doc-types') return res.json({ docTypes: await lookupModel.getAllDocTypes(pool) });
    if (type === 'statuses') return res.json({ statuses: await lookupModel.getAllStatuses(pool) });
    res.json({ items: await lookupModel.getAllSimple(pool, type) });
  } catch (err) {
    next(err);
  }
}

async function createByType(req, res, next) {
  try {
    const pool = await getPool();
    const { type } = req.params;

    if (type === 'doc-types') {
      const { name, category, refCode, defaultDueDays, sortOrder } = req.body;
      if (!name || !category || !refCode) return res.status(400).json({ error: 'name, category and refCode are required' });
      const docType = { id: name, name, category, refCode, defaultDueDays: defaultDueDays || 14, sortOrder: sortOrder || 0 };
      await lookupModel.insertDocType(pool, docType);
      return res.status(201).json({ docType });
    }
    if (type === 'statuses') {
      const { name, cssClass, reviewCode, isCompletedFlow, sortOrder } = req.body;
      if (!name || !cssClass || !reviewCode) return res.status(400).json({ error: 'name, cssClass and reviewCode are required' });
      const status = { id: name, name, cssClass, reviewCode, isCompletedFlow: !!isCompletedFlow, sortOrder: sortOrder || 0 };
      await lookupModel.insertStatus(pool, status);
      return res.status(201).json({ status });
    }

    const { name, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = type === 'review-codes' ? (req.body.id || genId('rc')) : name;
    const item = { id, name, sortOrder: sortOrder || 0 };
    await lookupModel.insertSimple(pool, type, item);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function updateByType(req, res, next) {
  try {
    const pool = await getPool();
    const { type, id } = req.params;

    if (type === 'doc-types') {
      const { name, category, refCode, defaultDueDays, sortOrder } = req.body;
      if (!name || !category || !refCode) return res.status(400).json({ error: 'name, category and refCode are required' });
      await lookupModel.updateDocType(pool, id, { name, category, refCode, defaultDueDays: defaultDueDays || 14, sortOrder: sortOrder || 0 });
      return res.json({ docType: await lookupModel.getDocTypeByName(pool, id) });
    }
    if (type === 'statuses') {
      const { name, cssClass, reviewCode, isCompletedFlow, sortOrder } = req.body;
      if (!name || !cssClass || !reviewCode) return res.status(400).json({ error: 'name, cssClass and reviewCode are required' });
      await lookupModel.updateStatus(pool, id, { name, cssClass, reviewCode, isCompletedFlow: !!isCompletedFlow, sortOrder: sortOrder || 0 });
      return res.json({ status: await lookupModel.getStatusByName(pool, id) });
    }

    const { name, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    await lookupModel.updateSimple(pool, type, id, { name, sortOrder: sortOrder || 0 });
    res.json({ item: { id, name, sortOrder: sortOrder || 0 } });
  } catch (err) {
    next(err);
  }
}

async function removeByType(req, res, next) {
  try {
    const pool = await getPool();
    const { type, id } = req.params;
    if (type === 'doc-types') await lookupModel.removeDocType(pool, id);
    else if (type === 'statuses') await lookupModel.removeStatus(pool, id);
    else await lookupModel.removeSimple(pool, type, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getBundle, getAllByType, createByType, updateByType, removeByType, COMPLEX_TYPES };
