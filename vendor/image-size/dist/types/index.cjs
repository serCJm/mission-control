'use strict';

const { BMP } = require('./bmp.cjs');
const { CUR } = require('./cur.cjs');
const { DDS } = require('./dds.cjs');
const { GIF } = require('./gif.cjs');
const { HEIF } = require('./heif.cjs');
const { ICNS } = require('./icns.cjs');
const { ICO } = require('./ico.cjs');
const { J2C } = require('./j2c.cjs');
const { JP2 } = require('./jp2.cjs');
const { JPG } = require('./jpg.cjs');
const { JXLStream } = require('./jxl-stream.cjs');
const { JXL } = require('./jxl.cjs');
const { KTX } = require('./ktx.cjs');
const { PNG } = require('./png.cjs');
const { PNM } = require('./pnm.cjs');
const { PSD } = require('./psd.cjs');
const { SVG } = require('./svg.cjs');
const { TGA } = require('./tga.cjs');
const { TIFF } = require('./tiff.cjs');
const { WEBP } = require('./webp.cjs');

const typeHandlers = new Map([
  ['bmp', BMP],
  ['cur', CUR],
  ['dds', DDS],
  ['gif', GIF],
  ['heif', HEIF],
  ['icns', ICNS],
  ['ico', ICO],
  ['j2c', J2C],
  ['jp2', JP2],
  ['jpg', JPG],
  ['jxl', JXL],
  ['jxl-stream', JXLStream],
  ['ktx', KTX],
  ['png', PNG],
  ['pnm', PNM],
  ['psd', PSD],
  ['svg', SVG],
  ['tga', TGA],
  ['tiff', TIFF],
  ['webp', WEBP],
]);

const types = Array.from(typeHandlers.keys());

exports.typeHandlers = typeHandlers;
exports.types = types;
