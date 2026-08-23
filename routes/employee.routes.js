const express = require('express');
const { create, update, remove, setPassword } = require('../controllers/employee.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/employees', requireRole('Admin'), create);
router.put('/employees/:id', requireRole('Admin'), update);
router.delete('/employees/:id', requireRole('Admin'), remove);
router.post('/employees/:id/password', requireRole('Admin'), setPassword);

module.exports = router;
