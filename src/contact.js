export async function extractContacts(page, companyName) {
  const results = [];

  // attendre que la liste contacts soit chargée
  await page.waitForSelector('[data-testid="contacts-section"]', { timeout: 20000 });

  const contactCards = await page.locator('[data-testid="contact-card"]').all();

  for (const card of contactCards) {
    const getText = async (selector) => {
      const el = card.locator(selector);
      if (await el.count() === 0) return "";
      return (await el.first().innerText()).trim();
    };

    const fullName = await getText('[data-testid="contact-name"]');
    const role = await getText('[data-testid="contact-role"]');
    const email = await getText('[data-testid="contact-email"]');
    const phone = await getText('[data-testid="contact-phone"]');

    let firstName = "";
    let lastName = "";
    if (fullName.includes(" ")) {
      const parts = fullName.split(" ");
      firstName = parts.shift();
      lastName = parts.join(" ");
    } else {
      firstName = fullName;
    }

    results.push({
      company: companyName,
      firstName,
      lastName,
      role,
      email,
      phone
    });
  }

  return results;
}
