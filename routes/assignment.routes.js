const express = require('express');
const { list } = require('../controllers/assignment.controller');

const router = express.Router();
router.get('/assignments', list);

module.exports = router;
