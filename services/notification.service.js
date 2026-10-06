const notificationModel = require('../models/notification.model');
const pushService = require('./push.service');
const { emitToPersons } = require('../realtime/notification.socket');

const PUSH_TITLES = {
  review: 'Review requested',
  followup: 'Follow-up requested',
  decision: 'Decision posted',
};

function plainText(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

// Single entry point for creating a notification: saves it, then fans it out
// live (Socket.IO `notification:new`) and as an FCM push. Delivery is
// best-effort and never fails the request that created the notification -
// clients recover anything they missed from GET /notifications.
async function create(pool, n) {
  const notification = await notificationModel.insert(pool, n);
  // Admins see every notification in GET /notifications, so they get it live too.
  emitToPersons(notification.to, 'notification:new', notification, { includeAdmins: true });
  pushService.sendToPersons(notification.to, {
    title: PUSH_TITLES[notification.kind] || 'DCC notification',
    body: plainText(notification.text),
    data: {
      type: 'notification',
      notificationId: notification.id,
      kind: notification.kind,
      projectId: notification.project,
      docId: notification.docId,
    },
  }).catch((err) => console.error('FCM push failed:', err.message));
  return notification;
}

module.exports = { create };
