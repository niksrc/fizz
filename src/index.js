'use strict';
const micro = require('micro');
const { upload } = require('micro-upload');
const { processAndSave, parseOperations } = require('./lib');

const { send } = micro;

async function handler(req) {
	if (!req.files || !req.files.source) {
		return send(400, 'No Image Present');
	}

	const { source } = req.files;
	const operations = parseOperations(req.body.operations);
	return processAndSave(source, operations);
}

module.exports = micro(upload(handler));
