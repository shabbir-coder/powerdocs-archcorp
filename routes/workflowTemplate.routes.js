const express = require('express');
const { list } = require('../controllers/workflowTemplate.controller');

const router = express.Router();
router.get('/workflowtemplates', list);

module.exports = router;
