const { getPool } = require('../config/db');
const chatModel = require('../models/chat.model');
const { genId } = require('../utils/id');

// kind='ai' is the scripted rule-based assistant (IntelService.chatAnswer on the
// client — not a real LLM call). The server always attributes it to the literal
// 'ai' sender regardless of who's authenticated, same as kind='msg' is always
// attributed to req.user.id — the client picks the kind, never the "by".
async function create(req, res, next) {
  try {
    const pool = await getPool();
    const { id: projectId } = req.params;
    const { text, kind } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });
    if (kind && kind !== 'msg' && kind !== 'ai') return res.status(400).json({ error: "kind must be 'msg' or 'ai'" });
    const message = await chatModel.insert(pool, {
      id: genId('m'), project: projectId, by: kind === 'ai' ? 'ai' : req.user.id, text: text.trim(),
      kind: kind || 'msg', at: new Date().toISOString(),
    });
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
