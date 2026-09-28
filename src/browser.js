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

async function launchBrowser(args, index, proxy) {
  const profilePath = path.join(config.profileRoot, `account-${index + 1}`);
  await fs.mkdir(profilePath, { recursive: true });
  const normalizedProxy = normalizeProxy(proxy);
  const launchArgs = [...args];
  if (normalizedProxy) launchArgs.push(`--proxy-server=${normalizedProxy.server}`);
  console.log(`[account ${index + 1}] Chrome profile: ${profilePath}`);
  if (normalizedProxy) console.log(`[account ${index + 1}] Proxy: ${normalizedProxy.server}`);
  return puppeteer.launch({ headless: config.headless, executablePath: config.chromeExecutablePath, userDataDir: profilePath, args: launchArgs, defaultViewport: null });
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

async function clearCapSolverStoredConfig(browser, extensionId) {
  const extensionPrefix = `chrome-extension://${extensionId}`;
  let extensionTarget = browser.targets().find(target => target.url().startsWith(extensionPrefix));
  if (!extensionTarget) {
    extensionTarget = await browser.waitForTarget(target => target.url().startsWith(extensionPrefix), { timeout: 15000 });
  }
  const worker = await extensionTarget.worker();
  if (!worker) throw new Error('CapSolver service worker chưa sẵn sàng');
  await worker.evaluate(async () => {
    await chrome.storage.local.remove('defaultConfig');
  });
  console.log('CapSolver stored defaultConfig đã được xóa; extension sẽ đọc apiKey từ assets/config.js');
}

async function getSinglePage(browser) {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await Promise.all(pages.slice(1).map(extraPage => extraPage.close().catch(() => {})));
  return page;
}

module.exports = { launchBrowser, authenticateProxy, configureProxyAuthentication, clearCapSolverStoredConfig, getSinglePage, normalizeProxy, maskApiKey };