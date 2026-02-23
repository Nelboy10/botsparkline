import fs from "fs";
import { getBrowser } from "./src/auth.js";
import { interceptToken } from "./src/api.js";

(async () => {

    console.log("Starting browser...");

    const { browser, page } = await getBrowser();

    console.log("Getting token...");

    const token = await interceptToken(page);

    if (!token) {
        console.log("Token not found. Abort.");
        await browser.close();
        process.exit(1);
    }

    console.log("Token OK");

    // 🔑 CHANGE ICI le company key
    const companyKey = "383744059";

    let pageId = 0;
    let allContacts = [];
    let hasMore = true;

    console.log("Fetching contacts...");

    while (hasMore) {

        console.log(`Fetching page ${pageId}...`);

        const payload = {
            companyKeyType: "COMPANY_NUMBER",
            key: companyKey,
            pageSize: 20,
            pageId: pageId,
            datasource: "FR",
            searchOnAllGroupCompanies: false
        };

        const result = await page.evaluate(
            async ({ token, payload }) => {

                try {

                    const res = await fetch(
                        "/api/enriched-contacts/contact-references",
                        {
                            method: "POST",
                            headers: {
                                "Authorization": token,
                                "Content-Type": "application/json",
                                "Accept": "application/json"
                            },
                            body: JSON.stringify(payload),
                            credentials: "include"
                        }
                    );

                    if (!res.ok) {
                        return { error: res.status };
                    }

                    return await res.json();

                } catch (e) {
                    return { error: e.message };
                }

            },
            { token, payload }
        );

        if (result.error) {

            console.log("Error:", result.error);
            break;

        }

        const contacts = result.contacts || [];

        if (contacts.length === 0) {

            console.log("No more contacts.");
            hasMore = false;

        } else {

            allContacts.push(...contacts);

            console.log(
                `Page ${pageId} OK → ${contacts.length} contacts (Total: ${allContacts.length})`
            );

            pageId++;

        }

    }

    console.log("\nFinished.");
    console.log("Total contacts:", allContacts.length);

    // 💾 Sauvegarder en JSON
    fs.writeFileSync(
        "contacts.json",
        JSON.stringify(allContacts, null, 2)
    );

    console.log("Saved to contacts.json");

    await browser.close();

    process.exit(0);

})();