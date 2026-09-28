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
const nameFilter = document.querySelector('#nameFilter');
const logFiles = document.querySelector('#logFiles');
const logFilter = document.querySelector('#logFilter');
const historicalLog = document.querySelector('#historicalLog');
const selectedLogName = document.querySelector('#selectedLogName');
const selectedLogSize = document.querySelector('#selectedLogSize');
const historicalResults = document.querySelector('#historicalResults');
const formEditor = document.querySelector('#formEditor');
const jsonEditor = document.querySelector('#jsonEditor');
const formMode = document.querySelector('#formMode');
const jsonMode = document.querySelector('#jsonMode');
const accountsFormRows = document.querySelector('#accountsFormRows');
const addAccount = document.querySelector('#addAccount');
const accountRuns = new Map();
let dataMode = 'form';
let runStartedAt = null;
let logRemainder = '';
let clockTimer = null;

document.querySelector('#profiles').textContent = '-';

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

function formatTimestamp(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString('vi-VN') : '-';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object) ?? '';
}

function writePath(object, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => current[key] ||= {}, object);
  target[lastKey] = value;
}

function proxyFormValue(proxy) {
  return typeof proxy === 'object' && proxy !== null ? proxy.server || '' : proxy || '';
}

function renderForm(applicant, accounts) {
  formEditor.querySelectorAll('[data-path]').forEach(input => {
    input.value = readPath(applicant, input.dataset.path);
  });
  accountsFormRows.replaceChildren();
  accounts.forEach((account, index) => {
    const row = document.createElement('div');
    row.className = 'account-form-row';
    row.dataset.index = index;
    [['username', 'Username'], ['password', 'Password'], ['email', 'Email'], ['proxy', 'Proxy (optional)']].forEach(([key, label]) => {
      const field = document.createElement('label');
      field.textContent = label;
      const input = document.createElement('input');
      input.dataset.accountField = key;
      input.type = key === 'password' ? 'password' : key === 'email' ? 'email' : 'text';
      input.value = key === 'proxy' ? proxyFormValue(account[key]) : account[key] || '';
      if (key === 'proxy' && account[key] && typeof account[key] === 'object') {
        input.dataset.proxyCredentials = JSON.stringify({
          username: account[key].username || '',
          password: account[key].password || ''
        });
      }
      field.appendChild(input);
      row.appendChild(field);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-button danger-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => row.remove());
    row.appendChild(remove);
    accountsFormRows.appendChild(row);
  });
}

function syncFormToJson() {
  const applicant = JSON.parse(applicantInput.value || '{}');
  formEditor.querySelectorAll('[data-path]').forEach(input => writePath(applicant, input.dataset.path, input.value.trim()));
  const accounts = [...accountsFormRows.querySelectorAll('.account-form-row')].map(row => {
    const account = {};
    row.querySelectorAll('[data-account-field]').forEach(input => {
      const value = input.value.trim();
      if (value === '') return;
      if (input.dataset.accountField === 'proxy' && input.dataset.proxyCredentials) {
        const credentials = JSON.parse(input.dataset.proxyCredentials);
        account.proxy = { server: value, ...credentials };
      } else account[input.dataset.accountField] = value;
    });
    return account;
  });
  applicantInput.value = JSON.stringify(applicant, null, 2);
  accountsInput.value = JSON.stringify(accounts, null, 2);
}

function setDataMode(mode) {
  dataMode = mode;
  const formActive = mode === 'form';
  formEditor.hidden = !formActive;
  jsonEditor.hidden = formActive;
  formMode.classList.toggle('active', formActive);
  jsonMode.classList.toggle('active', !formActive);
  if (formActive) {
    try { renderForm(JSON.parse(applicantInput.value), JSON.parse(accountsInput.value)); } catch {}
  }
}

function setFormTab(section) {
  document.querySelectorAll('.form-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.formTab === section));
  document.querySelectorAll('[data-form-section]').forEach(panel => panel.classList.toggle('active', panel.dataset.formSection === section));
}

let archivedLogs = [];

function renderArchivedLogs() {
  const wanted = logFilter.value.trim().toLowerCase();
  logFiles.replaceChildren();
  archivedLogs.filter(file => file.name.toLowerCase().includes(wanted)).forEach(file => {
    const button = document.createElement('button');
    button.className = 'log-file';
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = file.name;
    const meta = document.createElement('span');
    meta.textContent = `${formatTimestamp(file.modifiedAt)} · ${formatFileSize(file.size)}`;
    button.append(title, meta);
    button.addEventListener('click', () => loadArchivedLog(file, button));
    logFiles.appendChild(button);
  });
  if (!logFiles.children.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Không tìm thấy log.';
    logFiles.appendChild(empty);
  }
}

async function loadArchivedLog(file, button) {
  try {
    const content = await window.runnerApi.readLog(file.name);
    document.querySelectorAll('.log-file.selected').forEach(item => item.classList.remove('selected'));
    button.classList.add('selected');
    selectedLogName.textContent = file.name;
    selectedLogSize.textContent = `${formatFileSize(file.size)} · ${formatTimestamp(file.modifiedAt)}`;
    historicalLog.textContent = content;
    historicalLog.scrollTop = 0;
  } catch (error) {
    selectedLogName.textContent = 'Không thể đọc log';
    historicalLog.textContent = error.message;
  }
}

async function loadArchivedLogs() {
  try {
    archivedLogs = await window.runnerApi.listLogs();
    renderArchivedLogs();
    await loadHistoricalResults();
  } catch (error) {
    logFiles.textContent = error.message;
  }
}

async function loadHistoricalResults() {
  try {
    const results = await window.runnerApi.listLogResults();
    historicalResults.replaceChildren();
    results.forEach(result => {
      const row = document.createElement('tr');
      const values = [
        result.run, `account ${result.account}`, result.username,
        formatTimestamp(result.startedAt), formatTimestamp(result.finishedAt),
        result.durationMs ? formatDuration(result.durationMs) : '-', result.status
      ];
      values.forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value || '-';
        row.appendChild(cell);
      });
      const paymentCell = document.createElement('td');
      if (result.paymentUrl) {
        const link = document.createElement('a');
        link.href = result.paymentUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = 'Open payment';
        paymentCell.appendChild(link);
      } else paymentCell.textContent = '-';
      row.appendChild(paymentCell);
      historicalResults.appendChild(row);
    });
  } catch (error) {
    historicalResults.textContent = error.message;
  }
}

function renderAccountRows(accounts = []) {
  accountRows.replaceChildren();
  accounts.forEach((account, index) => {
    const row = document.createElement('tr');
    row.id = `account-row-${index + 1}`;
    row.dataset.name = String(account.fullName || '').toLowerCase();
    [
      `account ${index + 1}`, account.username, account.email, account.fullName,
      account.passport, '-', '-', '-', 'Waiting', '-'
    ].forEach((value, cellIndex) => {
      const cell = document.createElement('td');
      if (cellIndex === 8) cell.className = 'account-state';
      cell.textContent = value || '-';
      row.appendChild(cell);
    });
    accountRows.appendChild(row);
  });
  updateAccountRows();
}

function updateAccountRows() {
  for (const [index, state] of accountRuns) {
    const row = document.querySelector(`#account-row-${index}`);
    if (!row) continue;
    const cells = row.querySelectorAll('td');
    cells[5].textContent = formatTimestamp(state.startedAt);
    cells[6].textContent = formatTimestamp(state.finishedAt);
    cells[7].textContent = state.startedAt && state.finishedAt ? formatDuration(state.finishedAt - state.startedAt) : '-';
    row.querySelector('.account-state').textContent = state.status || 'Waiting';
    cells[9].replaceChildren();
    if (state.paymentUrl) {
      const link = document.createElement('a');
      link.href = state.paymentUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Open payment';
      cells[9].appendChild(link);
    } else cells[9].textContent = '-';
  }
  const wanted = nameFilter.value.trim().toLowerCase();
  document.querySelectorAll('#accountRows tr').forEach(row => {
    row.hidden = Boolean(wanted) && !row.dataset.name.includes(wanted);
  });
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
  if (line.includes('BROWSER_LAUNCH_START')) { state.launchStartedAt = timestamp; state.status = 'Launching'; }
  else if (line.includes('SELECT_COUNTRY ') && /\bOPEN\b/i.test(line)) { state.startedAt = timestamp; state.status = 'Country open'; }
  else if (line.includes('BROWSER_LAUNCH_READY')) state.status = 'Browser ready';
  else if (line.includes('NAVIGATE ')) {
    const url = line.match(/NAVIGATE (https?:\/\/\S+)/)?.[1];
    if (url && /pay\.aspx|paymentgateway/i.test(url)) { state.paymentUrl = url; state.finishedAt = timestamp; state.status = 'Payment ready'; }
    else if (state.status !== 'Payment ready') state.status = 'Navigating';
  } else if (line.includes('dừng trước trang thanh toán')) { state.finishedAt ||= timestamp; state.status = 'Payment ready'; }
  else if (line.includes('PAYMENT_LINK ')) {
    state.paymentUrl = line.match(/PAYMENT_LINK (https?:\/\/\S+)/)?.[1] || state.paymentUrl;
    state.finishedAt ||= timestamp;
    state.status = 'Payment ready';
  }
  else if (line.includes('ACCOUNT_FINISHED')) {
    state.finishedAt = timestamp;
    state.status = line.match(/ACCOUNT_FINISHED status=([^ ]+)/)?.[1] || 'Finished';
  }
  else if (line.includes('ACCOUNT_ERROR')) state.status = 'Error';
  if (/ACCOUNT_ERROR|lỗi:|RUN_FINISHED/.test(line)) state.finishedAt ||= timestamp;
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
      schemeCountry: schemeCountry.value
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
    const applicant = JSON.parse(data.applicant);
    const accounts = JSON.parse(data.accounts);
    renderForm(applicant, accounts);
    renderAccountRows(accounts.map(account => ({
      ...account,
      fullName: [applicant.personal?.given_name_1, applicant.personal?.family_name].filter(Boolean).join(' '),
      passport: applicant.identification?.passport_number
    })));
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
  if (dataMode === 'form') syncFormToJson();
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
formMode.addEventListener('click', () => setDataMode('form'));
document.querySelectorAll('.form-tab').forEach(tab => tab.addEventListener('click', () => setFormTab(tab.dataset.formTab)));
jsonMode.addEventListener('click', () => {
  if (dataMode === 'form') syncFormToJson();
  setDataMode('json');
});
addAccount.addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'account-form-row';
  [['username', 'Username'], ['password', 'Password'], ['email', 'Email'], ['proxy', 'Proxy (optional)']].forEach(([key, label]) => {
    const field = document.createElement('label');
    field.textContent = label;
    const input = document.createElement('input');
    input.dataset.accountField = key;
    input.type = key === 'password' ? 'password' : key === 'email' ? 'email' : 'text';
    field.appendChild(input);
    row.appendChild(field);
  });
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'small-button danger-button'; remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());
  row.appendChild(remove); accountsFormRows.appendChild(row);
});
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
nameFilter.addEventListener('input', updateAccountRows);

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
document.querySelector('#refreshLogs').addEventListener('click', loadArchivedLogs);
logFilter.addEventListener('input', renderArchivedLogs);
window.runnerApi.onOutput(data => { append(data.text, data.type); processRunnerOutput(data.text); });
window.runnerApi.onStatus(data => setRunning(data.running));
window.runnerApi.onExit(data => { setRunning(false); append(`[app] Runner exited with code ${data.code}\n`); });
loadData();
loadArchivedLogs();
loadTelegram();