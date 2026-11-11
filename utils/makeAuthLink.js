// Test helper: prints a signed staff sign-in link, exactly as task.archcorp.ai
// would build it. The link is valid for 2 minutes and can be used once.
//
//   node utils/makeAuthLink.js abc@archcorp.biz [baseUrl]
//   baseUrl defaults to https://dcc.archcorp.ai (use http://localhost:5500 locally)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');

const [email, baseUrl = 'http://dcc.archcorp.ai'] = process.argv.slice(2);
const secret = process.env.AUTH_LINK_SECRET;
if (!email) {
  console.error('Usage: node utils/makeAuthLink.js <email> [baseUrl]');
  process.exit(1);
}
if (!secret) {
  console.error('AUTH_LINK_SECRET is not set in .env');
  process.exit(1);
}

const ts = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', secret).update(`${email.trim().toLowerCase()}.${ts}`).digest('hex');
console.log(`${baseUrl.replace(/\/$/, '')}/api/auth/auth-link?email=${encodeURIComponent(email.trim())}&ts=${ts}&sig=${sig}`);
