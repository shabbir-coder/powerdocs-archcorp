const express = require('express');
const { create, updateStatus } = require('../controllers/snag.controller');

const router = express.Router();
router.post('/snags', create);
router.post('/snags/status/:id', updateStatus);

module.exports = router;
