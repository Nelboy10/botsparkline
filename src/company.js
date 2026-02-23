import fs from 'fs';
import { fetchCompaniesAPI, fetchContactsAPI, interceptToken } from './api.js';
import axios from 'axios';

const waitRandom = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

// Pool de concurrence générique
async function withPool(items, concurrency, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function processCompanies(page, baseUrl, targetListId, dryRun = false, selectors, listName = "DEFAULT_LIST", turbo = false) {
  const CONCURRENCY = turbo ? 3 : 1;
  console.log(`ETAPE 4 : EXTRACTION (${turbo ? `TURBO x${CONCURRENCY}` : 'Normal'}) - Liste: ${listName}`);

  const csvDir = "data/lists";
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const csvFile = `${csvDir}/${listName}.csv`;
  const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");

  if (!fs.existsSync(csvFile)) {
    fs.writeFileSync(csvFile, "Entreprise,Telephone,Adresse,Nom Contact 1,Titre Contact 1,Nom Contact 2,Titre Contact 2,Nom Contact 3,Titre Contact 3,Nom Contact 4,Titre Contact 4,Nom Contact 5,Titre Contact 5\n");
  }

  // Turbo: bloquer ressources sur la page principale
  if (turbo) {
    console.log("🚀 TURBO: blocage ressources + " + CONCURRENCY + " workers parallèles");
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
  }

  const processedNames = new Set();
  let totalProcessed = 0;
  let noNewItemsIter = 0;
  let hasMore = true;

  // Reprise depuis CSV existant
  if (fs.existsSync(csvFile)) {
    const content = fs.readFileSync(csvFile, 'utf-8');
    let dbCount = 0;
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      if (cols.length > 0) {
        let name = cols[0].trim().replace(/^"|"$/g, '');
        if (name && name !== "Entreprise") { processedNames.add(name); dbCount++; }
      }
    }
    console.log(`📂 Reprise : ${dbCount} entreprises déjà dans le CSV.`);
  }

  // Lire le total réel depuis le compteur de la liste
  let totalInList = Infinity;
  try {
    const ct = await page.locator(selectors.companiesCounter).textContent({ timeout: 3000 });
    const m = ct.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) { totalInList = parseInt(m[2]); console.log(`📊 Total liste : ${totalInList} entreprises`); }
  } catch (_) { }

  while (hasMore) {
    const currentCards = await page.locator(selectors.companyCard).all();
    const currentCount = currentCards.length;
    console.log(`\nCartes visibles: ${currentCount} | Traité: ${totalProcessed} | Global: ${processedNames.size} / ${totalInList}`);

    // ═══════════════════════════════════════════
    // PHASE 1 : SCAN RAPIDE (séquentiel, DOM only)
    // ═══════════════════════════════════════════
    const toProcess = [];
    for (const card of currentCards) {
      if (dryRun && totalProcessed + toProcess.length >= 10) break;

      // Nom (avec fallbacks)
      let rawName = "";
      try { rawName = await card.locator(selectors.companyName).first().textContent({ timeout: 1500 }); } catch (_) { }
      if (!rawName?.trim()) {
        try { rawName = await card.locator('a').first().textContent({ timeout: 500 }); } catch (_) { }
      }
      if (!rawName?.trim()) {
        try { rawName = (await card.innerText({ timeout: 500 })).split('\n')[0]; } catch (_) { }
      }
      const safeID = (rawName || "").trim().replace(/,/g, " ").replace(/\n/g, " ");
      if (!safeID || processedNames.has(safeID)) continue;

      // Réserver immédiatement (évite doublons entre workers)
      processedNames.add(safeID);

      // Téléphone
      let phone = "N/A";
      try {
        const pEl = card.locator(selectors.companyPhoneLabel).first();
        if (await pEl.count() > 0) phone = (await pEl.innerText({ timeout: 500 })).replace(/[\n\r]+/g, ' ').trim();
      } catch (_) { }
      if (phone === "N/A" || phone.length < 5) {
        try {
          const t = await card.innerText({ timeout: 500 });
          const m = t.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
          if (m) phone = m[0];
        } catch (_) { }
      }

      // Adresse
      let address = "N/A";
      try {
        const aEl = card.locator(selectors.companyAddress).first();
        if (await aEl.count() > 0) address = (await aEl.innerText({ timeout: 500 })).replace(/[\n\r]+/g, ' ').trim();
      } catch (_) { }

      // URL profil (depuis le DOM, pas de navigation)
      let profileUrl = null;
      try {
        const companyLink = card.locator('a[href*="/company/"]').first();
        if (await companyLink.count() > 0) {
          profileUrl = await companyLink.getAttribute('href');
        } else {
          const nameEl = card.locator(selectors.companyName).first();
          const tag = await nameEl.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
          if (tag === 'a') profileUrl = await nameEl.getAttribute('href').catch(() => null);
          else {
            const anc = nameEl.locator('xpath=ancestor::a').first();
            if (await anc.count() > 0) profileUrl = await anc.getAttribute('href').catch(() => null);
          }
        }
        if (profileUrl && !profileUrl.startsWith('http')) {
          const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          profileUrl = profileUrl.startsWith('/') ? base + profileUrl : base + '/' + profileUrl;
        }
      } catch (_) { }

      toProcess.push({ safeID, companyName: safeID, phone, address, profileUrl });
    }

    if (toProcess.length === 0) {
      // Rien de nouveau sur cette page, scroll
    } else {
      console.log(`  → ${toProcess.length} nouvelles entreprises à traiter (${CONCURRENCY} workers)...`);

      // ════════════════════════════════════════════════
      // PHASE 2 : EXTRACTION CONTACTS (parallèle, onglets séparés)
      // ════════════════════════════════════════════════
      await withPool(toProcess, CONCURRENCY, async (company) => {
        let contacts = [];
        if (company.profileUrl) {
          const targetUrl = company.profileUrl.includes('#') ? company.profileUrl : company.profileUrl + "#contacts";
          let tab = null;
          try {
            tab = await page.context().newPage();
            if (turbo) await tab.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
            await tab.goto(targetUrl, { waitUntil: 'commit', timeout: turbo ? 12000 : 25000 });
            await waitRandom(turbo ? 150 : 800, turbo ? 400 : 1500);
            contacts = await extractContacts(tab, selectors, turbo);
          } catch (e) {
            logError({ name: company.companyName, url: company.profileUrl, reason: e.message });
          } finally {
            if (tab) await tab.close().catch(() => { });
          }
        }

        // Écriture CSV (synchronisée — appendFileSync est bloquant = safe)
        let line = `${safeCSV(company.companyName)},${safeCSV(company.phone)},${safeCSV(company.address)}`;
        for (let k = 0; k < 5; k++) {
          line += k < contacts.length
            ? `,${safeCSV(contacts[k].name)},${safeCSV(contacts[k].title)}`
            : `,N/A,N/A`;
        }
        fs.appendFileSync(csvFile, line + "\n");
        totalProcessed++;
        console.log(`   ✅ [${totalProcessed}] ${company.companyName} (${contacts.length} contacts)`);
      });

      if (dryRun && totalProcessed >= 10) { hasMore = false; break; }
    }

    if (!hasMore) break;

    // Vérification fin réelle via compteur
    if (processedNames.size >= totalInList) {
      console.log(`✅ Toutes les ${totalInList} entreprises traitées.`);
      hasMore = false; break;
    }

    // ════════════════════════════════════════════
    // SCROLL (liste virtuelle → scroll jusqu'au bas absolu)
    // ════════════════════════════════════════════
    const lastCard = currentCards[currentCards.length - 1];

    // Capturer le texte de la dernière carte AVANT scroll
    const lastCardText = await lastCard?.innerText({ timeout: 1000 }).catch(() => "") || "";

    // Trouver conteneur scrollable
    let scrollElement = null;
    try {
      const handle = await lastCard.evaluateHandle(el => {
        let p = el.parentElement;
        while (p) {
          const s = window.getComputedStyle(p);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
          p = p.parentElement;
        }
        return null;
      });
      scrollElement = handle?.asElement() ?? null;
    } catch (_) { }

    // Scroll jusqu'au BAS ABSOLU du conteneur pour déclencher chargement suivant
    try {
      if (scrollElement) {
        await scrollElement.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await waitRandom(200, 400);
        // Deuxième scroll pour s'assurer d'être vraiment tout en bas
        await scrollElement.evaluate(el => { el.scrollTop = el.scrollHeight; });
      }
      // Toujours aussi : scroll fenêtre + molette + clavier
      const box = await lastCard.boundingBox().catch(() => null);
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 1200).catch(() => { });
      await page.keyboard.press('End').catch(() => { });
      await page.keyboard.press('PageDown').catch(() => { });
    } catch (_) { }

    // Attendre que le texte de la DERNIÈRE carte change (nouveau contenu chargé)
    try {
      await page.waitForFunction(([sel, prev]) => {
        const all = document.querySelectorAll(sel);
        if (all.length === 0) return false;
        return all[all.length - 1].innerText !== prev;
      }, [selectors.companyCard, lastCardText], { timeout: turbo ? 6000 : 15000 });
      noNewItemsIter = 0;
      console.log(`   → Nouvelles cartes chargées !`);
    } catch (_) {
      noNewItemsIter++;
      console.log(`   → Pas de nouvelle carte (${noNewItemsIter}/15)`);
      // Shake : remonter puis redescendre pour débloquer
      if (noNewItemsIter >= 3) {
        try {
          if (scrollElement) {
            await scrollElement.evaluate(el => { el.scrollTop = Math.max(0, el.scrollTop - 500); });
            await waitRandom(400, 600);
            await scrollElement.evaluate(el => { el.scrollTop = el.scrollHeight; });
          }
          await page.mouse.wheel(0, -800);
          await waitRandom(300, 500);
          await page.mouse.wheel(0, 1500);
        } catch (_) { }
      }
    }

    if (noNewItemsIter >= 15) { console.log("✅ Fin de liste confirmée."); hasMore = false; }

    await waitRandom(turbo ? 100 : 600, turbo ? 250 : 1000);
  }

  console.log(`\n✅ TERMINE. Total: ${totalProcessed} entreprises.`);
}

// ════════════════════════════════════════════════
// MODE API (GOD MODE)
// ════════════════════════════════════════════════
export async function processCompaniesGodMode(page, token, baseUrl, listId, dryRun = false, listName = "DEFAULT_LIST") {
  console.log(`\n🌟 ETAPE 4 : EXTRACTION GOD MODE (API) - Liste: ${listName} (ID: ${listId})`);

  const csvDir = "data/lists";
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const csvFile = `${csvDir}/${listName}.csv`;
  const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");

  if (!fs.existsSync(csvFile)) {
    fs.writeFileSync(csvFile, "Entreprise,Telephone,Adresse,Nom Contact 1,Titre Contact 1,Nom Contact 2,Titre Contact 2,Nom Contact 3,Titre Contact 3,Nom Contact 4,Titre Contact 4,Nom Contact 5,Titre Contact 5\n");
  }

  // Etape 1 : Intercepter les données au vol en forçant un chargement
  const pageSize = 1000;
  let allCompanies = [];

  // On récupère la première page
  console.log("📥 Interception de la liste d'entreprises (Veuillez scroller sur la page si ça bloque)...");

  // Lancer l'écouteur ET provoquer le chargement en même temps
  const [firstPage] = await Promise.all([
    fetchCompaniesAPI(page, listId, pageSize),
    // Forcer un rechargement complet de la page pour capturer la requête initiale avec certitude
    page.reload({ waitUntil: 'domcontentloaded' }).catch(() => { })
  ]);

  if (!firstPage || !firstPage.data || !firstPage.data.companies) {
    console.error("❌ Echec de l'interception des entreprises. Essayez de scroller manuellement.");
    return;
  }

  allCompanies.push(...firstPage.data.companies);
  const totalInList = firstPage.data.count || allCompanies.length;
  console.log(`📊 API confirme ${totalInList} entreprises au total dans cette liste.`);

  // Active Pagination via API
  const reqUrl = firstPage.requestDetails.url;
  const reqMethod = firstPage.requestDetails.method;
  let reqBodyStr = firstPage.requestDetails.postData;

  if (reqMethod === 'POST' && reqBodyStr && allCompanies.length < totalInList) {
    try {
      const reqBody = JSON.parse(reqBodyStr);

      if (reqBody.pageParams) {
        reqBody.pageParams.size = 100;
      } else if (reqBody.pageSize !== undefined) {
        reqBody.pageSize = 100;
      } else if (reqBody.size !== undefined) {
        reqBody.size = 100;
      }

      const maxPages = Math.ceil(totalInList / 100);
      console.log(`🔄 Récupération active via API repérée, estimation: ${maxPages} pages...`);

      for (let p = 1; p <= maxPages; p++) {
        if (reqBody.pageParams) reqBody.pageParams.page = p;
        else if (reqBody.pageId !== undefined) reqBody.pageId = p;
        else if (reqBody.page !== undefined) reqBody.page = p;

        const res = await axios.post(reqUrl, reqBody, {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        const data = res.data;
        if (data && data.companies && data.companies.length > 0) {
          allCompanies.push(...data.companies);
          console.log(`   📄 Page API ${p} ok : +${data.companies.length} entreprises (Total: ${allCompanies.length}/${totalInList})`);
        } else {
          break;
        }
        await new Promise(r => setTimeout(r, 600)); // anti-spam

        // Arrêter si on a tout
        if (allCompanies.length >= totalInList) break;
        if (dryRun && p >= 2) break; // Stopper tôt pour dryRun
      }
    } catch (err) {
      console.error("⚠️ Impossible de paginer activement :", err.message);
    }
  }

  // Si on est en dryRun, on s'arrête là (max 10)
  if (dryRun && allCompanies.length > 10) {
    allCompanies = allCompanies.slice(0, 10);
  }

  // Deduplication to prevent edge cases with repeated pages
  const uniqueCompaniesMap = new Map();
  for (const c of allCompanies) {
    if (c.companyUniqueId) uniqueCompaniesMap.set(c.companyUniqueId, c);
  }
  allCompanies = Array.from(uniqueCompaniesMap.values());

  console.log(`🚀 ${allCompanies.length} profils d'entreprise uniques récupérés à la vitesse de la lumière.`);

  // Etape 2 : Préparer le CSV et filtrer les doublons déjà traités
  const processedNames = new Set();
  if (fs.existsSync(csvFile)) {
    const content = fs.readFileSync(csvFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      if (cols.length > 0) {
        let name = cols[0].trim().replace(/^"|"$/g, '');
        if (name && name !== "Entreprise") processedNames.add(name);
      }
    }
  }

  const companiesToProcess = allCompanies.filter(company => {
    // Structure récupérée : company.fieldValueByCompanySearchFieldName.companies["companies.name"]
    const fields = company.fieldValueByCompanySearchFieldName?.companies || {};
    const name = fields["companies.name"] || "N/A";
    return !processedNames.has(safeCSV(name));
  });

  console.log(`📂 ${processedNames.size} entreprises déjà dans le CSV. Il en reste ${companiesToProcess.length} à traiter.`);

  // Etape 3 : Scraper les contacts via API en parallèle (Concurrency très élevée permise car no DOM)
  const CONCURRENCY = 15; // 15 requêtes API simultanées (très rapide)
  let totalProcessed = 0;
  let isRefreshingToken = false;

  console.log(`⚡ Extraction des contacts techniques (${CONCURRENCY} workers API)...`);

  await withPool(companiesToProcess, CONCURRENCY, async (company) => {
    const fields = company.fieldValueByCompanySearchFieldName?.companies || {};
    const cName = safeCSV(fields["companies.name"]);
    const cNumber = fields["companies.compNumber"]; // Extract company number for the new API

    // Nettoyage de l'adresse et téléphone
    let addressParts = [];
    if (fields["companies.address"]) addressParts.push(fields["companies.address"]);
    else {
      if (fields["companies.town"]) addressParts.push(fields["companies.town"]);
      if (fields["companies.zip"]) addressParts.push(fields["companies.zip"]);
    }
    const cAddress = addressParts.length > 0 ? safeCSV(addressParts.join(' ')) : "N/A";
    const cPhone = safeCSV(fields["companies.phone"]);

    let contactsData = null;

    // Wait if another worker is currently refreshing the token
    while (isRefreshingToken) {
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      contactsData = await fetchContactsAPI(token, company.companyUniqueId, cNumber, page);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        if (!isRefreshingToken) {
          isRefreshingToken = true;
          console.log(`⚠️ Token expiré détecté (401) pour ${cName}. Tentative de rafraîchissement...`);
          try {
            const newToken = await interceptToken(page);
            if (newToken) {
              token = newToken;
              console.log("✅ Nouveau token obtenu avec succès.");
            } else {
              console.error("❌ Impossible de rafraîchir le token.");
            }
          } catch (tokenErr) {
            console.error("❌ Erreur pendant le rafraîchissement du token :", tokenErr.message);
          } finally {
            isRefreshingToken = false;
          }
        } else {
          // Wait for the token refresh triggered by another worker to finish
          while (isRefreshingToken) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // Retry once with the potentially new token
        try {
          contactsData = await fetchContactsAPI(token, company.companyUniqueId, cNumber, page);
        } catch (retryErr) {
          console.log(`❌ Echec définitif API contacts pour ${company.companyUniqueId} après retry : ${retryErr.message}`);
        }
      } else {
        console.log(`❌ Erreur API contacts pour ${company.companyUniqueId}: ${err.message}`);
      }
    }

    let contactsToSave = [];
    if (contactsData && (contactsData.contacts || contactsData.items)) {
      // Filtrage et Tri Intelligent (Directeurs Techniques en premier)
      // The API now filters by keywords ("technique"), so most returned contacts should be relevant.
      const techKw = ["directeur technique", "technical director", "cto", "r&d", "technique", "ingénieur", "engineer", "developpeur", "developer", "it", "informatique", "système", "reseau", "data", "lead"];

      const rawContacts = contactsData.items || contactsData.contacts;
      let parsedContacts = rawContacts.map(ct => {
        let title = 'N/A';
        if (ct.jobTitleDetails && ct.jobTitleDetails.functionLabel) {
          title = ct.jobTitleDetails.functionLabel;
        } else if (ct.functionLabel) {
          title = ct.functionLabel;
        } else if (ct.jobTitle) {
          title = ct.jobTitle;
        }

        return {
          name: ct.fullName || `${ct.firstname || ct.firstName || ''} ${ct.lastname || ct.lastName || ''}`.trim() || 'N/A',
          title: title
        };
      }).filter(c => c.name !== 'N/A');

      parsedContacts.sort((a, b) => {
        const aS = techKw.some(k => a.title.toLowerCase().includes(k)) ? 1 : 0;
        const bS = techKw.some(k => b.title.toLowerCase().includes(k)) ? 1 : 0;
        return bS - aS;
      });

      contactsToSave = parsedContacts.slice(0, 5);
    }

    // Construction ligne CSV
    let line = `${cName},${cPhone},${cAddress}`;
    for (let k = 0; k < 5; k++) {
      line += k < contactsToSave.length
        ? `,${safeCSV(contactsToSave[k].name)},${safeCSV(contactsToSave[k].title)}`
        : `,N/A,N/A`;
    }

    fs.appendFileSync(csvFile, line + "\n");
    totalProcessed++;

    if (totalProcessed % 50 === 0 || totalProcessed === companiesToProcess.length) {
      console.log(`   ⏳ Progression : ${totalProcessed} / ${companiesToProcess.length} entreprises traitées.`);
    }
  });

  console.log(`\n✅ TERMINE (GOD MODE). Total traité: ${totalProcessed} entreprises.`);
}

export async function extractContacts(targetPage, selectors, turbo = false) {
  let contacts = [];
  try {
    // Attendre soit h1 soit les rows directement
    await Promise.race([
      targetPage.waitForSelector('h1', { timeout: turbo ? 4000 : 8000 }),
      targetPage.waitForSelector(selectors.contactRow, { timeout: turbo ? 4000 : 8000 }),
    ]).catch(() => { });

    // Cliquer sur l'onglet Contacts si nécessaire
    const contactTab = targetPage.locator(".ant-tabs-tab, div[role='tab']").filter({ hasText: /^Contacts/i }).first();
    if (await contactTab.count() > 0 && await contactTab.isVisible().catch(() => false)) {
      if (await targetPage.locator(selectors.contactRow).count() === 0) {
        await contactTab.click();
        await waitRandom(turbo ? 250 : 1200, turbo ? 500 : 2000);
      }
    }

    const rows = await targetPage.locator(selectors.contactRow).all();
    for (const row of rows) {
      if (!await row.isVisible().catch(() => false)) continue;
      let cName = "N/A", cTitle = "N/A";
      try { cName = (await row.locator(selectors.contactName).first().innerText({ timeout: 1000 })).trim(); } catch (_) { }
      try { cTitle = (await row.locator(selectors.contactTitle).first().innerText({ timeout: 1000 })).trim(); } catch (_) { }
      if (cName !== "N/A") contacts.push({ name: cName, title: cTitle });
    }

    // Tri: directeurs techniques en premier
    const techKw = ["directeur technique", "technical director", "cto", "r&d", "technique", "ingénieur", "engineer", "developpeur", "developer"];
    contacts.sort((a, b) => {
      const aS = techKw.some(k => a.title.toLowerCase().includes(k)) ? 1 : 0;
      const bS = techKw.some(k => b.title.toLowerCase().includes(k)) ? 1 : 0;
      return bS - aS;
    });
    contacts = contacts.slice(0, 5);

    // Fallback texte brut
    if (contacts.length === 0) {
      const content = await targetPage.innerText('body').catch(() => "");
      for (const line of content.split('\n').map(l => l.trim())) {
        if (/^(?:M\.|Mme)\s+/.test(line)) {
          contacts.push({ name: line, title: "N/A" });
          if (contacts.length >= 5) break;
        }
      }
    }
  } catch (e) {
    console.error("Erreur extraction:", e.message);
    throw e;
  }
  return contacts;
}

function logError(errorData) {
  try {
    const errorFile = "errors.json";
    let errors = [];
    if (fs.existsSync(errorFile)) {
      try { errors = JSON.parse(fs.readFileSync(errorFile, 'utf-8')); } catch (_) { }
    }
    if (!errors.find(e => e.url === errorData.url && e.name === errorData.name)) {
      errors.push({ ...errorData, timestamp: new Date().toISOString() });
      fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
    }
  } catch (_) { }
}
