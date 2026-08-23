const express = require('express');
const { listProjects } = require('../controllers/acc.controller');

const router = express.Router();
router.get('/acc/projects', listProjects);

module.exports = router;
