'use strict';
const crypto = require('crypto');
const { S3 } = require('aws-sdk');
const sharp = require('sharp');
const { createError } = require('micro');
const config = require('./config');

const s3 = new S3();

function getBucketPrefix() {
	const date = new Date();
	const year = date.getFullYear();
	const month = Number(date.getMonth()) + 1;
	return `${year}/${month}/`;
}

function getFileName(data) {
	return crypto
		.createHash('sha256')
		.update(data)
		.digest('hex');
}

function parseOperations(operations) {
	if (typeof operations === 'object') {
		return operations;
	}
	try {
		const parsed = JSON.parse(operations);
		return parsed;
	} catch (err) {
		throw createError(400, 'Invalid List Of Operations', err);
	}
}

function getTasks(source, operations) {
	return operations.map(operation => {
		const name = operation.name || {};
		const prefix = name.prefix || '';
		const suffix = name.suffix || '';
		const output = operation.output || {};
		output.format = output.format || source.format;
		const filename = `${prefix}${source.name}${suffix}.${output.format}`;
		return {
			filename,
			sharpOperations: getSharpOperationParams(operation),
		};
	});
}

function getSharpOperationParams({ resize, output: { format, ...formatArgs } }) {
	if (resize.strategy === 'landscape') {
		return {
			resize: [resize.width, null],
			toFormat: [format, formatArgs],
		};
	}
	if (resize.strategy === 'potrait') {
		return {
			resize: [null, resize.height],
			toFormat: [format, formatArgs],
		};
	}
	if (resize.strategy === 'exact') {
		return {
			resize: [resize.width, resize.height],
			toFormat: [format, formatArgs],
		};
	}
	return {};
}

async function processAndSave({ data }, operations) {
	const img = sharp(data);
	const { format, width, height } = await img.metadata();
	const name = getFileName(data);
	const source = { format, width, height, name };
	const bucketPrefix = getBucketPrefix();
	const tasks = getTasks(source, operations);
	const pipeline = sharp();
	const result = tasks.map(async task => {
		let instance = pipeline.clone();
		const operations = Object.entries(task.sharpOperations || {});
		if (operations.length === 0) {
			return null;
		}

		for (const [operation, args] of operations) {
			instance = instance[operation].apply(instance, args);
		}
		if (config.backend === 's3') {
			const buffer = await instance.toBuffer();
			const result = await s3
				.upload({
					Body: buffer,
					Bucket: config.s3Bucket,
					Key: `${bucketPrefix}${task.filename}`,
				})
				.promise();
			const metadata = await sharp(buffer).metadata();
			return {
				url: result.Location.replace('s3.amazonaws.com', config.domain),
				width: metadata.width,
				height: metadata.height,
				format: metadata.format,
				aspectRatio:
					metadata.height > 0 ? Number((metadata.width / metadata.height).toFixed(2)) : 0,
			};
		}
		const result = await instance.toFile(config.storagePath + task.filename);
		return {
			width: result.width,
			height: result.height,
			format: result.format,
			aspectRatio: result.height > 0 ? Number((result.width / result.height).toFixed(2)) : 0,
			url: `${config.domain}/${task.filename}`,
		};
	});
	img.pipe(pipeline);
	const output = await Promise.all(result);
	return output.filter(Boolean);
}

module.exports = {
	processAndSave,
	parseOperations,
};
