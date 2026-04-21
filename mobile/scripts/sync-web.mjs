import { cp, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mobileRoot = path.resolve(__dirname, "..");
const frontendDist = path.resolve(mobileRoot, "..", "frontend", "dist");
const mobileWww = path.resolve(mobileRoot, "www");

async function ensureFrontendBuildExists() {
  try {
    await access(frontendDist);
  } catch {
    throw new Error(
      "No existe frontend/dist. Ejecuta primero: npm --prefix ../frontend run build"
    );
  }
}

async function syncWebAssets() {
  await ensureFrontendBuildExists();
  await rm(mobileWww, { recursive: true, force: true });
  await mkdir(mobileWww, { recursive: true });
  await cp(frontendDist, mobileWww, { recursive: true });
  console.log("frontend/dist sincronizado en mobile/www");
}

syncWebAssets().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
