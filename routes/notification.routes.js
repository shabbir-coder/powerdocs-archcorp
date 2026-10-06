const express = require('express');
const { markRead, markOneRead, list, registerDeviceToken, removeDeviceToken } = require('../controllers/notification.controller');

const router = express.Router();
router.get('/notifications', list);
router.post('/notifications/read', markRead);
router.post('/notifications/fcm-token', registerDeviceToken);
router.delete('/notifications/fcm-token', removeDeviceToken);
router.post('/notifications/:id/read', markOneRead);

module.exports = router;
