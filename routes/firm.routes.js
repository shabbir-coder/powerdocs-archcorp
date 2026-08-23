const express = require('express');
const { create, update, remove } = require('../controllers/firm.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/firms', requireRole('Admin'), create);
router.put('/firms/:id', requireRole('Admin'), update);
router.delete('/firms/:id', requireRole('Admin'), remove);

module.exports = router;
