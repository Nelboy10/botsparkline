import { chromium } from "playwright";
import fs from "fs";

export async function getBrowser() {
  console.log("Lancement du navigateur Chrome...");

  const hasStorage = fs.existsSync("storage.json");

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext(
    hasStorage ? { storageState: "storage.json" } : {}
  );

  const page = await context.newPage();

  // Toujours ouvrir Sparklane
  await page.goto("https://predict.sparklane.fr", { timeout: 60000 });

  if (!hasStorage) {
    console.log("Premiere connexion -> login manuel requis");
    console.log("Connecte-toi puis appuie sur ENTER ici.");
    await waitForEnter();

    await context.storageState({ path: "storage.json" });
    console.log("Session sauvegardee dans storage.json");
  } else {
    console.log("Session trouvee -> tentative reconnexion automatique");
    // On vérifie si login encore valide
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      console.log("Session expiree -> reconnecte-toi puis ENTER");
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
