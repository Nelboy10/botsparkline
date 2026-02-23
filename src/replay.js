
import fs from 'fs';
import { extractContacts } from './company.js';

const waitRandom = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

export async function replayErrors(page, selectors, listName = "REPLAY_RECOVERED") {
    console.log(`ETAPE 5 : REPLAY DES ERREURS (MODE RATTRAPAGE) - Liste: ${listName}`);
    const errorFile = "errors.json";

    // On sauvegarde dans le dossier data/lists pour cohérence
    const csvDir = "data/lists";
    if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
    const csvFile = `${csvDir}/${listName}.csv`;

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

    // Headers si fichier n'existe pas
    const headers = "Entreprise,Telephone,Adresse,Nom Contact 1,Titre Contact 1,Nom Contact 2,Titre Contact 2,Nom Contact 3,Titre Contact 3,Nom Contact 4,Titre Contact 4,Nom Contact 5,Titre Contact 5\n";
    if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, headers);

    for (const item of errors) {
        if (!item.url || !item.url.startsWith("http")) {
            console.log(`[SKIP] ${item.name} (Pas d'URL valide)`);
            remainingErrors.push(item);
            continue;
        }

        console.log(`[RETRY] ${item.name} (${item.url})...`);
        try {
            await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await waitRandom(1000, 2000);

            // On tente l'extraction
            const contacts = await extractContacts(page, selectors);

            // Enregistrement CSV
            const safeCSV = (str) => (str || "N/A").replace(/,/g, " ").replace(/\n/g, " ");

            // On essaie de récupérer le tel depuis la page detail si possible
            let phone = "N/A";
            try {
                const bodyText = await page.innerText('body');
                const m = bodyText.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
                if (m) phone = m[0];
            } catch (e) { }

            let line = `${safeCSV(item.name)},${safeCSV(phone)},N/A`;
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
