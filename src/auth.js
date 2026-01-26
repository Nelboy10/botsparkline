import { chromium } from "playwright";
import fs from "fs";

const IS_RENDER = !!process.env.RENDER;

export async function getBrowser() {
  console.log("Lancement du navigateur Chrome...");

  const hasStorage = fs.existsSync("storage.json");

  if (IS_RENDER && !hasStorage) {
    throw new Error(
      "❌ storage.json manquant en production. Connecte-toi en local et commit le fichier."
    );
  }

  const browser = await chromium.launch({
    headless: IS_RENDER,
    args: IS_RENDER
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : []
  });

  const context = await browser.newContext(
    hasStorage ? { storageState: "storage.json" } : {}
  );

  const page = await context.newPage();

  await page.goto("https://predict.sparklane.fr", { timeout: 60000 });

  // 🔹 MODE LOCAL UNIQUEMENT
  if (!IS_RENDER && !hasStorage) {
    console.log("Première connexion → login manuel requis");
    console.log("Connecte-toi puis appuie sur ENTER ici.");
    await waitForEnter();

    await context.storageState({ path: "storage.json" });
    console.log("Session sauvegardée dans storage.json");
  }

  // 🔹 MODE LOCAL : session expirée
  if (!IS_RENDER && hasStorage) {
    await page.waitForTimeout(3000);
    if (page.url().includes("/login")) {
      console.log("Session expirée → reconnecte-toi puis ENTER");
      await waitForEnter();
      await context.storageState({ path: "storage.json" });
      console.log("Session mise à jour");
    }
  }

  return { browser, page };
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}
