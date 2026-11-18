import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../pages/admin.js", import.meta.url),
  "utf8"
);

assert.match(source, /ZENORIA_FIX_FILE_PICKER_FOCUS_V1/);
assert.doesNotMatch(source, /onFocusCapture=\{closeSidebarNow\}/);
assert.match(source, /onMouseDownCapture=\{closeSidebarNow\}/);
assert.match(source, /onChange=\{handlePhotoUpload\}/);
assert.match(source, /onChange=\{handleVideoUpload\}/);
assert.match(source, /\{cropRequest\s*&&\s*\(/);
assert.match(source, /<PhotoCropper\b/);
assert.match(source, /\{videoRequest\s*&&\s*<VideoCropper\b/);

console.log("adminFilePickerFocus.test.mjs : OK");
