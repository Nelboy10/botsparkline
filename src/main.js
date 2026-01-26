import { getBrowser } from "./auth.js";
import { goToTargetList } from "./navigator.js";
import { processCompanies } from "./company.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chargement des sélecteurs
const selectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "selectors.json"), "utf-8")
);

console.log(" Selectors charges :", selectors);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");

// Gestion de l'argument --list "Nom Liste"
const listIndex = args.indexOf("--list");
if (listIndex !== -1 && listIndex + 1 < args.length) {
  const customListName = args[listIndex + 1];
  selectors.targetListName = `text=${customListName}`;
  console.log(` Liste cible definie via argument : "${customListName}"`);
}


(async () => {
  if (!fs.existsSync("screenshots")) fs.mkdirSync("screenshots");

  const { browser, page } = await getBrowser();

  console.log(" Connecte-toi manuellement sur Sparklane puis appuie sur ENTER");
  await new Promise(resolve => process.stdin.once("data", resolve));

  const baseUrl = "https://predict.sparklane.fr";
  const targetListId = "133403";

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });

  await goToTargetList(page, selectors);

  await processCompanies(page, baseUrl, targetListId, dryRun, selectors);

  console.log(" Termine. Le navigateur reste ouvert pour inspection.");
  // await browser.close();

  // Pause pour debug (permet d'utiliser l'inspecteur Playwright ou juste F12)
  console.log(" Script en pause logicielle. Vous pouvez inspecter la page.");
  await new Promise(() => { }); // Pause infinie
})();
