import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ANDROID_FILTER = `        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="autobot" android:host="whatsapp-signup" />
        </intent-filter>`;

const IOS_URL_DICT = `\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>com.intelekia.jm.autobot.whatsapp</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>autobot</string>
\t\t\t</array>
\t\t</dict>`;

export function patchAndroidManifest(xml) {
  if (xml.includes('android:scheme="autobot"') && xml.includes('android:host="whatsapp-signup"')) {
    return xml;
  }
  const activityRe = /<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>/;
  const match = xml.match(activityRe);
  if (!match || match.index == null) {
    throw new Error("No se encontró MainActivity en AndroidManifest.xml");
  }
  const insertAt = match.index + match[0].length;
  return `${xml.slice(0, insertAt)}\n${ANDROID_FILTER}${xml.slice(insertAt)}`;
}

export function patchInfoPlist(xml) {
  if (xml.includes("<string>autobot</string>")) return xml;
  if (xml.includes("<key>CFBundleURLTypes</key>")) {
    return xml.replace(
      /<key>CFBundleURLTypes<\/key>\s*<array>/,
      `<key>CFBundleURLTypes</key>\n\t<array>\n${IOS_URL_DICT}`,
    );
  }
  const close = xml.lastIndexOf("</dict>");
  if (close < 0) throw new Error("Info.plist sin dict raíz");
  const block = `\t<key>CFBundleURLTypes</key>\n\t<array>\n${IOS_URL_DICT}\n\t</array>\n`;
  return `${xml.slice(0, close)}${block}${xml.slice(close)}`;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function patchIfPresent(file, patch, label) {
  if (!(await fileExists(file))) {
    console.log(`${label} no existe, se omite el esquema autobot`);
    return;
  }
  const xml = await readFile(file, "utf8");
  const next = patch(xml);
  if (next === xml) {
    console.log(`${label} ya tiene el esquema autobot`);
    return;
  }
  await writeFile(file, next);
  console.log(`${label} actualizado con el esquema autobot`);
}

export async function ensureUrlScheme(root) {
  await patchIfPresent(
    path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"),
    patchAndroidManifest,
    "AndroidManifest.xml",
  );
  await patchIfPresent(
    path.join(root, "ios", "App", "App", "Info.plist"),
    patchInfoPlist,
    "Info.plist",
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  ensureUrlScheme(mobileRoot).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
