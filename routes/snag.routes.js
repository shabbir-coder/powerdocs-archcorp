const express = require('express');
const { create, updateStatus, list } = require('../controllers/snag.controller');

const router = express.Router();
router.get('/snags', list);
router.post('/snags', create);
router.post('/snags/status/:id', updateStatus);

module.exports = router;
