const { format } = require('sharp');

module.exports = {
	supportedFormats: Object.keys(format),
	s3Bucket: process.env.S3_BUCKET,
	domain: process.env.DOMAIN,
	storagePath: process.env.STORAGE_PATH || '/tmp/',
	backend: process.env.BACKEND || 'file',
};
