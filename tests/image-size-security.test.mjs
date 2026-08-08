import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";

const PATCHED_IMAGE_SIZE_VERSION = "2.0.3-security.0";
const PARSER_INTERFACES = ["esm-buffer", "cjs-buffer", "esm-file", "cjs-file"];
const PARSER_SCRIPT = `
  import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
  import { createRequire } from "node:module";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { imageSize } from "image-size";
  import { imageSizeFromFile } from "image-size/fromFile";

  const require = createRequire(import.meta.url);
  const { imageSize: requireImageSize } = require("image-size");
  const { imageSizeFromFile: requireImageSizeFromFile } = require("image-size/fromFile");
  const parsers = {
    "esm-buffer": imageSize,
    "cjs-buffer": requireImageSize,
    "esm-file": imageSizeFromFile,
    "cjs-file": requireImageSizeFromFile,
  };

  const [parserInterface, encodedInput] = process.argv.slice(1);
  const input = Buffer.from(encodedInput, "base64");
  let temporaryDirectory;
  try {
    let parserInput = input;
    if (parserInterface.endsWith("-file")) {
      temporaryDirectory = mkdtempSync(join(tmpdir(), "image-size-security-"));
      parserInput = join(temporaryDirectory, "malformed-image");
      writeFileSync(parserInput, input);
    }

    await parsers[parserInterface](parserInput);
    process.stderr.write("Expected the malformed image to be rejected");
    process.exitCode = 2;
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : String(error));
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { force: true, recursive: true });
  }
`;

function writeBox(buffer, offset, size, name) {
  buffer.writeUInt32BE(size, offset);
  buffer.write(name, offset + 4, 4, "ascii");
}

function assertRejectedWithoutHang(input, expectedError) {
  for (const parserInterface of PARSER_INTERFACES) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        PARSER_SCRIPT,
        parserInterface,
        input.toString("base64"),
      ],
      { encoding: "utf8", killSignal: "SIGKILL", timeout: 2_000 },
    );

    assert.notEqual(
      result.error?.code,
      "ETIMEDOUT",
      `${parserInterface} parser blocked the child process past the deadline`,
    );
    assert.equal(
      result.status,
      0,
      `${parserInterface}: ${result.stderr || result.error?.message}`,
    );
    assert.match(result.stderr, expectedError, parserInterface);
  }
}

test("vinext resolves the patched image parser", () => {
  const requireFromVinext = createRequire(
    new URL("../node_modules/vinext/package.json", import.meta.url),
  );
  const imageSizeEntry = requireFromVinext.resolve("image-size");
  const packageJsonPath = resolve(dirname(imageSizeEntry), "../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  assert.equal(packageJson.version, PATCHED_IMAGE_SIZE_VERSION);
});

test("rejects an ICNS entry that cannot advance the parser", () => {
  const input = Buffer.alloc(16);
  input.write("icns", 0, 4, "ascii");
  input.writeUInt32BE(input.length, 4);
  input.write("ICON", 8, 4, "ascii");
  input.writeUInt32BE(0, 12);

  assertRejectedWithoutHang(input, /Invalid ICNS entry length/);
});

test("rejects a zero-length HEIF image-property box", () => {
  const input = Buffer.alloc(64);
  writeBox(input, 0, 16, "ftyp");
  input.write("heic", 8, 4, "ascii");
  writeBox(input, 16, 12, "meta");
  writeBox(input, 28, 8, "iprp");
  writeBox(input, 36, 28, "ipco");
  writeBox(input, 44, 0, "ispe");

  assertRejectedWithoutHang(input, /Invalid HEIF, no sizes found/);
});

test("rejects a zero-length JXL partial-codestream box", () => {
  const input = Buffer.alloc(36);
  writeBox(input, 0, 12, "JXL ");
  writeBox(input, 12, 16, "ftyp");
  input.write("jxl ", 20, 4, "ascii");
  writeBox(input, 28, 0, "jxlp");

  assertRejectedWithoutHang(input, /No codestream found/);
});
