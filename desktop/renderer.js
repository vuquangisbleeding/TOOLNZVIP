const log = document.querySelector('#log');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const statusText = document.querySelector('#statusText');
const lastEvent = document.querySelector('#lastEvent');
const shell = document.querySelector('.shell');
const applicantInput = document.querySelector('#applicantInput');
const accountsInput = document.querySelector('#accountsInput');
const dataStatus = document.querySelector('#dataStatus');
const telegramToken = document.querySelector('#telegramToken');
const telegramChatId = document.querySelector('#telegramChatId');
const schemeCountry = document.querySelector('#schemeCountry');
const capsolverApiKey = document.querySelector('#capsolverApiKey');
const telegramStatus = document.querySelector('#telegramStatus');
const runTime = document.querySelector('#runTime');
const accountRows = document.querySelector('#accountRows');
const accountRuns = new Map();
let runStartedAt = null;
let logRemainder = '';
let clockTimer = null;

document.querySelector('#profiles').textContent = '-';

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

function renderAccountRows(accounts = []) {
  accountRows.replaceChildren();
  accounts.forEach((account, index) => {
    const row = document.createElement('tr');
    row.id = `account-row-${index + 1}`;
    row.innerHTML = `<td>${account.username}</td><td class="account-state">Waiting</td>`;
    accountRows.appendChild(row);
  });
}

function updateAccountRows() {
  for (const [index, state] of accountRuns) {
    const row = document.querySelector(`#account-row-${index}`);
    if (!row) continue;
    row.querySelector('.account-state').textContent = state.status;
  }
}

function resetRunMonitor() {
  accountRuns.clear();
  runStartedAt = Date.now();
  runTime.textContent = '00:00:00';
  updateAccountRows();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    runTime.textContent = formatDuration(Date.now() - runStartedAt);
    updateAccountRows();
  }, 1000);
}

function finishRunMonitor() {
  for (const state of accountRuns.values()) if (!state.finishedAt) state.finishedAt = Date.now();
  updateAccountRows();
  clearInterval(clockTimer);
  clockTimer = null;
}

function processLogLine(line) {
  const accountMatch = line.match(/\[account (\d+)(?:: ([^\]]+))?\]/);
  if (!accountMatch) return;
  const index = Number(accountMatch[1]);
  const timestampMatch = line.match(/\] \[(\d{4}-\d\d-\d\dT[^\]]+)\]/);
  const timestamp = timestampMatch ? Date.parse(timestampMatch[1]) : Date.now();
  const state = accountRuns.get(index) || { status: 'Waiting' };
  if (line.includes('BROWSER_LAUNCH_START')) { state.startedAt = timestamp; state.status = 'Launching'; }
  else if (line.includes('BROWSER_LAUNCH_READY')) state.status = 'Browser ready';
  else if (line.includes('NAVIGATE ')) {
    const url = line.match(/NAVIGATE (https?:\/\/\S+)/)?.[1];
    if (url && /pay\.aspx|paymentgateway/i.test(url)) { state.paymentUrl = url; state.finishedAt = timestamp; state.status = 'Payment ready'; }
    else if (state.status !== 'Payment ready') state.status = 'Navigating';
  } else if (line.includes('dừng trước trang thanh toán')) { state.finishedAt ||= timestamp; state.status = 'Payment ready'; }
  else if (line.includes('ACCOUNT_ERROR')) state.status = 'Error';
  accountRuns.set(index, state);
  updateAccountRows();
}

function processRunnerOutput(text) {
  logRemainder += text;
  const lines = logRemainder.split('\n');
  logRemainder = lines.pop() || '';
  lines.forEach(processLogLine);
}

function append(text, type = 'stdout') {
  const line = document.createElement('span');
  line.className = type;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  lastEvent.textContent = text.trim().split('\n').pop()?.slice(0, 42) || 'Updated';
}

function setDataStatus(text, type = '') {
  dataStatus.textContent = text;
  dataStatus.className = `data-status ${type}`;
}

function setTelegramStatus(text, type = '') {
  telegramStatus.textContent = text;
  telegramStatus.className = `data-status ${type}`;
}

function setRunning(running) {
  start.disabled = running;
  stop.disabled = !running;
  statusText.textContent = running ? 'Running' : 'Ready';
  shell.classList.toggle('running', running);
  if (running && !runStartedAt) resetRunMonitor();
  if (!running && runStartedAt) finishRunMonitor();
}

async function loadTelegram() {
  try {
    const settings = await window.runnerApi.loadTelegram();
    telegramToken.value = settings.botToken;
    telegramChatId.value = settings.chatId;
    schemeCountry.value = settings.schemeCountry;
    capsolverApiKey.value = settings.capsolverApiKey;
  } catch (error) {
    setTelegramStatus(error.message, 'invalid');
  }
}

async function saveTelegram() {
  try {
    await window.runnerApi.saveTelegram({
      botToken: telegramToken.value.trim(),
      chatId: telegramChatId.value.trim(),
      schemeCountry: schemeCountry.value,
      capsolverApiKey: capsolverApiKey.value.trim()
    });
    setTelegramStatus('Saved', 'valid');
    return true;
  } catch (error) {
    setTelegramStatus(error.message, 'invalid');
    return false;
  }
}

async function testTelegram() {
  try {
    if (!await saveTelegram()) return;
    await window.runnerApi.testTelegram({ botToken: telegramToken.value.trim(), chatId: telegramChatId.value.trim() });
    setTelegramStatus('Test message sent', 'valid');
  } catch (error) {
    setTelegramStatus(error.message, 'invalid');
  }
}

function parseData() {
  const applicant = JSON.parse(applicantInput.value);
  const accounts = JSON.parse(accountsInput.value);
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) throw new Error('Applicant phải là object JSON.');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('Cần ít nhất một tài khoản.');
  for (const [index, account] of accounts.entries()) {
    if (!account?.username || !account?.password || !account?.email) throw new Error(`Tài khoản ${index + 1} thiếu username, password hoặc email.`);
  }
  return { applicant: applicantInput.value, accounts: accountsInput.value, profiles: accounts.length };
}

function checkData() {
  try {
    const data = parseData();
    document.querySelector('#profiles').textContent = String(data.profiles);
    renderAccountRows(JSON.parse(data.accounts));
    setDataStatus(`${data.profiles} account${data.profiles === 1 ? '' : 's'} ready`, 'valid');
    return data;
  } catch (error) {
    setDataStatus(error.message, 'invalid');
    return null;
  }
}

async function loadData() {
  try {
    const data = await window.runnerApi.loadData();
    applicantInput.value = JSON.stringify(JSON.parse(data.applicant), null, 2);
    accountsInput.value = JSON.stringify(JSON.parse(data.accounts), null, 2);
    checkData();
  } catch (error) {
    setDataStatus(error.message, 'invalid');
  }
}

async function saveData(showMessage = true) {
  const data = checkData();
  if (!data) return false;
  try {
    await window.runnerApi.saveData(data);
    if (showMessage) setDataStatus('Saved', 'valid');
    return true;
  } catch (error) {
    setDataStatus(error.message, 'invalid');
    return false;
  }
}

async function importFile(kind) {
  const result = await window.runnerApi.importData(kind);
  if (result.canceled) return;
  if (kind === 'applicant') applicantInput.value = result.content;
  else accountsInput.value = result.content;
  checkData();
}

async function exportFile(kind) {
  try {
    const data = parseData();
    const content = kind === 'applicant' ? data.applicant : data.accounts;
    const result = await window.runnerApi.exportData({ kind, content });
    if (!result.canceled) setDataStatus(`Exported ${kind}.json`, 'valid');
  } catch (error) {
    setDataStatus(error.message, 'invalid');
  }
}

document.querySelector('#saveData').addEventListener('click', () => saveData());
document.querySelector('#saveTelegram').addEventListener('click', saveTelegram);
document.querySelector('#testTelegram').addEventListener('click', testTelegram);
document.querySelector('#importApplicant').addEventListener('click', () => importFile('applicant'));
document.querySelector('#exportApplicant').addEventListener('click', () => exportFile('applicant'));
document.querySelector('#importAccounts').addEventListener('click', () => importFile('accounts'));
document.querySelector('#exportAccounts').addEventListener('click', () => exportFile('accounts'));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab, .tab-panel').forEach(element => element.classList.remove('active'));
  tab.classList.add('active');
  document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
}));
applicantInput.addEventListener('input', checkData);
accountsInput.addEventListener('input', checkData);

start.addEventListener('click', async () => {
  if (!await saveData(false)) {
    append('[app] Không thể chạy: kiểm tra lại dữ liệu input.\n', 'stderr');
    return;
  }
  if (!await saveTelegram()) {
    append('[app] Không thể lưu Telegram settings.\n', 'stderr');
    return;
  }
  resetRunMonitor();
  const result = await window.runnerApi.start();
  if (!result.ok) append(`[app] ${result.message}\n`, 'stderr');
  else append('[app] Runner started\n');
});
stop.addEventListener('click', async () => { await window.runnerApi.stop(); append('[app] Stop requested\n'); });
document.querySelector('#clear').addEventListener('click', () => { log.replaceChildren(); lastEvent.textContent = 'Waiting'; });
window.runnerApi.onOutput(data => { append(data.text, data.type); processRunnerOutput(data.text); });
window.runnerApi.onStatus(data => setRunning(data.running));
window.runnerApi.onExit(data => { setRunning(false); append(`[app] Runner exited with code ${data.code}\n`); });
loadData();
loadTelegram();