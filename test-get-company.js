import { getBrowser } from "./src/auth.js";
import { interceptToken } from "./src/api.js";
import axios from "axios";

(async () => {
    const { browser, page } = await getBrowser();
    const token = await interceptToken(page);

    if (!token) {
        console.log("No token");
        process.exit(1);
    }

    // Wait for the page to stabilize in case interceptToken triggered a reload
    console.log("Waiting for page to stabilize...");
    await page.waitForLoadState('domcontentloaded').catch(() => { });
    await page.waitForTimeout(3000);

    console.log("Testing GET /api/company-search/FR-13000858400018...");
    try {
        const result = await page.evaluate(async (token) => {
            const res = await fetch("https://predict.sparklane.fr/api/company-search/FR-13000858400018", {
                headers: { 'Authorization': token, 'Accept': 'application/json' }
            });
            if (!res.ok) return { error: res.status + " " + res.statusText };
            const data = await res.json();
            return { keys: Object.keys(data), data: data };
        }, token);

        if (result.error) {
            console.error("GET failed:", result.error);
        } else {
            console.log("Keys in response:", result.keys);
            if (result.data.contacts) console.log("Contacts found! Count:", result.data.contacts.length);
            else if (result.data.enrichedContacts) console.log("Enriched Contacts found! Count:", result.data.enrichedContacts.length);
            else {
                console.log("No contacts array found. Here is the start of the data:");
                console.log(JSON.stringify(result.data).substring(0, 500));
            }
        }
    } catch (e) {
        console.error("Evaluation failed:", e.message);
    }

    process.exit(0);
})();
