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

  while (hasMore) {
    const currentCards = await page.locator(selectors.companyCard).all();
    const currentCount = currentCards.length;
    console.log(`Cartes visibles: ${currentCount} (Total traite: ${totalProcessed})`);

    let newlyProcessed = 0;
    for (let i = 0; i < currentCount; i++) {
      if (dryRun && totalProcessed >= 10) { hasMore = false; break; }

      try {
        const card = currentCards[i];
        const nameEl = card.locator(selectors.companyName).first();
        const rawName = await nameEl.textContent().catch(() => "");
        const safeID = rawName.trim();

        if (!safeID || processedNames.has(safeID)) continue;

        await card.scrollIntoViewIfNeeded();
        await waitRandom(300, 800);

        const listName = (await nameEl.innerText()).trim();

        let phone = "N/A";
        try {
          const pEl = card.locator(selectors.companyPhoneLabel).first();
          if (await pEl.count() > 0) phone = (await pEl.innerText()).replace(/[\n\r]+/g, ' ').trim();
        } catch (e) { }
        if (phone === "N/A" || phone.length < 5) {
          const t = await card.innerText().catch(() => "");
          const m = t.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
          if (m) phone = m[0];
        }

        let address = "N/A";
        try {
          const aEl = card.locator(selectors.companyAddress).first();
          if (await aEl.count() > 0) address = (await aEl.innerText()).replace(/[\n\r]+/g, ' ').trim();
        } catch (e) { }

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
              page.context().waitForEvent('page', { timeout: 5000 }),
              nameEl.click()
            ]);
            targetPage = newPage;

            await targetPage.waitForLoadState('domcontentloaded');
            if (!targetPage.url().includes("contacts")) await targetPage.goto(targetPage.url() + "#contacts");
            isNewTab = true;
            await waitRandom(1500, 2500);
          } catch (e) { }
        }

        let contacts = [];
        if (targetPage) {
          try {
            await targetPage.waitForSelector('h1', { timeout: 8000 }).catch(() => { });

            const contactTab = targetPage.locator(".ant-tabs-tab, div[role='tab']").filter({ hasText: /^Contacts/i }).first();
            if (await contactTab.count() > 0 && await contactTab.isVisible()) {
              if (await targetPage.locator(selectors.contactRow).count() === 0) {
                await contactTab.click();
                await targetPage.waitForTimeout(1500);
              }
            }
            const rows = await targetPage.locator(selectors.contactRow).all();
            for (const row of rows) {
              if (await row.isVisible()) {
                let cName = "N/A"; let cTitle = "N/A";
                try { cName = (await row.locator(selectors.contactName).first().innerText()).trim(); } catch (e) { }
                try { cTitle = (await row.locator(selectors.contactTitle).first().innerText()).trim(); } catch (e) { }
                if (cName !== "N/A" && contacts.length < 5) contacts.push({ name: cName, title: cTitle });
              }
            }
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
            await targetPage.close();
            await page.bringToFront();
          } catch (e) {
            if (isNewTab) await targetPage.close().catch(() => { });
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

        fs.appendFileSync(csvFile, line);
        processedNames.add(safeID);
        totalProcessed++;
        newlyProcessed++;
        console.log(`   -> OK (${contacts.length} contacts).`);

        console.log("   ->Pause humaine...");
        await waitRandom(1500, 3500);

      } catch (err) { console.error(`Erreur item ${i}`, err.message); }
    }

    if (!hasMore) break;

    console.log(`Scroll (Batch +${newlyProcessed})...`);

    const lastCard = currentCards[currentCards.length - 1];
    if (lastCard) {
      try {
        await lastCard.scrollIntoViewIfNeeded();
        await lastCard.evaluate(el => {
          let p = el.parentElement;
          while (p) {
            if (window.getComputedStyle(p).overflowY === 'auto' || window.getComputedStyle(p).overflowY === 'scroll') {
              p.scrollTop = p.scrollHeight;
              return;
            }
            p = p.parentElement;
          }
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(500);
        await page.keyboard.press('PageDown');
      } catch (e) { console.log("   -> Erreur scroll: " + e.message); }
    }

    const previousLastText = await lastCard?.innerText().catch(() => "") || "";
    try {
      await page.waitForFunction((prevText) => {
        const all = document.querySelectorAll("[class*='companyCard']");
        if (all.length === 0) return false;
        const newLast = all[all.length - 1].innerText;
        return newLast !== prevText;
      }, previousLastText, { timeout: 10000 });
      noNewItemsIter = 0;
    } catch (e) {
      console.log("Timeout chargement. (Rien de nouveau)");
      noNewItemsIter++;
    }

    if (noNewItemsIter >= 5) {
      console.log("Fin de liste confirmee.");
      hasMore = false;
    }

    await page.waitForTimeout(1000);
  }
  console.log("TERMINE.");
}
