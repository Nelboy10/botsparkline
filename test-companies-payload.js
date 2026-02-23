import { getBrowser } from "./src/auth.js";
import { interceptToken } from "./src/api.js";

(async () => {
    const { browser, page } = await getBrowser();

    // Intercept token
    await interceptToken(page);

    console.log("Listen for companies-searches response...");
    page.on('response', async res => {
        const url = res.url();
        if (url.includes('companies-searches') && res.request().method() === 'POST') {
            try {
                const data = await res.json();
                if (data && data.companies && data.companies.length > 0) {
                    const c = data.companies[0];
                    const fields = c.fieldValueByCompanySearchFieldName || {};
                    console.log("=== COMPANIES-SEARCHES FIRST COMPANY FIELDS ===");
                    console.log("Categories:", Object.keys(fields));
                    if (fields.companies) console.log("Keys in 'companies':", Object.keys(fields.companies));
                    if (fields.contacts) console.log("Keys in 'contacts':", Object.keys(fields.contacts));

                    const str = JSON.stringify(c);
                    if (str.toLowerCase().includes('contact')) {
                        console.log("There is 'contact' string!");
                    }
                    console.log("============================");
                    process.exit(0);
                }
            } catch (e) { }
        }
    });

    console.log("Navigating to list...");
    await page.goto("https://predict.sparklane.fr/companies-list/133403", { waitUntil: 'domcontentloaded' });

    console.log("Triggering reload...");
    await page.reload();
    await page.waitForTimeout(20000);
    process.exit(1);
})();
