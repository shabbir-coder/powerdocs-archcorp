const express = require('express');
const authRoutes = require('./auth.routes');
const bootstrapRoutes = require('./bootstrap.routes');
const documentRoutes = require('./document.routes');
const clientRoutes = require('./client.routes');
const projectRoutes = require('./project.routes');
const scheduleActivityRoutes = require('./scheduleActivity.routes');
const employeeRoutes = require('./employee.routes');
const firmRoutes = require('./firm.routes');
const contractorRoutes = require('./contractor.routes');
const snagRoutes = require('./snag.routes');
const lookupRoutes = require('./lookup.routes');
const notificationRoutes = require('./notification.routes');
const accRoutes = require('./acc.routes');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public: sign-in endpoints only. Everything below requires a valid session.
router.use(authRoutes);
router.use(requireAuth);

router.use(bootstrapRoutes);
router.use(documentRoutes);
router.use(clientRoutes);
router.use(projectRoutes);
router.use(scheduleActivityRoutes);
router.use(employeeRoutes);
router.use(firmRoutes);
router.use(contractorRoutes);
router.use(snagRoutes);
router.use(lookupRoutes);
router.use(notificationRoutes);
router.use(accRoutes);

module.exports = router;

