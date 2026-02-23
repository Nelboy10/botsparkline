import fs from "fs";
import { getBrowser } from "./src/auth.js";
import { interceptToken } from "./src/api.js";

(async () => {
    const { browser, page } = await getBrowser();

    // Intercept token
    await interceptToken(page);

    console.log("Listen for contact requests...");
    page.on('response', async res => {
        const url = res.url();
        try {
            const req = res.request();
            if (req.method() === 'POST' || req.method() === 'GET' || req.method() === 'OPTIONS') {
                if (url.includes('contact') || res.headers()['content-type']?.includes('json')) {
                    console.log(`=== ${req.method()} ${res.status()} ===`);
                    console.log("URL:", url);
                    // Only log payload for POST if it's JSON
                    if (req.method() === 'POST' && req.postData()?.startsWith('{')) {
                        console.log("Payload:", req.postData().substring(0, 100)); // Truncate so it's not huge
                    }
                    console.log("============================");
                }
            }
        } catch (e) { }
    });

    console.log("Go to a company page and wait for user to click Contacts...");
    await page.goto("https://predict.sparklane.fr/companies-list/133403");

    // Attendre le premier lien companyCard pour cliquer
    await page.waitForSelector("[class*='companyCard'] a[href*='/company/']", { timeout: 15000 }).catch(() => { });

    const cardLink = await page.$("[class*='companyCard'] a[href*='/company/']");
    if (cardLink) {
        console.log("Clicking on first company...");
        await cardLink.click();

        await page.waitForTimeout(5000);
        console.log("Visiting contacts tab...");
        const contactTab = page.locator(".ant-tabs-tab, div[role='tab']").filter({ hasText: /^Contacts/i }).first();
        if (await contactTab.count() > 0) {
            await contactTab.click();
        } else {
            console.log("Contact tab not found, try doing it manually.");
        }
    }

    console.log("Waiting 20 seconds for capture...");
    await page.waitForTimeout(20000);
    console.log("Done.");
    process.exit(0);
})();
