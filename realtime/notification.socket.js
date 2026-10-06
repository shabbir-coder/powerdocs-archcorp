const { verifySession } = require('../utils/jwt');

// Notification delivery on the same Socket.IO server as chat. Authentication
// already happened in chat.socket.js's middleware (socket.data.user); this
// only adds per-person rooms so notifications reach every open tab/device of
// a person without the client joining anything.
let io;

const ADMIN_ROOM = 'role:Admin';

// Lead time for `auth:expired`, so the event is delivered before chat.socket.js's
// expiry timer disconnects the socket.
const EXPIRY_NOTICE_MS = 1000;

function personRoom(personId) {
  return `person:${personId}`;
}

function initializeNotificationSocket(server) {
  io = server;
  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user?.id) return;
    socket.join(personRoom(user.id));
    if (user.role === 'Admin') socket.join(ADMIN_ROOM);

    // Tells the client why it is about to be dropped: a server-side
    // disconnect is not auto-retried, so it must refresh and reconnect.
    try {
      const { exp } = verifySession(String(socket.handshake.auth?.token || '').replace(/^Bearer\s+/i, ''));
      if (exp) {
        const timer = setTimeout(() => socket.emit('auth:expired'), Math.max(0, exp * 1000 - Date.now() - EXPIRY_NOTICE_MS));
        timer.unref?.();
        socket.on('disconnect', () => clearTimeout(timer));
      }
    } catch {
      /* token was verified by the auth middleware moments ago */
    }
  });
}

// A socket in several target rooms (e.g. an Admin who is also a recipient)
// still receives the event once: Socket.IO de-duplicates across rooms
// within a single emit.
function emitToPersons(personIds, event, payload, { includeAdmins = false } = {}) {
  const rooms = [...new Set(personIds)].filter(Boolean).map(personRoom);
  if (includeAdmins) rooms.push(ADMIN_ROOM);
  if (io && rooms.length) io.to(rooms).emit(event, payload);
}

module.exports = { initializeNotificationSocket, emitToPersons };
