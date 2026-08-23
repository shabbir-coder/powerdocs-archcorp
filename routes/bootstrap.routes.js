const express = require('express');
const { getBootstrap } = require('../controllers/bootstrap.controller');

const router = express.Router();
router.get('/bootstrap', getBootstrap);

module.exports = router;
