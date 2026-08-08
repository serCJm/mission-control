'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { imageSize } = require('./index.cjs');

const MAX_INPUT_SIZE = 512 * 1024;
const queue = [];
let concurrency = 100;

function setConcurrency(value) {
  concurrency = value;
}

async function processQueue() {
  const jobs = queue.splice(0, concurrency);
  const promises = jobs.map(async ({ filePath, resolve, reject }) => {
    let handle;
    try {
      handle = await fs.promises.open(path.resolve(filePath), 'r');
    } catch (error) {
      reject(error);
      return;
    }

    try {
      const { size } = await handle.stat();
      if (size <= 0) throw new Error('Empty file');

      const inputSize = Math.min(size, MAX_INPUT_SIZE);
      const input = new Uint8Array(inputSize);
      await handle.read(input, 0, inputSize, 0);
      resolve(imageSize(input));
    } catch (error) {
      reject(error);
    } finally {
      await handle.close();
    }
  });

  await Promise.allSettled(promises);
  if (queue.length) setTimeout(processQueue, 100);
}

function imageSizeFromFile(filePath) {
  return new Promise((resolve, reject) => {
    queue.push({ filePath, resolve, reject });
    processQueue();
  });
}

exports.imageSizeFromFile = imageSizeFromFile;
exports.setConcurrency = setConcurrency;
