export function openDateInputPicker(input) {
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  } catch {
    input.focus();
    input.click();
  }
}
