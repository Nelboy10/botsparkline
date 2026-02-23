import { getBrowser } from "./src/auth.js";

(async () => {
    const { browser, page } = await getBrowser();

    console.log("Waiting for page load...");
    await page.waitForTimeout(3000);

    const keys = await page.evaluate(() => {
        const local = Object.keys(window.localStorage);
        const session = Object.keys(window.sessionStorage);
        const cookies = document.cookie;
        return { local, session, cookies };
    });

    console.log("--- STORAGE DUMP ---");
    console.log("Local Storage Keys:", keys.local);
    console.log("Session Storage Keys:", keys.session);
    console.log("Cookies:", keys.cookies);
    console.log("--------------------");

    await browser.close();
})();
