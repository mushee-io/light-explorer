const EXPECTED_CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';
const contentEl = document.querySelector('#content');
const searchForm = document.querySelector('#searchForm');
const searchInput = document.querySelector('#searchInput');
const footerEndpoint = document.querySelector('#footerEndpoint');
const drawer = document.querySelector('#statusDrawer');
const drawerContent = document.querySelector('#drawerContent');
const networkPill = document.querySelector('.network-pill');

let lastStatus = null;
let refreshTimer = null;
let homeBusy = false;

const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[c]));

const short = (value='', a=9, b=7) => {
  const s = String(value || '');
  return !s ? '—' : s.length <= a+b+3 ? s : s.slice(0,a) + '…' + s.slice(-b);
};

const num = value =>
  value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString();

const date = value => {
  if (!value) return '—';
  const raw = String(value);
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + 'Z');
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
};

const age = value => {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 60000) return Math.max(1, Math.round(ms/1000)) + 's ago';
  if (ms < 3600000) return Math.round(ms/60000) + 'm ago';
  return Math.round(ms/3600000) + 'h ago';
};

const bytes = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'Unlimited';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(2) + ' MB';
};

const pct = (used,max) => {
  if (!Number.isFinite(+used) || !Number.isFinite(+max) || +max <= 0) return '—';
  return Math.min(100,(+used/+max)*100).toFixed(1) + '%';
};

function setNetworkPill(mode='live') {
  if (!networkPill) return;
  if (mode === 'cache') {
    networkPill.innerHTML = '<span class="dot warn"></span> Degraded';
    networkPill.title = 'Showing the last good snapshot while live Ultra endpoints recover.';
  } else if (mode === 'offline') {
    networkPill.innerHTML = '<span class="dot warn"></span> Offline';
    networkPill.title = 'The explorer shell is available offline. Live chain data needs connectivity.';
  } else {
    networkPill.innerHTML = '<span class="dot"></span> Testnet Live';
    networkPill.title = 'Connected to Ultra Testnet.';
  }
}

async function api(params='') {
  const response = await fetch('/api/ultra?' + params);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || 'Request failed');
  updateStatus(data);
  return data;
}

function updateStatus(data) {
  lastStatus = data;
  const endpoint = data.endpoint || data.hyperionEndpoint || '';
  const clean = endpoint.replace(/^https?:\/\//,'');
  if (data.degraded || data.source === 'cache') {
    setNetworkPill('cache');
    footerEndpoint.textContent = 'Cached snapshot · ' + (age(data.cachedAt) || 'degraded mode');
  } else {
    setNetworkPill(navigator.onLine ? 'live' : 'offline');
    footerEndpoint.textContent = clean ? 'Live via ' + clean : 'Ultra Testnet live';
  }
}

function setLoading(label='Loading Ultra Testnet…') {
  contentEl.innerHTML = '<div class="loading"><div><div class="eyebrow">LIVE DATA</div><p>' +
    esc(label) + '</p></div></div>';
}

function setError(error) {
  contentEl.innerHTML = '<div class="error"><div><strong>Ultra Testnet data is unavailable right now.</strong><div>' +
    esc(error.message || error) +
    '</div><p style="font-size:11px">The explorer will automatically retry public Ultra endpoints. Previously loaded pages remain available from the local last-good cache for up to six hours.</p><button class="back" data-retry style="margin-top:12px">Retry now</button></div></div>';
}

function backButton() {
  return '<button class="back" data-home>← Explorer home</button>';
}

function cacheNotice(payload) {
  if (!payload?.degraded) return '';
  return '<div class="degraded-banner"><strong>Degraded mode</strong><span>Live upstreams did not answer. Showing the last good snapshot from ' +
    esc(date(payload.cachedAt)) + '.</span></div>';
}

function statusBadge(ok, latency) {
  return '<span class="health-badge ' + (ok ? 'up' : 'down') + '">' +
    (ok ? 'UP' + (latency ? ' · ' + latency + 'ms' : '') : 'DOWN') + '</span>';
}

function renderHealthMini(health={}) {
  const chain = health.chain || [];
  const hyperion = health.hyperion || [];
  const rows = [...chain, ...hyperion];
  return '<div class="health-list">' + rows.map(x =>
    '<div class="health-row"><div><span class="health-dot ' + (x.ok ? 'up' : 'down') + '"></span><strong>' +
    esc(x.endpoint.replace(/^https?:\/\//,'')) + '</strong><small>' +
    (x.kind === 'chain' ? 'Chain API' : 'Hyperion') + '</small></div>' +
    statusBadge(x.ok, x.latencyMs) + '</div>'
  ).join('') + '</div>';
}

function actionParts(item={}) {
  const trace = item.action_trace || {};
  const act = item.act || trace.act || {};
  return {
    act,
    tx: item.trx_id || item.transaction_id || trace.trx_id || '',
    block: item.block_num || trace.block_num || '',
    timestamp: item['@timestamp'] || item.timestamp || item.block_time || trace.block_time || ''
  };
}

function actionView(item) {
  const {act, tx, block, timestamp} = actionParts(item);
  const auth = (act.authorization || []).map(x => x.actor + '@' + x.permission).join(', ');
  return '<div class="action"><div class="action-top"><span class="badge">' +
    esc(act.account || 'contract') + '</span><span class="action-name">' +
    esc(act.name || 'action') + '</span>' +
    (tx ? '<button class="link mono" data-tx="' + esc(tx) + '">' + esc(short(tx,10,8)) + '</button>' : '') +
    '</div><div class="action-meta">' +
    (block ? '<button class="link" data-block="' + esc(block) + '">Block #' + esc(block) + '</button>' : '') +
    '<span>' + esc(date(timestamp)) + '</span>' +
    (auth ? '<span>Auth: ' + esc(auth) + '</span>' : '') +
    '</div>' +
    (act.data ? '<pre>' + esc(JSON.stringify(act.data,null,2)) + '</pre>' : '') + '</div>';
}

function renderTransfers(actions=[]) {
  if (!actions.length) return '<div class="empty compact">No recent UOS transfers returned.</div>';
  return '<div class="activity-list">' + actions.map(item => {
    const {act, tx, block, timestamp} = actionParts(item);
    const d = act.data || {};
    return '<div class="activity-row"><div class="activity-icon">U</div><div class="activity-main"><div><strong>' +
      esc(d.from || '—') + '</strong><span>→</span><strong>' + esc(d.to || '—') +
      '</strong></div><small>' + esc(d.memo || 'UOS transfer') + ' · ' + esc(date(timestamp)) + '</small></div>' +
      '<div class="activity-side"><strong>' + esc(d.quantity || '—') + '</strong>' +
      (tx ? '<button class="link mono" data-tx="' + esc(tx) + '">' + esc(short(tx,7,5)) + '</button>' :
        (block ? '<button class="link" data-block="' + esc(block) + '">#' + esc(block) + '</button>' : '')) +
      '</div></div>';
  }).join('') + '</div>';
}

function compactData(data={}) {
  const keys = Object.keys(data).slice(0,4);
  return keys.map(k => {
    const v = data[k];
    const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return k + ': ' + short(display,18,8);
  }).join(' · ');
}

function renderUniqs(actions=[]) {
  if (!actions.length) return '<div class="empty compact">No recent Uniq activity returned.</div>';
  return '<div class="activity-list">' + actions.map(item => {
    const {act, tx, timestamp} = actionParts(item);
    return '<div class="activity-row"><div class="activity-icon uniq">◇</div><div class="activity-main"><div><strong>' +
      esc(act.name || 'Uniq action') + '</strong><span class="badge">eosio.nft.ft</span></div><small>' +
      esc(compactData(act.data || {}) || 'NFT contract activity') + ' · ' + esc(date(timestamp)) + '</small></div>' +
      '<div class="activity-side">' + (tx ? '<button class="link mono" data-tx="' + esc(tx) + '">' +
      esc(short(tx,7,5)) + '</button>' : '') + '</div></div>';
  }).join('') + '</div>';
}

function renderProducers(rows=[]) {
  if (!rows.length) return '<div class="empty compact">Producer list unavailable from the active endpoint.</div>';
  return '<div class="producer-grid">' + rows.slice(0,10).map((p,i) => {
    const name = p.owner || p.producer_name || p.name || 'producer';
    return '<div class="producer-row"><span class="rank">' + (i+1) + '</span><div><strong>' +
      esc(name) + '</strong><small>' + esc(p.url || 'Ultra block producer') + '</small></div>' +
      '<span class="badge neutral">' + num(p.unpaid_blocks ?? p.location ?? '') + '</span></div>';
  }).join('') + '</div>';
}

function renderHome(payload) {
  const data = payload.data || {};
  const info = data.info || {};
  const blocks = data.blocks || [];
  const health = data.health || {};
  const verified = info.chain_id === EXPECTED_CHAIN_ID;
  const totalHealth = (health.chain?.length || 0) + (health.hyperion?.length || 0);
  const upHealth = (health.chainHealthy || 0) + (health.hyperionHealthy || 0);

  contentEl.innerHTML =
    cacheNotice(payload) +
    '<div class="stats">' +
      '<div class="stat"><span class="stat-label">Head block</span><strong class="stat-value">' + num(info.head_block_num) +
      '</strong><span class="stat-sub">' + esc(date(info.head_block_time)) + '</span></div>' +
      '<div class="stat"><span class="stat-label">Irreversible</span><strong class="stat-value">' + num(info.last_irreversible_block_num) +
      '</strong><span class="stat-sub">Finalized chain state</span></div>' +
      '<div class="stat"><span class="stat-label">Producer</span><strong class="stat-value">' + esc(info.head_block_producer || '—') +
      '</strong><span class="stat-sub">Current head producer</span></div>' +
      '<div class="stat"><span class="stat-label">Infrastructure</span><strong class="stat-value">' + upHealth + '/' + totalHealth +
      ' online</strong><span class="stat-sub">' + (verified ? 'Ultra Testnet chain verified' : 'Chain verification warning') + '</span></div>' +
    '</div>' +

    '<div class="grid-2 dashboard-top">' +
      '<div class="card"><div class="card-head"><div><div class="eyebrow">LATEST</div><h2>Recent blocks</h2></div><span class="subtle">Auto-refreshes every 30s</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Block</th><th>Time</th><th>Producer</th><th>Transactions</th></tr></thead><tbody>' +
      (blocks.map(b => '<tr><td><button class="link" data-block="' + esc(b.block_num) + '">#' + num(b.block_num) +
      '</button></td><td>' + esc(date(b.timestamp)) + '</td><td>' + esc(b.producer || '—') + '</td><td>' +
      num(b.transaction_count) + '</td></tr>').join('') || '<tr><td colspan="4">No block data returned.</td></tr>') +
      '</tbody></table></div></div>' +

      '<div class="card"><div class="card-head"><div><div class="eyebrow">UPSTREAMS</div><h2>Network health</h2></div><span class="badge ' +
      (upHealth ? 'success' : 'neutral') + '">' + upHealth + '/' + totalHealth + '</span></div>' +
      renderHealthMini(health) + '</div>' +
    '</div>' +

    '<div class="section-grid">' +
      '<div class="card"><div class="card-head"><div><div class="eyebrow">UOS</div><h2>Recent transfers</h2></div><span class="subtle">eosio.token</span></div>' +
      renderTransfers(data.transfers || []) + '</div>' +
      '<div class="card"><div class="card-head"><div><div class="eyebrow">UNIQS</div><h2>NFT activity</h2></div><span class="subtle">eosio.nft.ft</span></div>' +
      renderUniqs(data.uniqActivity || []) + '</div>' +
    '</div>' +

    '<div class="card producers-card"><div class="card-head"><div><div class="eyebrow">NETWORK</div><h2>Block producers</h2></div><span class="subtle">' +
    esc(payload.endpoint ? payload.endpoint.replace(/^https?:\/\//,'') : 'Ultra Testnet') + '</span></div>' +
    renderProducers(data.producers || []) + '</div>';
}

function renderTokenHoldings(tokens=[]) {
  if (!tokens.length) return '<div class="empty compact">No indexed token balances returned.</div>';
  return '<div class="holding-list">' + tokens.slice(0,24).map(token => {
    const amount = token.amount ?? token.balance ?? token.quantity ?? '—';
    const symbol = token.symbol || '';
    const contract = token.contract || token.code || 'token contract';
    return '<div class="holding-row"><div class="holding-mark">' + esc(String(symbol || '?').slice(0,1)) +
      '</div><div><strong>' + esc(String(amount) + (symbol ? ' ' + symbol : '')) +
      '</strong><small>' + esc(contract) + '</small></div></div>';
  }).join('') + '</div>';
}

function renderOwnedUniqs(uniqs=[], hasMore=false) {
  if (!uniqs.length) return '<div class="empty compact">No Uniqs found in token.b for this account.</div>';
  return '<div class="uniq-grid">' + uniqs.slice(0,24).map(uniq => {
    const id = uniq.id ?? '—';
    const factory = uniq.token_factory_id ?? '—';
    const serial = uniq.serial_number ?? '—';
    return '<div class="uniq-card"><div class="uniq-symbol">◇</div><div><strong>Uniq #' +
      esc(id) + '</strong><small>Factory ' + esc(factory) + ' · Serial ' + esc(serial) +
      '</small></div></div>';
  }).join('') + (hasMore ? '<div class="uniq-more">More Uniqs exist on-chain; first 100 loaded.</div>' : '') + '</div>';
}

function renderAccount(payload) {
  const a = payload.data?.account || {};
  const actions = payload.data?.actions || [];
  const tokens = payload.data?.tokens || [];
  const uniqs = payload.data?.uniqs || [];
  const ramQ = Number(a.ram_quota);
  const ramU = Number(a.ram_usage);

  contentEl.innerHTML = cacheNotice(payload) +
    '<div class="result-head"><div class="detail-title"><div class="eyebrow">ACCOUNT</div><h1>' +
    esc(a.account_name || 'Unknown') + '</h1><p>Created ' + esc(date(a.created)) + ' · Head block ' +
    num(a.head_block_num) + '</p></div>' + backButton() + '</div>' +

    '<div class="stats">' +
      '<div class="stat"><span class="stat-label">Liquid balance</span><strong class="stat-value">' +
      esc(a.core_liquid_balance || '0 UOS') + '</strong><span class="stat-sub">Available UOS</span></div>' +
      '<div class="stat"><span class="stat-label">RAM used</span><strong class="stat-value">' + bytes(ramU) +
      '</strong><span class="stat-sub">' + (ramQ < 0 ? 'Unlimited quota' : pct(ramU,ramQ) + ' of ' + bytes(ramQ)) + '</span></div>' +
      '<div class="stat"><span class="stat-label">CPU used</span><strong class="stat-value">' +
      (a.cpu_limit?.used < 0 ? 'Unlimited' : num(a.cpu_limit?.used)) + '</strong><span class="stat-sub">' +
      (a.cpu_limit?.max < 0 ? 'System/unlimited' : pct(a.cpu_limit?.used,a.cpu_limit?.max) + ' usage') + '</span></div>' +
      '<div class="stat"><span class="stat-label">NET used</span><strong class="stat-value">' +
      (a.net_limit?.used < 0 ? 'Unlimited' : num(a.net_limit?.used)) + '</strong><span class="stat-sub">' +
      (a.net_limit?.max < 0 ? 'System/unlimited' : pct(a.net_limit?.used,a.net_limit?.max) + ' usage') + '</span></div>' +
    '</div>' +

    '<div class="detail-grid">' +
      '<div class="card detail-card"><h3>Account details</h3>' +
        '<div class="kv"><span>Privileged</span><span>' + (a.privileged ? 'Yes' : 'No') + '</span></div>' +
        '<div class="kv"><span>Last code update</span><span>' + esc(date(a.last_code_update)) + '</span></div>' +
        '<div class="kv"><span>RAM quota</span><span>' + bytes(a.ram_quota) + '</span></div>' +
        '<div class="kv"><span>CPU weight</span><span>' + num(a.cpu_weight) + '</span></div>' +
        '<div class="kv"><span>NET weight</span><span>' + num(a.net_weight) + '</span></div>' +
      '</div>' +
      '<div class="card detail-card"><h3>Permissions</h3>' +
        ((a.permissions || []).map(p => '<div class="permission"><div class="action-top"><span class="badge">' +
        esc(p.perm_name) + '</span><span class="mono">parent: ' + esc(p.parent || 'root') +
        '</span></div><div class="kv"><span>Threshold</span><span>' + num(p.required_auth?.threshold) +
        '</span></div><div class="kv"><span>Keys</span><span>' + num(p.required_auth?.keys?.length || 0) +
        '</span></div><div class="kv"><span>Accounts</span><span>' + num(p.required_auth?.accounts?.length || 0) +
        '</span></div></div>').join('') || '<p>No permissions returned.</p>') +
      '</div>' +
      '<div class="card detail-card full"><div class="card-head inline-head"><div><div class="eyebrow">ASSETS</div><h2>On-chain holdings</h2></div><span class="subtle">' +
      tokens.length + ' token balances · ' + uniqs.length + (payload.data?.uniq_more ? '+' : '') + ' Uniqs</span></div>' +
      '<div class="holdings-grid"><div><div class="holdings-label">Tokens</div>' + renderTokenHoldings(tokens) +
      '</div><div><div class="holdings-label">Uniqs</div>' + renderOwnedUniqs(uniqs, payload.data?.uniq_more) + '</div></div></div>' +
      '<div class="card detail-card full"><div class="card-head inline-head"><div><div class="eyebrow">HYPERION</div><h2>Recent actions</h2></div><span class="subtle">Last ' +
      actions.length + '</span></div>' +
      (actions.length ? actions.map(actionView).join('') :
      '<div class="empty compact">' + esc(payload.data?.actions_warning || 'No recent actions returned for this account.') + '</div>') +
      '</div>' +
    '</div>';
}

function renderBlock(payload) {
  const b = payload.data || {};
  const txs = b.transactions_normalized || [];
  contentEl.innerHTML = cacheNotice(payload) +
    '<div class="result-head"><div class="detail-title"><div class="eyebrow">BLOCK</div><h1>#' +
    num(b.block_num) + '</h1><p class="mono">' + esc(b.id || '') + '</p></div>' + backButton() + '</div>' +
    '<div class="stats">' +
      '<div class="stat"><span class="stat-label">Timestamp</span><strong class="stat-value stat-date">' + esc(date(b.timestamp)) +
      '</strong><span class="stat-sub">Block time</span></div>' +
      '<div class="stat"><span class="stat-label">Producer</span><strong class="stat-value">' + esc(b.producer || '—') +
      '</strong><span class="stat-sub">Block producer</span></div>' +
      '<div class="stat"><span class="stat-label">Transactions</span><strong class="stat-value">' + num(txs.length) +
      '</strong><span class="stat-sub">Included in block</span></div>' +
      '<div class="stat"><span class="stat-label">Confirmed</span><strong class="stat-value">' + num(b.confirmed) +
      '</strong><span class="stat-sub">Confirmation field</span></div>' +
    '</div>' +
    '<div class="card block-meta"><div class="side-list">' +
      '<div class="kv"><span>Block ID</span><span class="mono">' + esc(b.id || '—') + '</span></div>' +
      '<div class="kv"><span>Previous</span><span class="mono">' + esc(b.previous || '—') + '</span></div>' +
      '<div class="kv"><span>Transaction MRoot</span><span class="mono">' + esc(b.transaction_mroot || '—') + '</span></div>' +
      '<div class="kv"><span>Action MRoot</span><span class="mono">' + esc(b.action_mroot || '—') + '</span></div>' +
    '</div></div>' +
    '<div class="card"><div class="card-head"><div><div class="eyebrow">CONTENTS</div><h2>Transactions</h2></div><span class="subtle">' +
    txs.length + ' records</span></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Transaction</th><th>Status</th><th>CPU</th><th>NET words</th></tr></thead><tbody>' +
    (txs.map(t => '<tr><td>' + (t.index+1) + '</td><td>' +
      (t.id ? '<button class="link mono" data-tx="' + esc(t.id) + '">' + esc(short(t.id,14,10)) + '</button>' : 'Deferred/packed transaction') +
      '</td><td><span class="badge ' + (t.status === 'executed' ? 'success' : 'neutral') + '">' + esc(t.status || '—') +
      '</span></td><td>' + num(t.cpu_usage_us) + '</td><td>' + num(t.net_usage_words) + '</td></tr>').join('') ||
      '<tr><td colspan="5">No transactions in this block.</td></tr>') +
    '</tbody></table></div></div>';
}

function renderTransaction(payload) {
  const t = payload.data || {};
  const actions = t.actions || [];
  const blockNum = actions[0]?.block_num || t.block_num || '';
  contentEl.innerHTML = cacheNotice(payload) +
    '<div class="result-head"><div class="detail-title"><div class="eyebrow">TRANSACTION</div><h1>' +
    (t.executed === false ? 'Not executed' : 'Executed') + '</h1><p class="mono">' + esc(t.trx_id || '') +
    '</p></div>' + backButton() + '</div>' +
    '<div class="stats">' +
      '<div class="stat"><span class="stat-label">Status</span><strong class="stat-value">' +
      (t.executed === false ? 'Failed' : 'Executed') + '</strong><span class="stat-sub">Hyperion result</span></div>' +
      '<div class="stat"><span class="stat-label">Block</span><strong class="stat-value">' + num(blockNum) +
      '</strong><span class="stat-sub">' + (blockNum ? '<button class="link" data-block="' + esc(blockNum) + '">Open block</button>' : '—') + '</span></div>' +
      '<div class="stat"><span class="stat-label">Actions</span><strong class="stat-value">' + num(actions.length) +
      '</strong><span class="stat-sub">Recorded action traces</span></div>' +
      '<div class="stat"><span class="stat-label">LIB</span><strong class="stat-value">' + num(t.lib) +
      '</strong><span class="stat-sub">Last irreversible block</span></div>' +
    '</div>' +
    '<div class="card detail-card"><div class="card-head inline-head"><div><div class="eyebrow">TRACE</div><h2>Actions</h2></div><span class="subtle">' +
    actions.length + ' total</span></div>' +
    (actions.map(actionView).join('') || '<div class="empty compact">No action traces returned.</div>') + '</div>';
}

async function home({silent=false}={}) {
  if (homeBusy) return;
  homeBusy = true;
  if (!silent) setLoading('Reading Ultra Testnet and checking upstream health…');
  try {
    const payload = await api('mode=dashboard');
    if (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/home')) {
      renderHome(payload);
      history.replaceState(null,'','#/');
    }
  } catch (error) {
    if (!silent) setError(error);
  } finally {
    homeBusy = false;
  }
}

async function search(q) {
  if (!q) return;
  searchInput.value = q;
  setLoading('Searching Ultra Testnet for ' + short(q,16,10) + '…');
  try {
    const result = await api('mode=search&q=' + encodeURIComponent(q));
    history.replaceState(null,'','#/search/' + encodeURIComponent(q));
    if (result.type === 'account') renderAccount(result);
    else if (result.type === 'transaction') renderTransaction(result);
    else if (result.type === 'block') renderBlock(result);
  } catch (error) { setError(error); }
}

async function block(id) {
  if (!id) return;
  setLoading('Loading block ' + id + '…');
  try {
    const result = await api('mode=block&id=' + encodeURIComponent(id));
    history.replaceState(null,'','#/block/' + encodeURIComponent(id));
    renderBlock(result);
  } catch (error) { setError(error); }
}

async function transaction(id) {
  if (!id) return;
  setLoading('Loading transaction…');
  try {
    const result = await api('mode=transaction&id=' + encodeURIComponent(id));
    history.replaceState(null,'','#/tx/' + encodeURIComponent(id));
    renderTransaction(result);
  } catch (error) { setError(error); }
}

async function openStatus() {
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
  drawerContent.innerHTML = '<div class="loading compact">Checking every public Ultra endpoint…</div>';
  try {
    const status = await api('mode=health');
    const h = status.data || {};
    drawerContent.innerHTML =
      '<div class="status-summary"><div><span>Chain API</span><strong>' + (h.chainHealthy || 0) + '/' +
      (h.chain?.length || 0) + '</strong></div><div><span>Hyperion</span><strong>' +
      (h.hyperionHealthy || 0) + '/' + (h.hyperion?.length || 0) + '</strong></div></div>' +
      '<div class="eyebrow drawer-label">PUBLIC ENDPOINTS</div>' + renderHealthMini(h) +
      '<p class="drawer-note">The explorer tries the fastest last-known working endpoint first, then automatically fails over. Live pages fall back to a locally cached last-good snapshot when every upstream is temporarily unavailable.</p>';
  } catch (error) {
    drawerContent.innerHTML = '<div class="error compact"><div><strong>Health check failed</strong>' +
      esc(error.message) + '</div></div>';
  }
}

function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden','true');
}

function route() {
  const hash = decodeURIComponent(location.hash || '#/');
  if (hash.startsWith('#/block/')) return block(hash.slice(8));
  if (hash.startsWith('#/tx/')) return transaction(hash.slice(5));
  if (hash.startsWith('#/search/')) return search(hash.slice(9));
  return home();
}

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  search(searchInput.value.trim());
});

document.addEventListener('click', event => {
  const searchTarget = event.target.closest('[data-search]');
  if (searchTarget) return search(searchTarget.dataset.search);

  const blockTarget = event.target.closest('[data-block]');
  if (blockTarget && blockTarget.dataset.block) return block(blockTarget.dataset.block);

  const txTarget = event.target.closest('[data-tx]');
  if (txTarget && txTarget.dataset.tx) return transaction(txTarget.dataset.tx);

  if (event.target.closest('[data-home]')) return home();
  if (event.target.closest('[data-retry]')) return route();
  if (event.target.closest('[data-close-drawer]')) return closeDrawer();
});

document.querySelector('#statusButton').addEventListener('click', openStatus);
window.addEventListener('hashchange', route);

window.addEventListener('online', () => {
  setNetworkPill('live');
  if ((location.hash || '#/') === '#/') home({silent:true});
});

window.addEventListener('offline', () => setNetworkPill('offline'));

refreshTimer = setInterval(() => {
  if (!document.hidden && navigator.onLine && (location.hash === '' || location.hash === '#/')) {
    home({silent:true});
  }
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && navigator.onLine && (location.hash === '' || location.hash === '#/')) {
    home({silent:true});
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

setNetworkPill(navigator.onLine ? 'live' : 'offline');
route();
