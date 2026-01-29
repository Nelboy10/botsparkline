import fs from 'fs';

const waitRandom = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

export async function processCompanies(page, baseUrl, targetListId, dryRun = false, selectors) {
  console.log("ETAPE 4 : EXTRACTION MASSIVE (SCROLL CIBLE + ANTI-BAN)");

  const csvFile = "contacts.csv";
  if (!fs.existsSync(csvFile)) {
    fs.writeFileSync(csvFile, "Entreprise,Telephone,Adresse,Nom Contact 1,Titre Contact 1,Nom Contact 2,Titre Contact 2,Nom Contact 3,Titre Contact 3,Nom Contact 4,Titre Contact 4,Nom Contact 5,Titre Contact 5\n");
  }


  const processedNames = new Set();
  let totalProcessed = 0;
  let noNewItemsIter = 0;
  let hasMore = true;

  // CHARGEMENT DE LA REPRISE SUR ERREUR
  if (fs.existsSync(csvFile)) {
    console.log("📂 Lecture du fichier CSV existant pour reprise...");
    const content = fs.readFileSync(csvFile, 'utf-8');
    const lines = content.split('\n');
    let dbCount = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      // Format: "Entreprise,..."
      // On extrait le nom de l'entreprise (1ère colonne)
      // Attention aux guillemets si le nom contient une virgule
      // Simplification: on prend tout jusqu'à la première virgule
      // Le code plus bas utilise safeCSV qui supprime les virgules dans le nom, donc split(',') est safe pour la 1ère colonne si pas de quote complexe
      const cols = line.split(',');
      if (cols.length > 0) {
        let name = cols[0].trim();
        // Nettoyage potentiel si quotes
        if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
        if (name && name !== "Entreprise") {
          processedNames.add(name);
          dbCount++;
        }
      }
    }
    console.log(`✅ Reprise : ${dbCount} entreprises déjà ignorées car présentes dans le CSV.`);
  }

  while (hasMore) {
    // Optimisation: Au lieu de tout recharger, on pourrait juste chercher les nouveaux, mais Playwright gère mal ça.
    // On va continuer de recharger tout, mais on filtre VITE.
    const currentCards = await page.locator(selectors.companyCard).all();
    const currentCount = currentCards.length;
    console.log(`Cartes visibles: ${currentCount} (Total traité session: ${totalProcessed} | Global: ${processedNames.size})`);

    let newlyProcessed = 0;

    // On parcourt tout, mais on skip très vite ce qui est connu
    for (let i = 0; i < currentCount; i++) {
      // En dryRun, on s'arrête vite
      if (dryRun && totalProcessed >= 10) { hasMore = false; break; }

      try {
        const card = currentCards[i];
        const nameEl = card.locator(selectors.companyName).first();
        // Texte brut pour ID (rapide)
        const rawName = await nameEl.textContent().catch(() => "");
        let safeID = rawName.trim();
        // Nettoyage pour matcher le CSV (safeCSV remplace , par espace)
        // Mais safeID ici doit correspondre à ce qu'on a stocké. 
        // L'idéal est de ne pas transformer l'ID pour le Set, mais lors de l'écriture CSV on transforme.
        // Si on reprend depuis CSV, le nom dans le CSV a les virgules remplacées.
        // Donc on doit appliquer la même transformation ici pour comparer.
        safeID = safeID.replace(/,/g, " ").replace(/\n/g, " ");

        if (!safeID || processedNames.has(safeID)) continue;

        // C'est un nouveau !
        await card.scrollIntoViewIfNeeded();
        // Petite attente pour simuler lecture
        await waitRandom(300, 800);

        const listName = (await nameEl.innerText()).trim();

        // Récupération Téléphone
        let phone = "N/A";
        try {
          const pEl = card.locator(selectors.companyPhoneLabel).first();
          if (await pEl.count() > 0) phone = (await pEl.innerText()).replace(/[\n\r]+/g, ' ').trim();
        } catch (e) { }
        if (phone === "N/A" || phone.length < 5) {
          // Fallback: cherche pattern tel dans texte carte
          const t = await card.innerText().catch(() => "");
          const m = t.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
          if (m) phone = m[0];
        }

        // Récupération Adresse
        let address = "N/A";
        try {
          const aEl = card.locator(selectors.companyAddress).first();
          if (await aEl.count() > 0) address = (await aEl.innerText()).replace(/[\n\r]+/g, ' ').trim();
        } catch (e) { }

        // Navigation (Nouvel onglet ou clic)
        let targetPage = null;
        let isNewTab = false;
        let profileUrl = null;
        try {
          const tagName = await nameEl.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'a') profileUrl = await nameEl.getAttribute('href');
          else {
            const pl = nameEl.locator('xpath=ancestor::a').first();
            if (await pl.count() > 0) profileUrl = await pl.getAttribute('href');
          }
        } catch (e) { }

        if (profileUrl) {
          const targetUrl = profileUrl.includes('#') ? profileUrl : profileUrl + "#contacts";
          targetPage = await page.context().newPage();
          await targetPage.goto(targetUrl);
          isNewTab = true;
          await waitRandom(1000, 2000);
        } else {
          try {
            const [newPage] = await Promise.all([
              page.context().waitForEvent('page', { timeout: 10000 }), // Augmenté 5s->10s
              nameEl.click()
            ]);
            targetPage = newPage;

            await targetPage.waitForLoadState('domcontentloaded');
            if (!targetPage.url().includes("contacts")) await targetPage.goto(targetPage.url() + "#contacts");
            isNewTab = true;
            await waitRandom(1500, 2500);
          } catch (e) {
            console.log("   -> Echec ouverture onglet (clic), on ignore.");
          }
        }

        // Extraction Contacts
        let contacts = [];
        if (targetPage) {
          try {
            contacts = await extractContacts(targetPage, selectors);

            await targetPage.close();
            await page.bringToFront();
          } catch (e) {
            console.log("   -> Erreur page détail: " + e.message);

            // LOG ERREUR POUR REPLAY
            logError({
              name: listName,
              url: profileUrl,
              reason: "Extraction Failed: " + e.message
            });

            if (isNewTab) await targetPage.close().catch(() => { });
            await page.bringToFront();
          }
        }

        // Ecriture CSV
        const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");
        // Note: listName contient le nom brut nettoyé.
        // safeID était aussi listName.trim() avec replace virgules

        let line = `${safeCSV(listName)},${safeCSV(phone)},${safeCSV(address)}`;
        for (let k = 0; k < 5; k++) {
          if (k < contacts.length) {
            line += `,${safeCSV(contacts[k].name)},${safeCSV(contacts[k].title)}`;
          } else {
            line += `,N/A,N/A`;
          }
        }
        line += "\n";

        fs.appendFileSync(csvFile, line);
        // Ajout au set de mémoire (version safeID qui correspond au CSV nettoyé)
        processedNames.add(safeID);

        totalProcessed++;
        newlyProcessed++;
        console.log(`   -> OK (${contacts.length} contacts) : ${listName}`);

        console.log("   -> Pause humaine...");
        await waitRandom(1500, 3500);

      } catch (err) {
        console.error(`Erreur item ${i}`, err.message);
        // Log erreur globale item
        const nameEl = currentCards[i]?.locator(selectors.companyName).first();
        const rawName = await nameEl?.innerText().catch(() => "Unknown") || "Unknown";
        logError({
          name: rawName,
          url: null,
          reason: "Item Loop Failed: " + err.message
        });
      }
    } // Fin for

    if (!hasMore) break;

    console.log(`Scroll (Batch +${newlyProcessed})...`);

    // --- NOUVELLE LOGIQUE DE SCROLL AMÉLIORÉE ---
    const lastCard = currentCards[currentCards.length - 1];
    let scrollContainerHandle = null;

    if (lastCard) {
      try {
        // Tentative de trouver le conteneur précis
        scrollContainerHandle = await lastCard.evaluateHandle(el => {
          let p = el.parentElement;
          while (p) {
            const style = window.getComputedStyle(p);
            // On cherche un élément avec overflow qui a du contenu à scroller
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
              return p;
            }
            p = p.parentElement;
          }
          return null;
        });
      } catch (e) { }
    }

    const scrollElement = scrollContainerHandle ? scrollContainerHandle.asElement() : null;

    if (scrollElement) {
      try {
        // 1. Scroll JS pur pour avancer
        await scrollElement.evaluate(el => el.scrollTop += 600);

        // 2. Focus et actions "humaines" pour déclencher les events du Virtual List
        if (lastCard) await lastCard.focus().catch(() => { });

        const box = await lastCard.boundingBox();
        if (box) {
          // Bouger la souris au centre du dernier élément
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          // Scroll molette bas
          await page.mouse.wheel(0, 800);
        }

        // 3. Clavier (PageDown)
        await page.keyboard.press('PageDown');

      } catch (e) {
        console.log("   -> Warning scroll container: " + e.message);
      }
    } else {
      // Fallback global si pas de conteneur trouvé
      // console.log("   -> Scroll fallback (Window)...");
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.keyboard.press('PageDown');
    }

    // --- DETECTION INTELLIGENTE ---
    const previousLastText = await lastCard?.innerText().catch(() => "") || "";

    try {
      // On attend qu'un NOUVEAU dernier élément soit différent du précédent
      await page.waitForFunction((args) => {
        const [selector, prevText] = args;
        const all = document.querySelectorAll(selector);
        if (all.length === 0) return false;
        const currentLast = all[all.length - 1].innerText;
        return currentLast !== prevText;
      }, [selectors.companyCard, previousLastText], { timeout: 15000 }); // 15s d'attente

      if (noNewItemsIter > 0) console.log("   -> Reprise detectee !");
      noNewItemsIter = 0;
    } catch (e) {
      console.log(`   -> Rien de nouveau (${noNewItemsIter + 1}/10).`);
      noNewItemsIter++;

      // Stratégie de déblocage "Shake"
      if (noNewItemsIter >= 3 && scrollContainer) {
        console.log("   -> Tentative de deblocage (Shake scroll)...");
        try {
          await page.mouse.wheel(0, -400); // Remonte un peu
          await page.waitForTimeout(300);
          await page.mouse.wheel(0, 800); // Redescend
        } catch (ex) { }
      }
    }

    if (noNewItemsIter >= 10) {
      console.log("Fin de liste confirmee (10 essais sans changement).");
      hasMore = false;
    }

    await page.waitForTimeout(1000);
  }
  console.log("TERMINE.");
}

// Fonction d'extraction réutilisable (pour le mode Replay)
export async function extractContacts(targetPage, selectors) {
  let contacts = [];
  try {
    await targetPage.waitForSelector('h1', { timeout: 10000 }).catch(() => { });

    // Onglet contacts
    const contactTab = targetPage.locator(".ant-tabs-tab, div[role='tab']").filter({ hasText: /^Contacts/i }).first();
    if (await contactTab.count() > 0 && await contactTab.isVisible()) {
      // Si pas de rows, on clique
      if (await targetPage.locator(selectors.contactRow).count() === 0) {
        await contactTab.click();
        await targetPage.waitForTimeout(2000);
      }
    }

    // Récup rows
    const rows = await targetPage.locator(selectors.contactRow).all();
    for (const row of rows) {
      if (await row.isVisible()) {
        let cName = "N/A"; let cTitle = "N/A";
        try { cName = (await row.locator(selectors.contactName).first().innerText()).trim(); } catch (e) { }
        try { cTitle = (await row.locator(selectors.contactTitle).first().innerText()).trim(); } catch (e) { }
        if (cName !== "N/A" && contacts.length < 5) contacts.push({ name: cName, title: cTitle });
      }
    }

    // Fallback: extraction texte brut si structure change
    if (contacts.length === 0) {
      const content = await targetPage.innerText('body');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (let k = 0; k < lines.length; k++) {
        if (/^(?:M\.|Mme)\s+/.test(lines[k])) {
          contacts.push({ name: lines[k], title: "N/A" });
          if (contacts.length >= 5) break;
        }
      }
    }
  } catch (e) {
    console.error("Erreur detailed extraction:", e.message);
    throw e; // Propager l'erreur pour que le replay sache qu'il a échoué
  }
  return contacts;
}

function logError(errorData) {
  try {
    const errorFile = "errors.json";
    let errors = [];
    if (fs.existsSync(errorFile)) {
      try {
        errors = JSON.parse(fs.readFileSync(errorFile, 'utf-8'));
      } catch (e) { }
    }
    // Eviter doublons sur l'URL
    if (!errors.find(e => e.url === errorData.url && e.name === errorData.name)) {
      errors.push({ ...errorData, timestamp: new Date().toISOString() });
      fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
    }
  } catch (e) {
    console.error("Impossible d'écrire dans errors.json", e);
  }
}
