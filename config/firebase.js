const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage, getDownloadURL } = require('firebase-admin/storage');

const serviceAccount = require(path.join(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_FILE));

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();

// Uploads a buffer straight to Firebase Storage (no local disk I/O) and returns
// a public download URL, matching what the client SDK's getDownloadURL() gives you.
async function uploadBuffer(buffer, destination, contentType) {
  const file = bucket.file(destination);
  await file.save(buffer, { metadata: { contentType }, resumable: false });
  return getDownloadURL(file);
}

async function deleteFile(destination) {
  await bucket.file(destination).delete({ ignoreNotFound: true });
}

module.exports = { bucket, uploadBuffer, deleteFile };
