import assert from "node:assert/strict";
import test from "node:test";
import { patchAndroidManifest, patchInfoPlist } from "./ensure-url-scheme.mjs";

const androidManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest>
  <application>
    <activity
        android:name=".MainActivity"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
  </application>
</manifest>
`;

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
</dict>
</plist>
`;

test("patchAndroidManifest agrega el esquema autobot una sola vez", () => {
  const once = patchAndroidManifest(androidManifest);
  assert.match(once, /android:scheme="autobot"/);
  assert.match(once, /android:host="whatsapp-signup"/);
  assert.match(once, /android.intent.category.BROWSABLE/);
  assert.equal(patchAndroidManifest(once), once);
});

test("patchInfoPlist agrega CFBundleURLTypes con autobot una sola vez", () => {
  const once = patchInfoPlist(infoPlist);
  assert.match(once, /<key>CFBundleURLTypes<\/key>/);
  assert.match(once, /<string>autobot<\/string>/);
  assert.equal(patchInfoPlist(once), once);
});

test("patchInfoPlist inserta autobot dentro de un CFBundleURLTypes existente", () => {
  const existing = infoPlist.replace(
    "</dict>",
    `<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>existing</string>
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>`,
  );
  const patched = patchInfoPlist(existing);
  assert.match(patched, /<string>existing<\/string>/);
  assert.match(patched, /<string>autobot<\/string>/);
  assert.equal(patched.match(/<key>CFBundleURLTypes<\/key>/g)?.length, 1);
});
