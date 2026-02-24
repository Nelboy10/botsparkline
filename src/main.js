import { getBrowser } from "./auth.js";
import { goToTargetList, getTargetListId } from "./navigator.js";
import { processCompanies, processCompaniesGodMode } from "./company.js";
import { interceptToken } from "./api.js";
import { replayErrors } from "./replay.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ... (ESM Init Code) ...
let currentDir;
try {
  currentDir = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  currentDir = __dirname || process.cwd();
}
const __dirname = currentDir;

// Define root directory properly for PKG vs Local
const rootDir = process.pkg ? path.dirname(process.execPath) : process.cwd();

// Chargement des sélecteurs (Priorité : externe > interne)
let selectors;
const externalConfigPath = path.join(rootDir, "config", "selectors.json");
const internalConfigPath = path.join(__dirname, "..", "config", "selectors.json");

if (fs.existsSync(externalConfigPath)) {
  console.log(` Charge configuration externe : ${externalConfigPath}`);
  selectors = JSON.parse(fs.readFileSync(externalConfigPath, "utf-8"));
} else {
  console.log(` Charge configuration interne : ${internalConfigPath}`);
  selectors = JSON.parse(fs.readFileSync(internalConfigPath, "utf-8"));
}

console.log(" Selectors charges :", selectors);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const turbo = args.includes("--turbo");
const godmode = args.includes("--godmode");
const replayMode = args.includes("--replay"); // Detection du mode Replay

// Gestion de l'argument --list "Nom Liste"
const listIndex = args.indexOf("--list");
if (listIndex !== -1 && listIndex + 1 < args.length) {
  const customListName = args[listIndex + 1];
  selectors.targetListName = `text=${customListName}`;
  console.log(` Liste cible definie via argument : "${customListName}"`);
}

(async () => {
  if (!fs.existsSync("screenshots")) fs.mkdirSync("screenshots");

  // En mode replay, on peut vouloir se loguer, ou non si session active. 
  // On garde le flow standard de login pour l'instant.
  const { browser, page } = await getBrowser();

  // getBrowser() gère déjà la connexion/session — pas besoin d'attendre ENTER ici
  const baseUrl = "https://predict.sparklane.fr";

  // Naviguer vers le dashboard si on n'y est pas déjà
  if (!page.url().includes("/dashboard")) {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  }

  if (replayMode) {
    // MODE REPLAY
    console.log("!!! MODE REPLAY ACTIVE !!!");
    // On essaie de deviner le nom de la liste ou on utilise un defaut
    let replayListName = "RECOVERED_CONTACTS";
    if (args.includes("--list")) {
      const idx = args.indexOf("--list");
      if (idx !== -1 && args[idx + 1]) replayListName = args[idx + 1] + "_REPLAY";
    }
    await replayErrors(page, selectors, replayListName);
  } else {
    // MODE NORMAL

    // DETERMINER LE NOM DE LA LISTE
    let listName = "LIST_" + new Date().toISOString().replace(/[:.]/g, "-").split("T")[0]; // Fallback

    // 1. Via Argument CLI
    if (args.includes("--list")) {
      const idx = args.indexOf("--list");
      if (idx !== -1 && args[idx + 1]) {
        listName = args[idx + 1];
      }
    }
    // 2. Via Selectors (si pas d'arg CLI)
    else if (selectors.targetListName && selectors.targetListName.includes("text=")) {
      listName = selectors.targetListName.replace("text=", "").trim();
    }

    // Nettoyage nom pour fichier
    listName = listName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
    console.log(` Liste active : ${listName}`);
    if (turbo) console.log(" MODE TURBO ACTIVE !");
    if (godmode) console.log(" GOD MODE (API) ACTIVE !");

    if (godmode) {
      // Intercepter le Token en arrière-plan
      const token = await interceptToken(page);
      if (!token) {
        console.error("Echec du God Mode : Impossible de récupérer le token d'API.");
        process.exit(1);
      }

      await goToTargetList(page, selectors);
      const listId = await getTargetListId(page);

      if (!listId) {
        console.error("Impossible de trouver l'ID de la liste pour le God Mode.");
      } else {
        await processCompaniesGodMode(page, token, baseUrl, listId, dryRun, listName);
      }
    } else {
      await goToTargetList(page, selectors);
      await processCompanies(page, baseUrl, null, dryRun, selectors, listName, turbo);
    }
  }

  if (godmode) {
    console.log(" Terminé. Fermeture du navigateur (God Mode).");
    await browser.close();
    process.exit(0);
  } else {
    console.log(" Terminé. Le navigateur reste ouvert pour inspection.");
    console.log(" Script en pause logicielle. Vous pouvez inspecter la page.");
    await new Promise(() => { }); // Pause infinie
  }
})();
