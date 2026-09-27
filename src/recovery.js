const config = require('./config');
const { sleep } = require('./timing');
const refreshLocks = new WeakMap();

async function isHighLoadPage(page) {
  const probe = page.evaluate(() => `${location.href} ${document.body?.innerText || ''}`)
    .then(content => /site is under high load|currently experiencing high demand|system is busy|please try again later|try again later/i.test(content))
    .catch(error => { console.log(`[HIGH_LOAD_PROBE_ERROR] không đọc được trang: ${error.message}`); return false; });
  return Promise.race([probe, sleep(config.highLoadProbeTimeoutMs).then(() => false)]);
}

async function recoverHighLoad(page, label) {
  const previousRefresh = refreshLocks.get(page);
  if (previousRefresh) return previousRefresh;
  const recovery = recoverHighLoadLocked(page, label);
  refreshLocks.set(page, recovery);
  try {
    return await recovery;
  } finally {
    refreshLocks.delete(page);
  }
}

async function recoverHighLoadLocked(page, label) {
  let attempt = 0;
  const batchSize = Math.max(1, config.maxHighLoadRetries);
  while (true) {
    attempt += 1;
    if (!await isHighLoadPage(page)) return false;
    const batchAttempt = ((attempt - 1) % batchSize) + 1;
    const delay = config.highLoadBackoffMs;
    console.log(`[${label}] INZ quá tải (${batchAttempt}/${batchSize}), chuẩn bị refresh sau ${delay}ms; không dừng`);
    await sleep(delay);
    const startedAt = Date.now();
    console.log(`[${label}] HIGH_LOAD_REFRESH_START`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: config.highLoadReloadTimeoutMs })
      .catch(error => console.log(`[${label}] HIGH_LOAD_REFRESH_TIMEOUT ${error.message}`));
    console.log(`[${label}] HIGH_LOAD_REFRESH_DONE duration=${Date.now() - startedAt}ms`);
    const stillHighLoad = await isHighLoadPage(page);
    if (!stillHighLoad) return false;
    if (batchAttempt === batchSize) {
      console.log(`[${label}] HIGH_LOAD_BATCH_COOLDOWN ${config.highLoadCooldownMs}ms`);
      await sleep(config.highLoadCooldownMs);
    }
  }
}

async function waitForManualRecovery(page, label, error) {
  const previousUrl = await page.url();
  const previousMarker = await readManualMarker(page);
  console.log(`[${label}] MANUAL_RECOVERY_WAIT error=${error.message}`);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      page.off('framenavigated', onFrameNavigated);
      page.off('close', onClose);
    };
    const finish = result => { cleanup(); resolve(result); };
    const check = async () => {
      if (page.isClosed()) return;
      try {
        const currentUrl = await page.url();
        const currentMarker = await readManualMarker(page);
        if (currentUrl !== previousUrl || currentMarker !== previousMarker) {
          console.log(`[${label}] MANUAL_RECOVERY_DETECTED url=${currentUrl}`);
          finish(true);
        }
      } catch (checkError) {
        cleanup();
        reject(checkError);
      }
    };
    const onFrameNavigated = frame => { if (frame === page.mainFrame()) finish(true); };
    const onClose = () => { cleanup(); reject(new Error('Chrome page đã bị đóng trong lúc chờ thao tác thủ công.')); };
    const timer = setInterval(check, config.manualRecoveryPollMs);
    page.on('framenavigated', onFrameNavigated);
    page.on('close', onClose);
    check();
  });
}

async function readManualMarker(page) {
  return page.evaluate(() => {
    const body = (document.body?.innerText || '').slice(0, 500);
    const fields = [...document.querySelectorAll('input,select,textarea')]
      .map(element => `${element.name || element.id}:${element.value || ''}:${element.checked ? 'checked' : ''}`)
      .join('|');
    return `${body}\nFORM:${fields}`;
  });
}

module.exports = { isHighLoadPage, recoverHighLoad, waitForManualRecovery };