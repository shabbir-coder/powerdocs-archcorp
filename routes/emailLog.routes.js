const express = require('express');
const { list } = require('../controllers/emailLog.controller');

const router = express.Router();
router.get('/emails', list);

module.exports = router;
