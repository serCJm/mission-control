/** @param {Intl.DateTimeFormatOptions} options */
function formatterByTimeZone(options) {
  /** @type {Map<string, Intl.DateTimeFormat>} */
  const formatters = new Map();
  /** @param {string} timeZone */
  return (timeZone) => {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
      formatters.set(timeZone, formatter);
    }
    return formatter;
  };
}

// Cache the formatter, never the date or UTC offset: one instance still handles
// midnight, daylight-saving transitions, and each caller's requested timezone.
export const dateFormatterForTimeZone = formatterByTimeZone({ year: "numeric", month: "numeric", day: "numeric" });
export const dateTimeFormatterForTimeZone = formatterByTimeZone({
  year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
});
