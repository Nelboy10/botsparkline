
import fs from 'fs';
import { extractContacts } from './company.js';

const waitRandom = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

export async function replayErrors(page, selectors) {
    console.log("ETAPE 5 : REPLAY DES ERREURS (MODE RATTRAPAGE)");
    const errorFile = "errors.json";
    const csvFile = "contacts.csv";

    if (!fs.existsSync(errorFile)) {
        console.log("Aucun fichier errors.json trouvé. Rien à rejouer.");
        return;
    }

    const errors = JSON.parse(fs.readFileSync(errorFile, 'utf-8'));
    console.log(`${errors.length} erreurs trouvées à rejouer.`);

    // On filtre ceux qui ont une URL (les autres sont perdus sauf si on refait une recherche, mais trop complexe pour l'instant)
    const recoverableCtx = errors.filter(e => e.url && e.url.startsWith("http"));
    console.log(`${recoverableCtx.length} erreurs avec URL récupérables.`);

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
            // On ouvre l'URL directement
            await page.goto(item.url);
            await page.waitForLoadState('domcontentloaded');
            await waitRandom(1000, 2000);

            // On tente l'extraction
            const contacts = await extractContacts(page, selectors);

            if (contacts.length > 0) {
                // Enregistrement CSV
                const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");

                let phone = "N/A"; // On n'a pas l'info de la carte ici, sauf si on scrape la page detail (souvent y'a le tel)
                // Tentative récup tel sur page détail
                try {
                    // Sélecteur générique phone page détail ?
                    // Souvent c'est le même, ou alors c'est dans le header company
                    // On laisse N/A pour l'instant ou on tente un grab générique
                    const bodyText = await page.innerText('body');
                    const m = bodyText.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
                    if (m) phone = m[0];
                } catch (e) { }

                let line = `${safeCSV(item.name)},${safeCSV(phone)},N/A`; // Adresse N/A aussi
                for (let k = 0; k < 5; k++) {
                    if (k < contacts.length) {
                        line += `,${safeCSV(contacts[k].name)},${safeCSV(contacts[k].title)}`;
                    } else {
                        line += `,N/A,N/A`;
                    }
                }
                line += "\n";
                fs.appendFileSync(csvFile, line);

                console.log(`   -> SUCCES REPLAY (${contacts.length} contacts)`);
                newlySuccess++;
            } else {
                console.log("   -> ECHEC REPLAY (0 contacts trouvés)");
                remainingErrors.push(item);
            }

        } catch (e) {
            console.log(`   -> CRASH REPLAY: ${e.message}`);
            remainingErrors.push(item);
        }
        await waitRandom(1000, 2000);
    }

    // Rewrite errors.json with only remaining
    fs.writeFileSync(errorFile, JSON.stringify(remainingErrors, null, 2));
    console.log(`FIN DU REPLAY. ${newlySuccess} récupérés. ${remainingErrors.length} restants.`);
}
