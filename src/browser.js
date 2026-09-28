const puppeteer = require('puppeteer');
const config = require('./config');
const { fs, path } = require('./io');

function normalizeProxy(proxy) {
  if (!proxy) return null;
  const input = typeof proxy === 'string' ? { server: proxy } : proxy;
  if (!input.server || typeof input.server !== 'string') throw new Error('proxy phải là chuỗi hoặc object có server');
  const parsed = new URL(input.server.includes('://') ? input.server : `http://${input.server}`);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || !port) throw new Error(`Proxy không hợp lệ: ${input.server}`);
  return {
    server: `${parsed.protocol}//${parsed.hostname}:${port}`,
    username: input.username || (parsed.username ? decodeURIComponent(parsed.username) : ''),
    password: input.password || (parsed.password ? decodeURIComponent(parsed.password) : '')
  };
}

function maskApiKey(apiKey) {
  const value = String(apiKey || '');
  if (value.length <= 10) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 8)}...${value.slice(-5)}`;
}

async function launchBrowser(args, index, proxy, apiKey) {
  const profilePath = path.join(config.profileRoot, `account-${index + 1}`);
  await fs.mkdir(profilePath, { recursive: true });
  if (config.capsolverExtensionPath) await clearCapSolverProfileStorage(profilePath);
  const normalizedProxy = normalizeProxy(proxy);
  const launchArgs = [...args];
  if (normalizedProxy) launchArgs.push(`--proxy-server=${normalizedProxy.server}`);
  console.log(`[account ${index + 1}] Chrome profile: ${profilePath}`);
  if (normalizedProxy) console.log(`[account ${index + 1}] Proxy: ${normalizedProxy.server}`);
  const browser = await puppeteer.launch({ headless: config.headless, executablePath: config.chromeExecutablePath, userDataDir: profilePath, args: launchArgs, defaultViewport: null });
  if (apiKey) await configureCapSolverApiKey(browser, apiKey);
  return browser;
}

async function configureCapSolverApiKey(browser, apiKey) {
  const extensionTarget = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'), { timeout: 10000 }).catch(() => null);
  if (!extensionTarget) throw new Error('CapSolver extension không khởi động được: không tìm thấy service worker');
  const extensionId = new URL(extensionTarget.url()).hostname;
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/www/index.html#/popup`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.evaluate(key => new Promise((resolve, reject) => {
      chrome.storage.local.get('config', result => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        chrome.storage.local.set({ config: { ...(result.config || {}), apiKey: key } }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }), apiKey);
    console.log(`[CapSolver] Đã ghi key vào storage của extension ${extensionId}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function clearCapSolverProfileStorage(profilePath) {
  const storagePath = path.join(profilePath, 'Default', 'Local Extension Settings');
  await fs.rm(storagePath, { recursive: true, force: true });
  console.log(`[CapSolver] Đã xóa storage local của profile: ${storagePath}`);
}

async function authenticateProxy(page, proxy) {
  const normalizedProxy = normalizeProxy(proxy);
  if (normalizedProxy?.username || normalizedProxy?.password) {
    await page.authenticate({ username: normalizedProxy.username, password: normalizedProxy.password });
  }
}

async function configureProxyAuthentication(browser, proxy) {
  const normalizedProxy = normalizeProxy(proxy);
  if (!normalizedProxy?.username && !normalizedProxy?.password) return;
  const credentials = { username: normalizedProxy.username, password: normalizedProxy.password };
  const applyCredentials = page => page.authenticate(credentials).catch(() => {});
  await Promise.all((await browser.pages()).map(applyCredentials));
  browser.on('targetcreated', target => {
    if (target.type() === 'page') target.page().then(applyCredentials).catch(() => {});
  });
}

async function getSinglePage(browser) {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await Promise.all(pages.slice(1).map(extraPage => extraPage.close().catch(() => {})));
  return page;
}

module.exports = { launchBrowser, authenticateProxy, configureProxyAuthentication, getSinglePage, normalizeProxy, maskApiKey };