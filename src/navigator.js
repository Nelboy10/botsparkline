export async function goToTargetList(page, selectors) {
  console.log("📍 Étape 1: Cliquer sur 'Listes'...");
  await page.waitForSelector(selectors.menuLists);
  await page.click(selectors.menuLists);

  console.log(" Étape 2: Trouver la liste cible...");
  await page.waitForSelector(selectors.targetListName);
  await page.click(selectors.targetListName);

  console.log(" Étape 3: Attente chargement entreprises...");
  await page.waitForSelector(selectors.companyCard);

  console.log(" Navigation vers la liste réussie !");
}
