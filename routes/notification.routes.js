const express = require('express');
const { markRead } = require('../controllers/notification.controller');

const router = express.Router();
router.post('/notifications/read', markRead);

module.exports = router;
