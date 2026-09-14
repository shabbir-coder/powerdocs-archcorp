const express = require('express');
const { list } = require('../controllers/due.controller');

const router = express.Router();
router.get('/dues', list);

module.exports = router;
