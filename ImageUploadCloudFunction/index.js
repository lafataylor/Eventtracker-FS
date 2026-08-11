const functions = require('firebase-functions')
const admin = require('firebase-admin')
const { Storage } = require('@google-cloud/storage')
const os = require('os')
const path = require('path')
const fs = require('fs')
const axios = require('axios')

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'key.json')
const serviceAccount = require(serviceAccountPath)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'event-images-050423',
})

const storage = new Storage()
const bucketName = 'event-images-050423'

function getImageType(base64String) {
  base64String = base64String.replace(/^data:image\/\w+;base64,/, '')
  const imageType = base64String[0]

  switch (imageType) {
    case '/':
      return 'jpg'
    case 'i':
      return 'png'
    case 'R':
      return 'gif'
    case 'U':
      return 'webp'
    default:
      return 'jpg'
  }
}

exports.uploadImage = functions.https.onRequest(async (req, res) => {
  const { exec_id, user, filename, image, link } = req.body
  if (!exec_id || !user || !filename || !image || !link) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Some arguments are missing!',
    )
  }

  const tempFilePath = path.join(os.tmpdir(), filename)
  const bufferData = new Buffer.from(
    image.replace(/^data:image\/\w+;base64,/, ''),
    'base64',
  )

  // Write the image to a temporary directory
  await fs.promises.writeFile(tempFilePath, bufferData)

  const type = getImageType(image)

  // Upload the image to Firebase Storage
  const bucket = storage.bucket(bucketName)
  const [file] = await bucket.upload(tempFilePath, {
    destination: `${filename}.${type}`,
    metadata: {
      contentType: `image/${type}`,
    },
  })

  // Get the public URL of the uploaded image
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: '03-17-2025',
  })

  // Delete the temporary file
  await fs.promises.unlink(tempFilePath)

  const authUrl = 'http://18.220.2.91/v1/auth/login/'
  const authData = {
    email: 'dummy_@gmail.com',
    password: 'dummy_',
  }
  const authRes = await axios.post(authUrl, authData)

  // Make an HTTP request to update the config
  const configUrl = `http://18.220.2.91/v1/admin/config/`
  const configData = {
    is_complete: false,
    config: {
      executions: {
        [exec_id]: {
          users: {
            [user]: {
              [filename]: {
                image_url: url,
                link: link,
              },
            },
          },
        },
      },
    },
  }
  await axios.put(configUrl, configData, {
    headers: {
      Authorization: authRes.data.jwtToken,
    },
  })

  // Return the public URL of the uploaded image
  res.status(200).send(url)
})
