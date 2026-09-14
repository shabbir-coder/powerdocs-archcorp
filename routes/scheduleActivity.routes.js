const express = require('express');
const { create, list } = require('../controllers/scheduleActivity.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.get('/schedules', list);
router.post('/projects/:id/schedule', requireRole('Admin'), create);

module.exports = router;
