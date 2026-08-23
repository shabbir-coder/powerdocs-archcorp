const express = require('express');
const { upload } = require('../middleware/upload');
const {
  createDocument, addComment, addReply, toggleThread, review, resubmit,
  setMode, addMemberReview, saveMarkups, notifyTeam, followUp, sendEmailLog, proxyFile,
} = require('../controllers/document.controller');

const router = express.Router();

router.post('/documents', upload.single('file'), createDocument);
router.get('/documents/:id/file', proxyFile);
router.post('/documents/:id/comments', addComment);
router.post('/documents/:id/replies', addReply);
router.post('/documents/:id/thread/:seqIndex/toggle', toggleThread);
router.post('/documents/:id/review', review);
router.post('/documents/:id/resubmit', resubmit);
router.post('/documents/:id/mode', setMode);
router.post('/documents/:id/member-review', addMemberReview);
router.put('/documents/:id/markups', saveMarkups);
router.post('/documents/:id/notify', notifyTeam);
router.post('/documents/:id/follow-up', followUp);
router.post('/documents/:id/email-log', sendEmailLog);

module.exports = router;
