const express = require('express');
const { create, update, updateEnrichment, remove } = require('../controllers/project.controller');
const { add, remove: removeAssignment } = require('../controllers/assignment.controller');
const { create: createDistribution } = require('../controllers/distribution.controller');
const { create: createChatMessage } = require('../controllers/chat.controller');
const { create: createTransmittal } = require('../controllers/transmittal.controller');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.post('/projects', requireRole('Admin'), create);
router.put('/projects/:id', requireRole('Admin'), update);
router.post('/projects/:id/config', requireRole('Admin'), updateEnrichment);
router.delete('/projects/:id', requireRole('Admin'), remove);
router.post('/projects/:id/team', requireRole('Admin'), add);
router.delete('/projects/:id/team/:personId', requireRole('Admin'), removeAssignment);
router.post('/projects/:id/distribution', requireRole('Admin'), createDistribution);
router.post('/projects/:id/chat', createChatMessage);
router.post('/projects/:id/transmittals', createTransmittal);

module.exports = router;
