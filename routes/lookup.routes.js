const express = require('express');
const { getBundle, getAllByType, createByType, updateByType, removeByType } = require('../controllers/lookup.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/lookups', getBundle);
router.get('/lookups/:type', getAllByType);
router.post('/lookups/:type', requireRole('Admin'), createByType);
router.put('/lookups/:type/:id', requireRole('Admin'), updateByType);
router.delete('/lookups/:type/:id', requireRole('Admin'), removeByType);

module.exports = router;
