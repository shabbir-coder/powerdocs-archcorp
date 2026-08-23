const crypto = require('crypto');

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = { genId };
