// auth.js
// import { chromium } from "playwright"; // <-- REMOVED to avoid pkg snapshot
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createRequire } from 'module';

// Use standard require for pkg trickery
// In bundled CJS (via esbuild), import.meta may be empty
const require = createRequire(typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : `file://${__filename}`);

// Define root directory properly for PKG vs Local
const rootDir = process.pkg ? path.dirname(process.execPath) : process.cwd();

// Dynamic require prevents pkg from bundling 'playwright'
// This forces loading from the external node_modules folder
// 1. Try to load from the explicit external path (for the executable)
const playwrightExternalPath = path.join(rootDir, 'node_modules', 'playwright');
let chromium;

try {
  // Fix: Only use the absolute path hack if we are running inside the PKG executable
  // In local development (npm run gui), we want standard node resolution logic
  if (process.pkg && fs.existsSync(playwrightExternalPath)) {
    console.log(`[PKG] Loading Playwright from external: ${playwrightExternalPath}`);
    ({ chromium } = require(playwrightExternalPath));
  } else {
    // Fallback: Standard resolve (for local dev)
    console.log(`[LOCAL] Loading Playwright via standard resolution...`);
    ({ chromium } = require("playwright"));
  }
} catch (e) {
  console.error(`❌ Critical Error: Impossible de charger Playwright.`);
  console.error(`Path tried: ${playwrightExternalPath}`);
  console.error(`Error details: ${e.message}`);
  throw e;
}

/**
 * Lancement du navigateur Chromium et gestion de session pour Sparklane
 */
export async function getBrowser() {
  console.log("🚀 Vérification du navigateur Chrome...");

  // Définir le chemin local pour les navigateurs
  const browsersPath = path.join(rootDir, "browsers");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  if (!fs.existsSync(browsersPath)) {
    fs.mkdirSync(browsersPath, { recursive: true });
  }

  // Détecte l'exécutable Chromium
  let chromiumExecutable = findChromiumExecutable(browsersPath);

  if (!chromiumExecutable) {
    console.log("⏬ Navigateur non trouvé. Téléchargement en cours (environ 100MB)...");
    try {
      // Installer uniquement chromium dans le dossier local
      // On utilise npx pour installer sans dépendre de l'installation globale
      console.log("...Exécution de playwright install...");
      execSync(`npx playwright install chromium`, {
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
      });
      chromiumExecutable = findChromiumExecutable(browsersPath);
      console.log("✅ Navigateur téléchargé avec succès.");
    } catch (error) {
      console.error("❌ Erreur lors du téléchargement du navigateur :", error.message);
      console.log("Tentative de lancement avec le navigateur système par défaut...");
    }
  } else {
    console.log(`✅ Navigateur trouvé : ${chromiumExecutable}`);
  }

  const storagePath = path.join(rootDir, "storage.json");
  const hasStorage = fs.existsSync(storagePath);

  const browser = await chromium.launch({
    headless: false, // toujours visible pour login manuel
    executablePath: chromiumExecutable
  });

  const context = await browser.newContext(
    hasStorage ? { storageState: storagePath } : {}
  );

  const page = await context.newPage();

  // Toujours ouvrir Sparklane
  await page.goto("https://predict.sparklane.fr", { timeout: 60000 });

  if (!hasStorage) {
    console.log("🔑 Première connexion -> login manuel requis");
    console.log("Connecte-toi puis appuie sur ENTER ici.");
    await waitForEnter();

    await context.storageState({ path: storagePath });
    console.log("💾 Session sauvegardée dans storage.json");
  } else {
    console.log("🔄 Session trouvée -> tentative reconnexion automatique");
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      console.log("❌ Session expirée -> reconnecte-toi puis ENTER");
      await waitForEnter();
      await context.storageState({ path: storagePath });
      console.log("💾 Session mise à jour");
    }
  }

  return { browser, page };
}

/**
 * Fonction d'attente d'ENTER
 */
function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

/**
 * Trouver Chromium local pour exécutable ou pkg
 */
function findChromiumExecutable(browsersPath) {
  if (!fs.existsSync(browsersPath)) return undefined;

  // Chercher récursivement un fichier chrome.exe ou chrome (linux)
  function findFile(dir, name) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const found = findFile(fullPath, name);
        if (found) return found;
      } else if (file === name || file === name + ".exe") {
        return fullPath;
      }
    }
    return null;
  }

  return findFile(browsersPath, "chrome");
}
