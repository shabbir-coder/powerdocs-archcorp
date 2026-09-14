const express = require('express');
const { list } = require('../controllers/chat.controller');

const router = express.Router();
router.get('/chats', list);

module.exports = router;
