'use strict';

const { typeHandlers, types } = require('./types/index.cjs');

const firstBytes = new Map([
  [0, 'heif'],
  [56, 'psd'],
  [66, 'bmp'],
  [68, 'dds'],
  [71, 'gif'],
  [73, 'tiff'],
  [77, 'tiff'],
  [82, 'webp'],
  [105, 'icns'],
  [137, 'png'],
  [255, 'jpg'],
]);

function detector(input) {
  const type = firstBytes.get(input[0]);
  if (type && typeHandlers.get(type).validate(input)) return type;
  return types.find((candidate) => typeHandlers.get(candidate).validate(input));
}

exports.detector = detector;
