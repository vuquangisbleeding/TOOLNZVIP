const config = require('./config');
const textSelectors = require('./selectors/text');
const { firstExisting } = require('./dom');
const { clickFirstControl, clickLabeled } = require('./actions');
const { recoverHighLoad } = require('./recovery');
const { pauseForCaptcha } = require('./captcha');
const { watchActionProgress } = require('./timing');
const { waitForManualRecovery } = require('./recovery');

async function selectSchemeCountry(page, country, label, stats) {
  let attempt = 0;
  while (true) {
    attempt += 1; const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    const result = await page.evaluate(wanted => {
      const normalized = wanted.trim().toLowerCase();
      const name = [...document.querySelectorAll("[id^='ContentPlaceHolder1_countryRepeater_countryName_']")].find(element => element.textContent.trim().toLowerCase() === normalized);
      if (!name) return { found: false, open: false, cardText: '' };
      const suffix = name.id.split('_').pop(); const status = document.getElementById(`ContentPlaceHolder1_countryRepeater_countryStatus_${suffix}`);
      const link = document.getElementById(`ContentPlaceHolder1_countryRepeater_createLink_${suffix}`); const card = link?.closest('.category-item') || name.parentElement;
      const cardText = (card?.innerText || '').replace(/\s+/g, ' ').trim();
      if (!link || !/\bopen\b/i.test(status?.textContent || '') || /\bclosed\b/i.test(status?.textContent || '')) return { found: true, open: false, cardText };
      return { found: true, open: true, cardText, linkId: link.id };
    }, country);
    if (result.open) {
      const selectedAt = Date.now();
      console.log(`[${label}] SELECT_COUNTRY ${country} (${result.cardText})`);
      const progress = watchActionProgress(page, previousUrl, previousMarker, label);
      await page.evaluate(linkId => document.getElementById(linkId)?.click(), result.linkId);
      await progress;
      await recoverHighLoad(page, label); await pauseForCaptcha(page, label, stats); return selectedAt;
    }
    console.log(`[${label}] ${country} chưa OPEN (lần ${attempt}: ${result.cardText || 'chưa xuất hiện'}), refresh sau ${config.countryPollMs}ms`);
    await new Promise(resolve => setTimeout(resolve, config.countryPollMs)); await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await recoverHighLoad(page, label);
    await pauseForCaptcha(page, label, stats);
  }
}

async function continueToApplication(page, applicant, label, stats) {
  await page.waitForFunction(() => Boolean(document.querySelector('[id^="ContentPlaceHolder1_countryRepeater_countryName_"], #ContentPlaceHolder1_applyNowButton, [id^="ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_"], [id$="familyNameTextBox"]') || [...document.querySelectorAll('a,button,input')].some(node => /existing|continue|resume|apply now/i.test(`${node.textContent} ${node.value} ${node.href}`))), { timeout: 30000 }).catch(() => {});
  if (/wizard/i.test(await page.url()) || await firstExisting(page, textSelectors.familyName)) return;
  const existing = await page.$("a[id^='ContentPlaceHolder1_applicationList_applicationsDataGrid_editHyperLink_']");
  if (existing) {
    console.log(`[${label}] EXISTING_APPLICATION_DETECTED hồ sơ cũ đang tồn tại; hãy xoá hồ sơ cũ để tiếp tục`);
    await waitForManualRecovery(page, label, new Error('Hồ sơ cũ đang tồn tại. Đang chờ người dùng xoá hồ sơ cũ.'));
    return continueToApplication(page, applicant, label, stats);
  }
  const country = config.schemeCountry || applicant.scheme_country;
  if (await page.$("[id^='ContentPlaceHolder1_countryRepeater_countryName_']")) {
    if (!country) throw new Error('Chưa cấu hình scheme country');
    const selectedAt = await selectSchemeCountry(page, country, label, stats);
    if (await clickFirstControl(page, ['#ContentPlaceHolder1_applyNowButton'], label, stats) || await clickLabeled(page, ['APPLY NOW'], [], label, stats)) return { startedAt: selectedAt };
  }
  const apply = await page.$('#ContentPlaceHolder1_applyNowButton');
  if (apply) {
    const previousUrl = await page.url();
    const previousMarker = await page.evaluate(() => (document.body?.innerText || '').slice(0, 500));
    const progress = watchActionProgress(page, previousUrl, previousMarker, label);
    await page.evaluate(element => element.click(), apply);
    await progress;
    await recoverHighLoad(page, label);
    return { startedAt: Date.now() };
  }
  throw new Error(`Không tìm thấy entry hồ sơ sau login. ${(await page.evaluate(() => document.body?.innerText || '')).slice(0, 250)}`);
}

module.exports = { continueToApplication };