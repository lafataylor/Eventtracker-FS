const admin = require('firebase-admin')
const path = require('path')

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'key.json')
const serviceAccount = require(serviceAccountPath)
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'event-images-050423'
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket,
})

const bucket = admin.storage().bucket(storageBucket)

const corsConfig = {
  origins: [
    // 'http://127.0.0.1:3000',
    // 'http://localhost:3000',
    // 'http://18.220.2.91:443',
    '*',
  ],
  methods: ['GET', 'POST', 'PUT'],
  headers: ['Authorization', 'Content-Type'],
  exposedHeaders: ['Authorization'],
  maxAgeSeconds: 3600,
}

const options = {
  origin: '*',
}

bucket
  .setCorsConfiguration([corsConfig, options])
  .then(() => {
    console.log('CORS rules added successfully')
  })
  .catch((err) => {
    console.error('Error adding CORS rules:', err)
  })
