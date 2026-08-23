const multer = require('multer');

// Files are held in memory only, long enough to stream to Firebase Storage —
// never written to local disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

module.exports = { upload };
