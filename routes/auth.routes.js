const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loginAdmin, loginReviewer, loginContractor, loginDev, devOptions, loginMicrosoft, me } = require('../controllers/auth.controller');

const router = express.Router();
router.post('/auth/login/admin', loginAdmin);
router.post('/auth/login/reviewer', loginReviewer);
router.post('/auth/login/contractor', loginContractor);
router.post('/auth/login/dev', loginDev);
router.get('/auth/dev-options', devOptions);
router.post('/auth/login/microsoft', loginMicrosoft);
router.get('/auth/me', requireAuth, me);

module.exports = router;
