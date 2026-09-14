const express = require('express');
const { list } = require('../controllers/transmittal.controller');

const router = express.Router();
router.get('/transmittals', list);

module.exports = router;
