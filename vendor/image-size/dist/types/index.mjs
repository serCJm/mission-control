import { BMP } from "./bmp.mjs";
import { CUR } from "./cur.mjs";
import { DDS } from "./dds.mjs";
import { GIF } from "./gif.mjs";
import { HEIF } from "./heif.mjs";
import { ICNS } from "./icns.mjs";
import { ICO } from "./ico.mjs";
import { J2C } from "./j2c.mjs";
import { JP2 } from "./jp2.mjs";
import { JPG } from "./jpg.mjs";
import { JXLStream } from "./jxl-stream.mjs";
import { JXL } from "./jxl.mjs";
import { KTX } from "./ktx.mjs";
import { PNG } from "./png.mjs";
import { PNM } from "./pnm.mjs";
import { PSD } from "./psd.mjs";
import { SVG } from "./svg.mjs";
import { TGA } from "./tga.mjs";
import { TIFF } from "./tiff.mjs";
import { WEBP } from "./webp.mjs";

const typeHandlers = new Map([
  ["bmp", BMP],
  ["cur", CUR],
  ["dds", DDS],
  ["gif", GIF],
  ["heif", HEIF],
  ["icns", ICNS],
  ["ico", ICO],
  ["j2c", J2C],
  ["jp2", JP2],
  ["jpg", JPG],
  ["jxl", JXL],
  ["jxl-stream", JXLStream],
  ["ktx", KTX],
  ["png", PNG],
  ["pnm", PNM],
  ["psd", PSD],
  ["svg", SVG],
  ["tga", TGA],
  ["tiff", TIFF],
  ["webp", WEBP],
]);

const types = Array.from(typeHandlers.keys());

export { typeHandlers, types };
