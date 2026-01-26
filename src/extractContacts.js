export default async function extractContacts(companyPage, companyName) {
  console.log(" Chargement des contacts...");

  // Attente section contacts
  await companyPage.waitForSelector("#contacts", { timeout: 10000 });

  // Petit délai React
  await companyPage.waitForTimeout(1000);

  // Sélecteur contacts Sparklane
  const contacts = await companyPage.locator("[class*='contactCard']").all();

  console.log(`👥 ${contacts.length} contacts trouvés pour ${companyName}`);

  for (let i = 0; i < contacts.length; i++) {
    const name = await contacts[i].locator("span[class*='name']").innerText();
    const role = await contacts[i].locator("span[class*='role']").innerText();

    console.log(`   → ${name} | ${role}`);
  }
}
