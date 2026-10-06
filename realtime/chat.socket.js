const { Server } = require('socket.io');
const { verifySession } = require('../utils/jwt');
const chatService = require('../services/chat.service');

let io;

function projectRoom(projectId) {
  return `project:${projectId}`;
}

function initializeChatSocket(server) {
  const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  io = new Server(server, {
    cors: { origin: allowedOrigins.length ? allowedOrigins : '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const suppliedToken = socket.handshake.auth?.token;
    const token = typeof suppliedToken === 'string' ? suppliedToken.replace(/^Bearer\s+/i, '') : '';
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifySession(token);
      socket.data.user = {
        id: payload.sub,
        role: payload.role,
        name: payload.name,
        email: payload.email,
        disc: payload.disc,
        firm: payload.firm,
      };
      if (payload.exp) {
        socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, payload.exp * 1000 - Date.now()));
        socket.data.expiryTimer.unref?.();
      }
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => clearTimeout(socket.data.expiryTimer));

    socket.on('chat:join', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const projectId = payload?.projectId;
      if (typeof projectId !== 'string' || !projectId.trim()) {
        return reply({ ok: false, code: 'BAD_REQUEST', error: 'projectId is required' });
      }
      try {
        if (!(await chatService.canAccessProject(socket.data.user, projectId))) {
          return reply({ ok: false, code: 'FORBIDDEN', error: 'Project not found or access denied' });
        }
        await socket.join(projectRoom(projectId));
        reply({ ok: true, projectId });
      } catch {
        reply({ ok: false, code: 'SERVER_ERROR', error: 'Could not join project chat' });
      }
    });

    socket.on('chat:leave', async (payload, acknowledge) => {
      const projectId = payload?.projectId;
      if (typeof projectId === 'string') await socket.leave(projectRoom(projectId));
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('chat:send', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const projectId = payload?.projectId;
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (typeof projectId !== 'string' || !text || text.length > 10000) {
        return reply({ ok: false, code: 'BAD_REQUEST', error: 'projectId and text (1-10000 characters) are required' });
      }
      if (!socket.rooms.has(projectRoom(projectId))) {
        return reply({ ok: false, code: 'NOT_IN_ROOM', error: 'Join the project chat before sending messages' });
      }
      try {
        const message = await chatService.createMessage(socket.data.user, projectId, text);
        io.to(projectRoom(projectId)).emit('chat:message', message);
        reply({ ok: true, message });
      } catch (error) {
        reply({ ok: false, code: error.status === 404 ? 'FORBIDDEN' : 'SERVER_ERROR', error: error.status === 404 ? error.message : 'Could not save message' });
      }
    });
  });

  return io;
}

function broadcastMessage(message) {
  if (io) io.to(projectRoom(message.project)).emit('chat:message', message);
}

async function removeProjectMember(projectId, personId) {
  if (!io) return;
  const sockets = await io.in(projectRoom(projectId)).fetchSockets();
  await Promise.all(sockets
    .filter((socket) => socket.data.user?.id === personId)
    .map((socket) => socket.leave(projectRoom(projectId))));
}

module.exports = { initializeChatSocket, broadcastMessage, removeProjectMember };