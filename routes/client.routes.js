const express = require('express');
const { create, update, remove, list } = require('../controllers/client.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/clients', list);
router.post('/clients', requireRole('Admin'), create);
router.put('/clients/:id', requireRole('Admin'), update);
router.delete('/clients/:id', requireRole('Admin'), remove);

module.exports = router;
