export async function goToTargetList(page, selectors) {
  console.log("📍 Étape 1: Cliquer sur 'Listes'...");
  await page.waitForSelector(selectors.menuLists, { timeout: 15000 });
  await page.click(selectors.menuLists);

  console.log("📋 Étape 2: Trouver la liste cible...");
  try {
    // Attendre que le menu des listes soit visible (peut prendre un peu de temps)
    await page.waitForSelector(selectors.targetListName, { timeout: 15000 });
    await page.click(selectors.targetListName);
  } catch (e) {
    // Si le sélecteur text= ne fonctionne pas, on essaie via locator
    const listName = selectors.targetListName.replace("text=", "").trim();
    console.log(`   -> Sélecteur direct échoué, recherche par texte: "${listName}"`);
    const listEl = page.getByText(listName, { exact: true }).first();
    await listEl.waitFor({ timeout: 10000 });
    await listEl.click();
  }

  console.log("⏳ Étape 3: Attente chargement des entreprises...");
  try {
    await page.waitForSelector(selectors.companyCard, { timeout: 20000 });
    console.log("✅ Navigation vers la liste réussie !");
  } catch (e) {
    console.error("❌ Timeout : aucune carte entreprise détectée. Vérifie le sélecteur companyCard :", selectors.companyCard);
    throw e;
  }
}

export async function getTargetListId(page) {
  console.log("🔍 Récupération de l'ID de la liste pour l'API...");
  // Attendre que l'URL soit bien mise à jour avec l'ID de la liste
  await page.waitForTimeout(2000);
  const url = page.url();
  // Ex: https://predict.sparklane.fr/companies-list/133403
  const match = url.match(/\/companies-list\/(\d+)/);
  if (match && match[1]) {
    console.log(`✅ ID de la liste trouvé : ${match[1]}`);
    return match[1];
  }

  // Fallback: chercher dans le DOM si l'URL ne l'a pas
  try {
    const urlParams = new URL(url).searchParams;
    if (urlParams.has('targetListId')) return urlParams.get('targetListId');
  } catch (e) { }

  return null;
}
