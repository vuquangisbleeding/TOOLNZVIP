const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow;
let runnerProcess;

function projectRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
}

function runnerRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : projectRoot();
}

async function dataRoot() {
  const root = app.isPackaged ? app.getPath('userData') : projectRoot();
  await fs.mkdir(root, { recursive: true });
  for (const file of ['applicant.json', 'emails.json', '.env']) {
    const target = path.join(root, file);
    try { await fs.access(target); } catch {
      const source = file === '.env' ? '.env.example' : file;
      await fs.copyFile(path.join(projectRoot(), source), target);
    }
  }
  if (app.isPackaged) {
    const extension = 'CapSolver.Browser.Extension-chrome-v1.7.1';
    const target = path.join(root, extension);
    try { await fs.access(target); } catch { await fs.cp(path.join(process.resourcesPath, extension), target, { recursive: true }); }
  }
  return root;
}

async function readDataFiles() {
  const root = await dataRoot();
  const [applicant, accounts] = await Promise.all([
    fs.readFile(path.join(root, 'applicant.json'), 'utf8'),
    fs.readFile(path.join(root, 'emails.json'), 'utf8')
  ]);
  return { applicant, accounts };
}

async function listLogFiles() {
  const root = await dataRoot();
  const logsRoot = path.join(root, 'logs');
  await fs.mkdir(logsRoot, { recursive: true });
  const entries = await fs.readdir(logsRoot, { withFileTypes: true });
  const files = await Promise.all(entries.filter(entry => entry.isFile() && entry.name.endsWith('.log')).map(async entry => {
    const filePath = path.join(logsRoot, entry.name);
    const stats = await fs.stat(filePath);
    return { name: entry.name, size: stats.size, modifiedAt: stats.mtimeMs };
  }));
  return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

async function readLogFile(_event, name) {
  if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.log')) {
    throw new Error('Tên log không hợp lệ.');
  }
  const root = await dataRoot();
  return fs.readFile(path.join(root, 'logs', name), 'utf8');
}

async function listLogResults() {
  const files = await listLogFiles();
  const accountFiles = files.filter(file => /-account-\d+-[^/]+\.log$/.test(file.name));
  const results = [];
  for (const file of accountFiles) {
    const content = await readLogFile(null, file.name);
    const accountMatch = file.name.match(/-account-(\d+)-(.+)\.log$/);
    const account = accountMatch ? Number(accountMatch[1]) : 0;
    const username = accountMatch ? accountMatch[2] : '-';
    const timestamp = line => line.match(/\] \[(\d{4}-\d\d-\d\dT[^\]]+)\]/)?.[1];
    const lines = content.split('\n');
    const startLine = lines.find(line => /SELECT_COUNTRY .*\bOPEN\b/i.test(line));
    const finishLine = lines.find(line => /ACCOUNT_FINISHED|PAYMENT_LINK|ACCOUNT_ERROR/.test(line)) || lines.at(-2) || '';
    const startedAt = startLine ? Date.parse(timestamp(startLine)) : null;
    const finishedAt = finishLine ? Date.parse(timestamp(finishLine)) : null;
    const paymentUrl = content.match(/PAYMENT_LINK (https?:\/\/\S+)/)?.[1] || null;
    const status = paymentUrl ? 'Payment ready' : finishLine.match(/ACCOUNT_FINISHED status=([^ ]+)/)?.[1] || (finishLine.includes('ACCOUNT_ERROR') ? 'Error' : 'Incomplete');
    results.push({ run: file.name.match(/^run-([^]+?)-account-/)?.[1] || file.name, account, username, startedAt, finishedAt, durationMs: startedAt && finishedAt ? finishedAt - startedAt : null, status, paymentUrl });
  }
  return results.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
}

async function readTelegramSettings() {
  const root = await dataRoot();
  const envFile = path.join(root, '.env');
  const content = await fs.readFile(envFile, 'utf8');
  const readValue = key => content.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] || '';
  const extensionPath = readValue('CAPSOLVER_EXTENSION_PATH') || 'CapSolver.Browser.Extension-chrome-v1.7.1';
  const extensionRoot = path.isAbsolute(extensionPath) ? extensionPath : path.join(root, extensionPath);
  const capsolverConfig = await fs.readFile(path.join(extensionRoot, 'assets', 'config.js'), 'utf8');
  const capsolverApiKey = capsolverConfig.match(/apiKey\s*:\s*(['"])(.*?)\1/)?.[2]?.trim() || '';
  return {
    botToken: readValue('TELEGRAM_BOT_TOKEN'),
    chatId: readValue('TELEGRAM_CHAT_ID'),
    schemeCountry: readValue('SCHEME_COUNTRY'),
    capsolverApiKey
  };
}

async function saveTelegramSettings(_event, { botToken, chatId, schemeCountry }) {
  const root = await dataRoot();
  const file = path.join(root, '.env');
  let content = await fs.readFile(file, 'utf8');
  const values = {
    TELEGRAM_BOT_TOKEN: botToken || '',
    TELEGRAM_CHAT_ID: chatId || '',
    SCHEME_COUNTRY: (schemeCountry || '').trim().toUpperCase()
  };
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
  }
  await fs.writeFile(file, content);
  return { ok: true };
}

async function sendTelegramTest(_event, { botToken, chatId }) {
  if (!botToken || !chatId) throw new Error('Nhập TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID trước.');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: 'INZ Runner test message: Telegram kết nối thành công.' })
  });
  if (!response.ok) throw new Error(`Telegram trả về HTTP ${response.status}`);
  return { ok: true };
}

function validateData(applicantText, accountsText) {
  let applicant;
  let accounts;
  try { applicant = JSON.parse(applicantText); } catch { throw new Error('applicant.json không phải JSON hợp lệ.'); }
  try { accounts = JSON.parse(accountsText); } catch { throw new Error('emails.json không phải JSON hợp lệ.'); }
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) throw new Error('applicant.json phải là một object JSON.');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('emails.json phải có ít nhất một tài khoản.');
  for (const [index, account] of accounts.entries()) {
    if (!account || typeof account !== 'object' || !account.username || !account.password || !account.email) {
      throw new Error(`Tài khoản ${index + 1} cần username, password và email.`);
    }
  }
  return { applicant, accounts };
}

async function saveData(_event, { applicant, accounts }) {
  const parsed = validateData(applicant, accounts);
  const root = await dataRoot();
  await Promise.all([
    fs.writeFile(path.join(root, 'applicant.json'), `${JSON.stringify(parsed.applicant, null, 2)}\n`),
    fs.writeFile(path.join(root, 'emails.json'), `${JSON.stringify(parsed.accounts, null, 2)}\n`)
  ]);
  return { ok: true, profiles: parsed.accounts.length };
}

async function importData(_event, kind) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, content: await fs.readFile(result.filePaths[0], 'utf8'), kind };
}

async function exportData(_event, { kind, content }) {
  const defaultName = kind === 'applicant' ? 'applicant.json' : 'emails.json';
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const parsed = JSON.parse(content);
  await fs.writeFile(result.filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return { canceled: false, path: result.filePath };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#10151d',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function send(channel, data) {
  if (!mainWindow?.isDestroyed()) mainWindow.webContents.send(channel, data);
}

async function startRunner() {
  if (runnerProcess) return { ok: false, message: 'Runner đang chạy.' };
  const root = runnerRoot();
  const writableRoot = await dataRoot();
  const packagedModules = path.join(process.resourcesPath, 'app.asar', 'node_modules');
  const modulePath = app.isPackaged ? packagedModules : path.join(projectRoot(), 'node_modules');
  runnerProcess = spawn(process.execPath, [path.join(root, 'src', 'runner.js')], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      INZ_DATA_ROOT: writableRoot,
      NODE_PATH: [modulePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  send('runner-status', { running: true });
  const forward = type => chunk => send('runner-output', { type, text: chunk.toString() });
  runnerProcess.stdout.on('data', forward('stdout'));
  runnerProcess.stderr.on('data', forward('stderr'));
  runnerProcess.on('close', code => {
    send('runner-exit', { code });
    runnerProcess = null;
    send('runner-status', { running: false });
  });
  runnerProcess.on('error', error => send('runner-output', { type: 'stderr', text: `${error.message}\n` }));
  return { ok: true };
}

function stopRunner() {
  if (!runnerProcess) return { ok: false, message: 'Runner chưa chạy.' };
  runnerProcess.kill();
  return { ok: true };
}

app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('runner-start', startRunner);
  ipcMain.handle('runner-stop', stopRunner);
  ipcMain.handle('data-load', readDataFiles);
  ipcMain.handle('logs-list', listLogFiles);
  ipcMain.handle('logs-read', readLogFile);
  ipcMain.handle('logs-results', listLogResults);
  ipcMain.handle('data-save', saveData);
  ipcMain.handle('telegram-load', readTelegramSettings);
  ipcMain.handle('telegram-save', saveTelegramSettings);
  ipcMain.handle('telegram-test', sendTelegramTest);
  ipcMain.handle('data-import', importData);
  ipcMain.handle('data-export', exportData);
  ipcMain.handle('runner-open-folder', () => dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] }));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (runnerProcess) runnerProcess.kill(); });