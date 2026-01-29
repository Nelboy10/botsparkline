var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/auth.js
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_child_process = require("child_process");
var import_module = require("module");
var import_meta = {};
var require2 = (0, import_module.createRequire)(typeof import_meta !== "undefined" && import_meta.url ? import_meta.url : `file://${__filename}`);
var rootDir = process.pkg ? import_path.default.dirname(process.execPath) : process.cwd();
var playwrightExternalPath = import_path.default.join(rootDir, "node_modules", "playwright");
var chromium;
try {
  if (process.pkg && import_fs.default.existsSync(playwrightExternalPath)) {
    console.log(`[PKG] Loading Playwright from external: ${playwrightExternalPath}`);
    ({ chromium } = require2(playwrightExternalPath));
  } else {
    console.log(`[LOCAL] Loading Playwright via standard resolution...`);
    ({ chromium } = require2("playwright"));
  }
} catch (e) {
  console.error(`\u274C Critical Error: Impossible de charger Playwright.`);
  console.error(`Path tried: ${playwrightExternalPath}`);
  console.error(`Error details: ${e.message}`);
  throw e;
}
async function getBrowser() {
  console.log("\u{1F680} V\xE9rification du navigateur Chrome...");
  const browsersPath = import_path.default.join(rootDir, "browsers");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  if (!import_fs.default.existsSync(browsersPath)) {
    import_fs.default.mkdirSync(browsersPath, { recursive: true });
  }
  let chromiumExecutable = findChromiumExecutable(browsersPath);
  if (!chromiumExecutable) {
    console.log("\u23EC Navigateur non trouv\xE9. T\xE9l\xE9chargement en cours (environ 100MB)...");
    try {
      console.log("...Ex\xE9cution de playwright install...");
      (0, import_child_process.execSync)(`npx playwright install chromium`, {
        stdio: "inherit",
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
      });
      chromiumExecutable = findChromiumExecutable(browsersPath);
      console.log("\u2705 Navigateur t\xE9l\xE9charg\xE9 avec succ\xE8s.");
    } catch (error) {
      console.error("\u274C Erreur lors du t\xE9l\xE9chargement du navigateur :", error.message);
      console.log("Tentative de lancement avec le navigateur syst\xE8me par d\xE9faut...");
    }
  } else {
    console.log(`\u2705 Navigateur trouv\xE9 : ${chromiumExecutable}`);
  }
  const storagePath = import_path.default.join(rootDir, "storage.json");
  const hasStorage = import_fs.default.existsSync(storagePath);
  const browser = await chromium.launch({
    headless: false,
    // toujours visible pour login manuel
    executablePath: chromiumExecutable
  });
  const context = await browser.newContext(
    hasStorage ? { storageState: storagePath } : {}
  );
  const page = await context.newPage();
  await page.goto("https://predict.sparklane.fr", { timeout: 6e4 });
  if (!hasStorage) {
    console.log("\u{1F511} Premi\xE8re connexion -> login manuel requis");
    console.log("Connecte-toi puis appuie sur ENTER ici.");
    await waitForEnter();
    await context.storageState({ path: storagePath });
    console.log("\u{1F4BE} Session sauvegard\xE9e dans storage.json");
  } else {
    console.log("\u{1F504} Session trouv\xE9e -> tentative reconnexion automatique");
    await page.waitForTimeout(3e3);
    if (page.url().includes("/login")) {
      console.log("\u274C Session expir\xE9e -> reconnecte-toi puis ENTER");
      await waitForEnter();
      await context.storageState({ path: storagePath });
      console.log("\u{1F4BE} Session mise \xE0 jour");
    }
  }
  return { browser, page };
}
function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}
function findChromiumExecutable(browsersPath) {
  if (!import_fs.default.existsSync(browsersPath)) return void 0;
  function findFile(dir, name) {
    const files = import_fs.default.readdirSync(dir);
    for (const file of files) {
      const fullPath = import_path.default.join(dir, file);
      if (import_fs.default.statSync(fullPath).isDirectory()) {
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

// src/navigator.js
async function goToTargetList(page, selectors2) {
  console.log("\u{1F4CD} \xC9tape 1: Cliquer sur 'Listes'...");
  await page.waitForSelector(selectors2.menuLists);
  await page.click(selectors2.menuLists);
  console.log(" \xC9tape 2: Trouver la liste cible...");
  await page.waitForSelector(selectors2.targetListName);
  await page.click(selectors2.targetListName);
  console.log(" \xC9tape 3: Attente chargement entreprises...");
  await page.waitForSelector(selectors2.companyCard);
  console.log(" Navigation vers la liste r\xE9ussie !");
}

// src/company.js
var import_fs2 = __toESM(require("fs"), 1);
var waitRandom = (min, max) => new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
async function processCompanies(page, baseUrl, targetListId, dryRun2 = false, selectors2) {
  console.log("ETAPE 4 : EXTRACTION MASSIVE (SCROLL CIBLE + ANTI-BAN)");
  const csvFile = "contacts.csv";
  if (!import_fs2.default.existsSync(csvFile)) {
    import_fs2.default.writeFileSync(csvFile, "Entreprise,Telephone,Adresse,Nom Contact 1,Titre Contact 1,Nom Contact 2,Titre Contact 2,Nom Contact 3,Titre Contact 3,Nom Contact 4,Titre Contact 4,Nom Contact 5,Titre Contact 5\n");
  }
  const processedNames = /* @__PURE__ */ new Set();
  let totalProcessed = 0;
  let noNewItemsIter = 0;
  let hasMore = true;
  if (import_fs2.default.existsSync(csvFile)) {
    console.log("\u{1F4C2} Lecture du fichier CSV existant pour reprise...");
    const content = import_fs2.default.readFileSync(csvFile, "utf-8");
    const lines = content.split("\n");
    let dbCount = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(",");
      if (cols.length > 0) {
        let name = cols[0].trim();
        if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
        if (name && name !== "Entreprise") {
          processedNames.add(name);
          dbCount++;
        }
      }
    }
    console.log(`\u2705 Reprise : ${dbCount} entreprises d\xE9j\xE0 ignor\xE9es car pr\xE9sentes dans le CSV.`);
  }
  while (hasMore) {
    const currentCards = await page.locator(selectors2.companyCard).all();
    const currentCount = currentCards.length;
    console.log(`Cartes visibles: ${currentCount} (Total trait\xE9 session: ${totalProcessed} | Global: ${processedNames.size})`);
    let newlyProcessed = 0;
    for (let i = 0; i < currentCount; i++) {
      if (dryRun2 && totalProcessed >= 10) {
        hasMore = false;
        break;
      }
      try {
        const card = currentCards[i];
        const nameEl = card.locator(selectors2.companyName).first();
        const rawName = await nameEl.textContent().catch(() => "");
        let safeID = rawName.trim();
        safeID = safeID.replace(/,/g, " ").replace(/\n/g, " ");
        if (!safeID || processedNames.has(safeID)) continue;
        await card.scrollIntoViewIfNeeded();
        await waitRandom(300, 800);
        const listName = (await nameEl.innerText()).trim();
        let phone = "N/A";
        try {
          const pEl = card.locator(selectors2.companyPhoneLabel).first();
          if (await pEl.count() > 0) phone = (await pEl.innerText()).replace(/[\n\r]+/g, " ").trim();
        } catch (e) {
        }
        if (phone === "N/A" || phone.length < 5) {
          const t = await card.innerText().catch(() => "");
          const m = t.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
          if (m) phone = m[0];
        }
        let address = "N/A";
        try {
          const aEl = card.locator(selectors2.companyAddress).first();
          if (await aEl.count() > 0) address = (await aEl.innerText()).replace(/[\n\r]+/g, " ").trim();
        } catch (e) {
        }
        let targetPage = null;
        let isNewTab = false;
        let profileUrl = null;
        try {
          const tagName = await nameEl.evaluate((el) => el.tagName.toLowerCase());
          if (tagName === "a") profileUrl = await nameEl.getAttribute("href");
          else {
            const pl = nameEl.locator("xpath=ancestor::a").first();
            if (await pl.count() > 0) profileUrl = await pl.getAttribute("href");
          }
        } catch (e) {
        }
        if (profileUrl) {
          const targetUrl = profileUrl.includes("#") ? profileUrl : profileUrl + "#contacts";
          targetPage = await page.context().newPage();
          await targetPage.goto(targetUrl);
          isNewTab = true;
          await waitRandom(1e3, 2e3);
        } else {
          try {
            const [newPage] = await Promise.all([
              page.context().waitForEvent("page", { timeout: 1e4 }),
              // Augmenté 5s->10s
              nameEl.click()
            ]);
            targetPage = newPage;
            await targetPage.waitForLoadState("domcontentloaded");
            if (!targetPage.url().includes("contacts")) await targetPage.goto(targetPage.url() + "#contacts");
            isNewTab = true;
            await waitRandom(1500, 2500);
          } catch (e) {
            console.log("   -> Echec ouverture onglet (clic), on ignore.");
          }
        }
        let contacts = [];
        if (targetPage) {
          try {
            contacts = await extractContacts(targetPage, selectors2);
            await targetPage.close();
            await page.bringToFront();
          } catch (e) {
            console.log("   -> Erreur page d\xE9tail: " + e.message);
            logError({
              name: listName,
              url: profileUrl,
              reason: "Extraction Failed: " + e.message
            });
            if (isNewTab) await targetPage.close().catch(() => {
            });
            await page.bringToFront();
          }
        }
        const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");
        let line = `${safeCSV(listName)},${safeCSV(phone)},${safeCSV(address)}`;
        for (let k = 0; k < 5; k++) {
          if (k < contacts.length) {
            line += `,${safeCSV(contacts[k].name)},${safeCSV(contacts[k].title)}`;
          } else {
            line += `,N/A,N/A`;
          }
        }
        line += "\n";
        import_fs2.default.appendFileSync(csvFile, line);
        processedNames.add(safeID);
        totalProcessed++;
        newlyProcessed++;
        console.log(`   -> OK (${contacts.length} contacts) : ${listName}`);
        console.log("   -> Pause humaine...");
        await waitRandom(1500, 3500);
      } catch (err) {
        console.error(`Erreur item ${i}`, err.message);
        const nameEl = currentCards[i]?.locator(selectors2.companyName).first();
        const rawName = await nameEl?.innerText().catch(() => "Unknown") || "Unknown";
        logError({
          name: rawName,
          url: null,
          reason: "Item Loop Failed: " + err.message
        });
      }
    }
    if (!hasMore) break;
    console.log(`Scroll (Batch +${newlyProcessed})...`);
    const lastCard = currentCards[currentCards.length - 1];
    let scrollContainerHandle = null;
    if (lastCard) {
      try {
        scrollContainerHandle = await lastCard.evaluateHandle((el) => {
          let p = el.parentElement;
          while (p) {
            const style = window.getComputedStyle(p);
            if ((style.overflowY === "auto" || style.overflowY === "scroll") && p.scrollHeight > p.clientHeight) {
              return p;
            }
            p = p.parentElement;
          }
          return null;
        });
      } catch (e) {
      }
    }
    const scrollElement = scrollContainerHandle ? scrollContainerHandle.asElement() : null;
    if (scrollElement) {
      try {
        await scrollElement.evaluate((el) => el.scrollTop += 600);
        if (lastCard) await lastCard.focus().catch(() => {
        });
        const box = await lastCard.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, 800);
        }
        await page.keyboard.press("PageDown");
      } catch (e) {
        console.log("   -> Warning scroll container: " + e.message);
      }
    } else {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.keyboard.press("PageDown");
    }
    const previousLastText = await lastCard?.innerText().catch(() => "") || "";
    try {
      await page.waitForFunction((args2) => {
        const [selector, prevText] = args2;
        const all = document.querySelectorAll(selector);
        if (all.length === 0) return false;
        const currentLast = all[all.length - 1].innerText;
        return currentLast !== prevText;
      }, [selectors2.companyCard, previousLastText], { timeout: 15e3 });
      if (noNewItemsIter > 0) console.log("   -> Reprise detectee !");
      noNewItemsIter = 0;
    } catch (e) {
      console.log(`   -> Rien de nouveau (${noNewItemsIter + 1}/10).`);
      noNewItemsIter++;
      if (noNewItemsIter >= 3 && scrollContainer) {
        console.log("   -> Tentative de deblocage (Shake scroll)...");
        try {
          await page.mouse.wheel(0, -400);
          await page.waitForTimeout(300);
          await page.mouse.wheel(0, 800);
        } catch (ex) {
        }
      }
    }
    if (noNewItemsIter >= 10) {
      console.log("Fin de liste confirmee (10 essais sans changement).");
      hasMore = false;
    }
    await page.waitForTimeout(1e3);
  }
  console.log("TERMINE.");
}
async function extractContacts(targetPage, selectors2) {
  let contacts = [];
  try {
    await targetPage.waitForSelector("h1", { timeout: 1e4 }).catch(() => {
    });
    const contactTab = targetPage.locator(".ant-tabs-tab, div[role='tab']").filter({ hasText: /^Contacts/i }).first();
    if (await contactTab.count() > 0 && await contactTab.isVisible()) {
      if (await targetPage.locator(selectors2.contactRow).count() === 0) {
        await contactTab.click();
        await targetPage.waitForTimeout(2e3);
      }
    }
    const rows = await targetPage.locator(selectors2.contactRow).all();
    for (const row of rows) {
      if (await row.isVisible()) {
        let cName = "N/A";
        let cTitle = "N/A";
        try {
          cName = (await row.locator(selectors2.contactName).first().innerText()).trim();
        } catch (e) {
        }
        try {
          cTitle = (await row.locator(selectors2.contactTitle).first().innerText()).trim();
        } catch (e) {
        }
        if (cName !== "N/A" && contacts.length < 5) contacts.push({ name: cName, title: cTitle });
      }
    }
    if (contacts.length === 0) {
      const content = await targetPage.innerText("body");
      const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      for (let k = 0; k < lines.length; k++) {
        if (/^(?:M\.|Mme)\s+/.test(lines[k])) {
          contacts.push({ name: lines[k], title: "N/A" });
          if (contacts.length >= 5) break;
        }
      }
    }
  } catch (e) {
    console.error("Erreur detailed extraction:", e.message);
    throw e;
  }
  return contacts;
}
function logError(errorData) {
  try {
    const errorFile = "errors.json";
    let errors = [];
    if (import_fs2.default.existsSync(errorFile)) {
      try {
        errors = JSON.parse(import_fs2.default.readFileSync(errorFile, "utf-8"));
      } catch (e) {
      }
    }
    if (!errors.find((e) => e.url === errorData.url && e.name === errorData.name)) {
      errors.push({ ...errorData, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      import_fs2.default.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
    }
  } catch (e) {
    console.error("Impossible d'\xE9crire dans errors.json", e);
  }
}

// src/replay.js
var import_fs3 = __toESM(require("fs"), 1);
var waitRandom2 = (min, max) => new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
async function replayErrors(page, selectors2) {
  console.log("ETAPE 5 : REPLAY DES ERREURS (MODE RATTRAPAGE)");
  const errorFile = "errors.json";
  const csvFile = "contacts.csv";
  if (!import_fs3.default.existsSync(errorFile)) {
    console.log("Aucun fichier errors.json trouv\xE9. Rien \xE0 rejouer.");
    return;
  }
  const errors = JSON.parse(import_fs3.default.readFileSync(errorFile, "utf-8"));
  console.log(`${errors.length} erreurs trouv\xE9es \xE0 rejouer.`);
  const recoverableCtx = errors.filter((e) => e.url && e.url.startsWith("http"));
  console.log(`${recoverableCtx.length} erreurs avec URL r\xE9cup\xE9rables.`);
  let newlySuccess = 0;
  const remainingErrors = [];
  for (const item of errors) {
    if (!item.url || !item.url.startsWith("http")) {
      console.log(`[SKIP] ${item.name} (Pas d'URL valide)`);
      remainingErrors.push(item);
      continue;
    }
    console.log(`[RETRY] ${item.name} (${item.url})...`);
    try {
      await page.goto(item.url);
      await page.waitForLoadState("domcontentloaded");
      await waitRandom2(1e3, 2e3);
      const contacts = await extractContacts(page, selectors2);
      if (contacts.length > 0) {
        const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");
        let phone = "N/A";
        try {
          const bodyText = await page.innerText("body");
          const m = bodyText.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
          if (m) phone = m[0];
        } catch (e) {
        }
        let line = `${safeCSV(item.name)},${safeCSV(phone)},N/A`;
        for (let k = 0; k < 5; k++) {
          if (k < contacts.length) {
            line += `,${safeCSV(contacts[k].name)},${safeCSV(contacts[k].title)}`;
          } else {
            line += `,N/A,N/A`;
          }
        }
        line += "\n";
        import_fs3.default.appendFileSync(csvFile, line);
        console.log(`   -> SUCCES REPLAY (${contacts.length} contacts)`);
        newlySuccess++;
      } else {
        console.log("   -> ECHEC REPLAY (0 contacts trouv\xE9s)");
        remainingErrors.push(item);
      }
    } catch (e) {
      console.log(`   -> CRASH REPLAY: ${e.message}`);
      remainingErrors.push(item);
    }
    await waitRandom2(1e3, 2e3);
  }
  import_fs3.default.writeFileSync(errorFile, JSON.stringify(remainingErrors, null, 2));
  console.log(`FIN DU REPLAY. ${newlySuccess} r\xE9cup\xE9r\xE9s. ${remainingErrors.length} restants.`);
}

// src/main.js
var import_fs4 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_url = require("url");
var import_meta2 = {};
var currentDir;
try {
  currentDir = import_path2.default.dirname((0, import_url.fileURLToPath)(import_meta2.url));
} catch (e) {
  currentDir = __dirname || process.cwd();
}
var __dirname = currentDir;
var rootDir2 = process.pkg ? import_path2.default.dirname(process.execPath) : process.cwd();
var selectors;
var externalConfigPath = import_path2.default.join(rootDir2, "config", "selectors.json");
var internalConfigPath = import_path2.default.join(__dirname, "..", "config", "selectors.json");
if (import_fs4.default.existsSync(externalConfigPath)) {
  console.log(` Charge configuration externe : ${externalConfigPath}`);
  selectors = JSON.parse(import_fs4.default.readFileSync(externalConfigPath, "utf-8"));
} else {
  console.log(` Charge configuration interne : ${internalConfigPath}`);
  selectors = JSON.parse(import_fs4.default.readFileSync(internalConfigPath, "utf-8"));
}
console.log(" Selectors charges :", selectors);
var args = process.argv.slice(2);
var dryRun = args.includes("--dry");
var replayMode = args.includes("--replay");
var listIndex = args.indexOf("--list");
if (listIndex !== -1 && listIndex + 1 < args.length) {
  const customListName = args[listIndex + 1];
  selectors.targetListName = `text=${customListName}`;
  console.log(` Liste cible definie via argument : "${customListName}"`);
}
(async () => {
  if (!import_fs4.default.existsSync("screenshots")) import_fs4.default.mkdirSync("screenshots");
  const { browser, page } = await getBrowser();
  console.log(" Connecte-toi manuellement sur Sparklane puis appuie sur ENTER");
  await new Promise((resolve) => process.stdin.once("data", resolve));
  const baseUrl = "https://predict.sparklane.fr";
  const targetListId = "133403";
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  if (replayMode) {
    console.log("!!! MODE REPLAY ACTIVE !!!");
    await replayErrors(page, selectors);
  } else {
    await goToTargetList(page, selectors);
    await processCompanies(page, baseUrl, targetListId, dryRun, selectors);
  }
  console.log(" Termine. Le navigateur reste ouvert pour inspection.");
  console.log(" Termine. Le navigateur reste ouvert pour inspection.");
  console.log(" Script en pause logicielle. Vous pouvez inspecter la page.");
  await new Promise(() => {
  });
})();
