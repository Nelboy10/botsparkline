import axios from 'axios';

// --- Fonction d'interception du Token JWT ---
export async function interceptToken(page) {
    console.log("🕵️ Recherche du token d'API Sparklane (God Mode)...");

    try {
        // Sparklane stocke le token JWT (Keycloak) dans le LocalStorage ou SessionStorage
        const token = await page.evaluate(() => {
            // Chercher dans LocalStorage et SessionStorage
            for (let storage of [window.localStorage, window.sessionStorage]) {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    // Les tokens Keycloak ou OAuth sont souvent stockés sous ces noms
                    if (key.includes('token') || key.includes('kc_') || key.includes('keycloak') || key.includes('auth')) {
                        try {
                            const val = typeof storage.getItem(key) === 'string' ? storage.getItem(key) : '';

                            // Si ça ressemble à un token JWT (eyJ...)
                            if (val.includes('eyJ') && val.length > 50) {
                                // Parfois c'est un JSON stringifié {"access_token": "eyJ..."}
                                if (val.startsWith('{')) {
                                    const parsed = JSON.parse(val);
                                    if (parsed.access_token) return 'Bearer ' + parsed.access_token;
                                    if (parsed.token) return 'Bearer ' + parsed.token;
                                } else {
                                    // Ou c'est juste le token pur
                                    return 'Bearer ' + val.replace(/^"|"$/g, '');
                                }
                            }
                        } catch (e) { }
                    }
                }
            }
            return null;
        });

        if (token) {
            console.log("🔥 Token API extrait du stockage local avec succès !");
            return token;
        }

    } catch (e) {
        console.log("❌ Erreur pendant l'extraction du token du navigateur :", e.message);
    }

    // Fallback: Si introuvable dans le Storage, on essaie d'écouter le réseau pendant 5 secondes
    console.log("⚠️ Token non trouvé dans le stockage. Tentative d'interception réseau experte...");

    return new Promise(async (resolve) => {
        let tokenFound = false;

        const requestListener = request => {
            const url = request.url();
            if (url.includes('/api/')) {
                const headers = request.headers();
                if (headers['authorization'] && headers['authorization'].startsWith('Bearer ') && !tokenFound) {
                    tokenFound = true;
                    console.log("🔥 Token API intercepté via le réseau avec succès !");
                    page.off('request', requestListener); // Stop listening
                    resolve(headers['authorization']);
                }
            }
        };

        page.on('request', requestListener);

        // Forcer le rechargement de la page pour déclencher des requêtes API
        console.log("🌀 Rechargement de la page pour forcer l'envoi de requêtes API...");
        page.reload().catch(() => { });

        setTimeout(() => {
            if (!tokenFound) {
                console.log("⚠️ Impossible de trouver le token après 90 secondes.");
                page.off('request', requestListener);
                resolve(null);
            }
        }, 90000); // 90 secondes
    });
}

// --- Fonction d'interception de la Liste d'Entreprises ---
export async function fetchCompaniesAPI(page, listId, pageSize = 1000) {
    console.log(`📡 Écoute du réseau : Extraction des entreprises (Liste ${listId})`);

    return new Promise(async (resolve) => {
        let listFound = false;

        // Timeout de sécurité au cas où on ne trouve pas la requête
        const timeoutId = setTimeout(() => {
            if (!listFound) {
                console.log("⚠️ Timeout réseau : La réponse de la liste n'a pas été trouvée.");
                resolve(null);
            }
        }, 30000); // 30 secondes max

        // On écoute la réponse de l'API (pas la requête)
        try {
            const response = await page.waitForResponse(response => {
                const url = response.url();
                return url.includes('/api/') && (url.includes('companies') || url.includes('company')) && parseInt(response.status()) === 200 && response.request().method() === 'POST';
            }, { timeout: 25000 });

            listFound = true;
            clearTimeout(timeoutId);

            console.log("🔥 Données d'entreprises interceptées avec succès !");
            const data = await response.json();

            // Capture the request details to allow active paginated fetching later
            const request = response.request();
            const requestDetails = {
                url: request.url(),
                method: request.method(),
                postData: request.postData()
            };

            resolve({ data, requestDetails });
        } catch (e) {
            console.log("❌ Erreur interception Playwright :", e.message);
            resolve(null);
        }
    });
}

// --- Fonction d'extraction des Contacts d'une Entreprise ---
export async function fetchContactsAPI(token, companyUniqueId, companyNumber, page = null) {
    const url = `https://predict.sparklane.fr/api/company-search/datalake-contacts-searches`;

    // Extract the numeric part of the company number if needed. The user gave '383744059'.
    // If we only have companyUniqueId (e.g. FR-38374405900106), we might need to extract the base number.
    // However, if we can pass the company number directly, it's safer. Let's use the provided key logic.
    const keyToUse = companyNumber || (companyUniqueId && companyUniqueId.match(/\d{9}/) ? companyUniqueId.match(/\d{9}/)[0] : companyUniqueId);

    const payload = {
        "companyKeyType": "COMPANY_NUMBER",
        "key": keyToUse,
        "pageSize": 15,
        "pageId": 0,
        "datasource": "FR",
        "searchOnAllGroupCompanies": false,
        "functionsAndKeywordsWrapper": {

        }
    };

    try {
        if (page) {
            let retries = 3;
            let lastError = null;

            while (retries > 0) {
                try {
                    // Execute the fetch directly in the browser context to ensure all cookies and headers are perfectly matching browser behavior.
                    const data = await page.evaluate(async ({ fetchUrl, fetchToken, fetchPayload }) => {
                        let currentToken = window.__cachedSparklaneToken;

                        // Si le token n'est pas encore en cache dans la window (ex: après un rechargement de page)
                        if (!currentToken) {
                            try {
                                for (let storage of [window.localStorage, window.sessionStorage]) {
                                    for (let i = 0; i < storage.length; i++) {
                                        const key = storage.key(i);
                                        if (key.includes('token') || key.includes('kc_') || key.includes('keycloak') || key.includes('auth')) {
                                            const val = typeof storage.getItem(key) === 'string' ? storage.getItem(key) : '';
                                            if (val.includes('eyJ') && val.length > 50) {
                                                if (val.startsWith('{')) {
                                                    const parsed = JSON.parse(val);
                                                    if (parsed.access_token) currentToken = 'Bearer ' + parsed.access_token;
                                                    else if (parsed.token) currentToken = 'Bearer ' + parsed.token;
                                                } else {
                                                    currentToken = 'Bearer ' + val.replace(/^"|"$/g, '');
                                                }
                                            }
                                        }
                                    }
                                }
                                if (currentToken) window.__cachedSparklaneToken = currentToken;
                            } catch (e) { }
                        }

                        // Fallback sécuritaire au cas où
                        currentToken = currentToken || fetchToken;

                        const response = await fetch(fetchUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': currentToken,
                                'Content-Type': 'application/json',
                                'Accept': '*/*'
                            },
                            body: JSON.stringify(fetchPayload)
                        });
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return await response.json();
                    }, { fetchUrl: url, fetchToken: token, fetchPayload: payload });

                    // FALLBACK : Si on n'a trouvé aucun contact dans le datalake, on tente les contacts enrichis
                    if (data && (data.count === 0 || !data.items || data.items.length === 0)) {
                        const enrichedUrl = `https://predict.sparklane.fr/api/company-search/enriched-contacts-searches`;
                        const enrichedData = await page.evaluate(async ({ fetchUrl, fetchToken, fetchPayload }) => {
                            let currentToken = window.__cachedSparklaneToken || fetchToken;
                            const response = await fetch(fetchUrl, {
                                method: 'POST',
                                headers: {
                                    'Authorization': currentToken,
                                    'Content-Type': 'application/json',
                                    'Accept': '*/*'
                                },
                                body: JSON.stringify(fetchPayload)
                            });
                            if (!response.ok) throw new Error(`HTTP error on enriched! status: ${response.status}`);
                            return await response.json();
                        }, { fetchUrl: enrichedUrl, fetchToken: token, fetchPayload: payload });

                        // Si l'API enrichie a des contacts, on la retourne
                        if (enrichedData && enrichedData.items && enrichedData.items.length > 0) {
                            return enrichedData;
                        }
                    }

                    return data;
                } catch (e) {
                    lastError = e;
                    if (e.message.includes('Execution context was destroyed')) {
                        console.log(`⚠️ Execution context destroyed. Retrying API call for ${companyUniqueId} in 2s...`);
                        await new Promise(r => setTimeout(r, 2000));
                        retries--;
                    } else if (e.message.includes('status: 401')) {
                        if (!page.isReloadingToken) {
                            page.isReloadingToken = true;
                            console.log(`⚠️ Token expiré (401). Rechargement de la page pour rafraîchir la session...`);
                            await page.evaluate(() => { window.__cachedSparklaneToken = null; }).catch(() => { });
                            await page.reload({ waitUntil: 'networkidle' }).catch(() => { });
                            await new Promise(r => setTimeout(r, 6000)); // Laisser le temps au SPA d'obtenir le nouveau token

                            // Vérifier si la session a totalement expiré (Redirection vers Login)
                            const currentUrl = page.url();
                            if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('sign')) {
                                console.log("\n" + "=".repeat(60));
                                console.log("🚨  ALERTE : SESSION SPARKLANE EXPIRÉE (Temps écoulé)  🚨");
                                console.log("=".repeat(60));
                                console.log("👉 Le bot est PAUSÉ pour éviter de fausser les données.");
                                console.log("👉 VEUILLEZ AFFICHER LA FENETRE DU NAVIGATEUR ET VOUS RECONNECTER MANUELLEMENT.");
                                console.log("⏳ En attente de votre reconnexion (ne fermez pas cette console)...\n");

                                // Boucle d'attente infinie tant que l'url contient login/auth/sign
                                while (page.url().includes('login') || page.url().includes('auth') || page.url().includes('sign')) {
                                    await new Promise(r => setTimeout(r, 3000));
                                }
                                console.log("\n✅ Reconnexion détectée ! Reprise de l'extraction en cours...");
                                await new Promise(r => setTimeout(r, 5000)); // Laisser le SPA charger pour capturer le nouveau token
                            }

                            page.isReloadingToken = false;
                        } else {
                            console.log(`⌛ Attente (401) : Un autre worker recharge déjà la page pour le token...`);
                            while (page.isReloadingToken) {
                                await new Promise(r => setTimeout(r, 1000));
                            }
                            await new Promise(r => setTimeout(r, Math.random() * 2000)); // Eviter l'effet de meute
                        }
                        retries--;
                    } else {
                        throw e; // throw other errors immediately
                    }
                }
            }
            throw lastError; // if all retries fail
        } else {
            // Fallback to axios if page is not provided
            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                }
            });
            return response.data;
        }

    } catch (error) {
        console.error(`❌ Erreur API contacts pour ${companyUniqueId}:`, error.message);
        return null;
    }
}
