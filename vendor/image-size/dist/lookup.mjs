import { detector } from "./detector.mjs";
import { typeHandlers } from "./types/index.mjs";

const globalOptions = { disabledTypes: [] };

function imageSize(input) {
  const type = detector(input);
  if (typeof type !== "undefined") {
    if (globalOptions.disabledTypes.includes(type)) {
      throw new TypeError(`disabled file type: ${type}`);
    }

    const size = typeHandlers.get(type).calculate(input);
    if (size !== undefined) {
      size.type = size.type ?? type;
      if (size.images && size.images.length > 1) {
        const largestImage = size.images.reduce((largest, current) =>
          current.width * current.height > largest.width * largest.height
            ? current
            : largest,
        );
        size.width = largestImage.width;
        size.height = largestImage.height;
      }
      return size;
    }
  }

  throw new TypeError(`unsupported file type: ${type}`);
}

function disableTypes(types) {
  globalOptions.disabledTypes = types;
}

export { disableTypes, imageSize };
