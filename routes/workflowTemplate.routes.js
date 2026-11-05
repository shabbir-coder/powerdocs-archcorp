const express = require('express');
const { list, create, update, remove } = require('../controllers/workflowTemplate.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/workflowtemplates', list);
router.post('/workflowtemplates', requireRole('Admin'), create);
router.put('/workflowtemplates/:id', requireRole('Admin'), update);
router.delete('/workflowtemplates/:id', requireRole('Admin'), remove);

module.exports = router;
