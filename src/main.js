import { getBrowser } from "./auth.js";
import { goToTargetList } from "./navigator.js";
import { processCompanies } from "./company.js";
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

  console.log(" Connecte-toi manuellement sur Sparklane puis appuie sur ENTER");
  await new Promise(resolve => process.stdin.once("data", resolve));

  const baseUrl = "https://predict.sparklane.fr";
  const targetListId = "133403";

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });

  if (replayMode) {
    // MODE REPLAY
    console.log("!!! MODE REPLAY ACTIVE !!!");
    await replayErrors(page, selectors);
  } else {
    // MODE NORMAL
    await goToTargetList(page, selectors);
    await processCompanies(page, baseUrl, targetListId, dryRun, selectors);
  }

  console.log(" Termine. Le navigateur reste ouvert pour inspection.");
  // ...

  console.log(" Termine. Le navigateur reste ouvert pour inspection.");
  // await browser.close();

  // Pause pour debug (permet d'utiliser l'inspecteur Playwright ou juste F12)
  console.log(" Script en pause logicielle. Vous pouvez inspecter la page.");
  await new Promise(() => { }); // Pause infinie
})();
