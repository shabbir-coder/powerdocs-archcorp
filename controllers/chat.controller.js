const chatService = require('../services/chat.service');
const { broadcastMessage } = require('../realtime/chat.socket');
const { withPagination, toInt } = require('../utils/listQuery');

// Per-project history page size cap (and the default, matching the original fixed TOP 500).
const MAX_PAGE = 500;

// kind='ai' is the scripted rule-based assistant (IntelService.chatAnswer on the
// client — not a real LLM call). The server always attributes it to the literal
// 'ai' sender regardless of who's authenticated, same as kind='msg' is always
// attributed to req.user.id — the client picks the kind, never the "by".
async function create(req, res, next) {
  try {
    const { id: projectId } = req.params;
    const { text, kind = 'msg' } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 10000) return res.status(400).json({ error: 'text (1-10000 characters) is required' });
    if (kind && kind !== 'msg' && kind !== 'ai') return res.status(400).json({ error: "kind must be 'msg' or 'ai'" });
    const message = await chatService.createMessage(req.user, projectId, text, kind);
    broadcastMessage(message);
    res.status(201).json({ message });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { items, pagination } = await chatService.getAccessibleHistory(req.user, req.query);
    const chats = {};
    for (const m of items) {
      (chats[m.project] = chats[m.project] || []).push(m);
    }
    res.json(withPagination({ chats }, pagination));
  } catch (err) {
    next(err);
  }
}

async function listProject(req, res, next) {
  try {
    const { since, before } = req.query;
    if (since && Number.isNaN(Date.parse(since))) return res.status(400).json({ error: 'since must be a valid ISO-8601 timestamp' });
    if (before && Number.isNaN(Date.parse(before))) return res.status(400).json({ error: 'before must be a valid ISO-8601 timestamp' });
    const limit = req.query.limit === undefined ? MAX_PAGE : toInt(req.query.limit, 'limit', 1, MAX_PAGE);
    const messages = await chatService.getHistory(req.user, req.params.id, since || null, { before: before || null, limit });
    res.json({ messages, hasMore: messages.length === limit });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { create, list, listProject };
