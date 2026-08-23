const express = require('express');
const { create } = require('../controllers/scheduleActivity.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/projects/:id/schedule', requireRole('Admin'), create);

module.exports = router;
