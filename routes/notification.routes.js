const express = require('express');
const { markRead, list } = require('../controllers/notification.controller');

const router = express.Router();
router.get('/notifications', list);
router.post('/notifications/read', markRead);

module.exports = router;
