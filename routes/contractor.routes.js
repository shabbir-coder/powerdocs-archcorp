const express = require('express');
const { create, update, remove, setPassword, list } = require('../controllers/contractor.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/contractors', list);
router.post('/contractors', requireRole('Admin'), create);
router.put('/contractors/:id', requireRole('Admin'), update);
router.delete('/contractors/:id', requireRole('Admin'), remove);
router.post('/contractors/:id/password', requireRole('Admin'), setPassword);

module.exports = router;
