const EXPECTED_CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';
const CHAIN_ENDPOINTS = [
  'https://ultra-testnet.eosphere.io',
  'https://testnet.ultra.eosrio.io',
  'https://test.ultra.eosusa.io',
  'https://api.ultra-testnet.cryptolions.io',
  'https://api.testnet.ultra.eossweden.org'
];

const content = document.querySelector('#content');
const searchForm = document.querySelector('#searchForm');
const searchInput = document.querySelector('#searchInput');
const footerEndpoint = document.querySelector('#footerEndpoint');
const drawer = document.querySelector('#statusDrawer');
const drawerContent = document.querySelector('#drawerContent');
let lastStatus = null;

const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const short = (value='', a=9, b=7) => !value ? '—' : String(value).length <= a+b+3 ? String(value) : `${String(value).slice(0,a)}…${String(value).slice(-b)}`;
const num = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
const date = value => { if (!value) return '—'; const d = new Date(value.endsWith?.('Z') ? value : `${value}Z`); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); };
const bytes = value => { const n=Number(value); if (!Number.isFinite(n) || n<0) return 'Unlimited'; if (n<1024) return `${n} B`; if(n<1048576) return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(2)} MB`; };
const pct = (used,max) => { if (!Number.isFinite(+used)||!Number.isFinite(+max)||+max<=0) return '—'; return `${Math.min(100,(+used/+max)*100).toFixed(1)}%`; };

async function api(params='') {
  const response = await fetch(`/api/ultra?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || 'Request failed');
  if (data.endpoint) updateStatus(data);
  return data;
}

function updateStatus(data) {
  lastStatus = data;
  const clean = (data.endpoint || '').replace(/^https?:\/\//,'');
  footerEndpoint.textContent = clean ? `Live via ${clean}` : 'Ultra Testnet';
}

function setLoading(label='Loading Ultra Testnet…') {
  content.innerHTML = `<div class="loading"><div><div class="eyebrow">LIVE DATA</div><p>${esc(label)}</p></div></div>`;
}

function setError(error) {
  content.innerHTML = `<div class="error"><div><strong>Couldn’t load that from Ultra Testnet.</strong><div>${esc(error.message || error)}</div><p style="font-size:11px">The explorer automatically tries multiple public Ultra endpoints.</p></div></div>`;
}

function backButton() { return `<button class="back" data-home>← Explorer home</button>`; }

function renderHome(payload) {
  const info = payload.data?.info || {};
  const blocks = payload.data?.blocks || [];
  const verified = info.chain_id === EXPECTED_CHAIN_ID;
  content.innerHTML = `
    <div class="stats">
      <div class="stat"><span class="stat-label">Head block</span><strong class="stat-value">${num(info.head_block_num)}</strong><span class="stat-sub">${date(info.head_block_time)}</span></div>
      <div class="stat"><span class="stat-label">Irreversible</span><strong class="stat-value">${num(info.last_irreversible_block_num)}</strong><span class="stat-sub">Finalized chain state</span></div>
      <div class="stat"><span class="stat-label">Producer</span><strong class="stat-value">${esc(info.head_block_producer || '—')}</strong><span class="stat-sub">Current head producer</span></div>
      <div class="stat"><span class="stat-label">Network</span><strong class="stat-value">${verified ? 'Ultra Testnet' : 'Unverified'}</strong><span class="stat-sub">${verified ? 'Chain ID verified' : short(info.chain_id,8,6)}</span></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">LATEST</div><h2>Recent blocks</h2></div><span class="subtle">Live from public producers</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Block</th><th>Time</th><th>Producer</th><th>Transactions</th></tr></thead><tbody>
          ${blocks.map(b => `<tr><td><button class="link" data-block="${esc(b.block_num)}">#${num(b.block_num)}</button></td><td>${date(b.timestamp)}</td><td>${esc(b.producer || '—')}</td><td>${num(b.transaction_count)}</td></tr>`).join('') || `<tr><td colspan="4">No block data returned.</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">CHAIN</div><h2>Network details</h2></div><span class="badge ${verified?'success':'neutral'}">${verified?'Verified':'Check'}</span></div>
        <div class="side-list">
          <div class="kv"><span>Chain ID</span><span class="mono">${esc(short(info.chain_id,12,9))}</span></div>
          <div class="kv"><span>Server</span><span>${esc(info.server_version_string || info.server_version || '—')}</span></div>
          <div class="kv"><span>Block CPU limit</span><span>${num(info.block_cpu_limit)}</span></div>
          <div class="kv"><span>Block NET limit</span><span>${num(info.block_net_limit)}</span></div>
          <div class="kv"><span>Endpoint</span><span class="mono">${esc((payload.endpoint||'').replace(/^https?:\/\//,''))}</span></div>
        </div>
      </div>
    </div>`;
}

function renderAccount(payload) {
  const a = payload.data?.account || {};
  const actions = payload.data?.actions || [];
  const ramQ = Number(a.ram_quota);
  const ramU = Number(a.ram_usage);
  content.innerHTML = `
    <div class="result-head"><div class="detail-title"><div class="eyebrow">ACCOUNT</div><h1>${esc(a.account_name || 'Unknown')}</h1><p>Created ${date(a.created)} · Head block ${num(a.head_block_num)}</p></div>${backButton()}</div>
    <div class="stats">
      <div class="stat"><span class="stat-label">Liquid balance</span><strong class="stat-value">${esc(a.core_liquid_balance || '0 UOS')}</strong><span class="stat-sub">Available UOS</span></div>
      <div class="stat"><span class="stat-label">RAM used</span><strong class="stat-value">${bytes(ramU)}</strong><span class="stat-sub">${ramQ < 0 ? 'Unlimited quota' : `${pct(ramU,ramQ)} of ${bytes(ramQ)}`}</span></div>
      <div class="stat"><span class="stat-label">CPU used</span><strong class="stat-value">${a.cpu_limit?.used < 0 ? 'Unlimited' : num(a.cpu_limit?.used)}</strong><span class="stat-sub">${a.cpu_limit?.max < 0 ? 'System/unlimited' : `${pct(a.cpu_limit?.used,a.cpu_limit?.max)} usage`}</span></div>
      <div class="stat"><span class="stat-label">NET used</span><strong class="stat-value">${a.net_limit?.used < 0 ? 'Unlimited' : num(a.net_limit?.used)}</strong><span class="stat-sub">${a.net_limit?.max < 0 ? 'System/unlimited' : `${pct(a.net_limit?.used,a.net_limit?.max)} usage`}</span></div>
    </div>
    <div class="detail-grid">
      <div class="card detail-card"><h3>Account details</h3>
        <div class="kv"><span>Privileged</span><span>${a.privileged ? 'Yes' : 'No'}</span></div>
        <div class="kv"><span>Last code update</span><span>${date(a.last_code_update)}</span></div>
        <div class="kv"><span>RAM quota</span><span>${bytes(a.ram_quota)}</span></div>
        <div class="kv"><span>CPU weight</span><span>${num(a.cpu_weight)}</span></div>
        <div class="kv"><span>NET weight</span><span>${num(a.net_weight)}</span></div>
      </div>
      <div class="card detail-card"><h3>Permissions</h3>
        ${(a.permissions || []).map(p => `<div class="permission"><div class="action-top"><span class="badge">${esc(p.perm_name)}</span><span class="mono">parent: ${esc(p.parent || 'root')}</span></div><div class="kv"><span>Threshold</span><span>${num(p.required_auth?.threshold)}</span></div><div class="kv"><span>Keys</span><span>${num(p.required_auth?.keys?.length || 0)}</span></div><div class="kv"><span>Accounts</span><span>${num(p.required_auth?.accounts?.length || 0)}</span></div></div>`).join('') || '<p>No permissions returned.</p>'}
      </div>
      <div class="card detail-card full"><div class="card-head" style="padding:0 0 15px"><div><div class="eyebrow">HYPERION</div><h2>Recent actions</h2></div><span class="subtle">Last ${actions.length}</span></div>
        ${actions.length ? actions.map(actionView).join('') : `<div class="empty" style="min-height:130px">${esc(payload.data?.actions_warning || 'No recent actions returned for this account.')}</div>`}
      </div>
    </div>`;
}

function actionView(a) {
  const act = a.act || a.action_trace?.act || {};
  const tx = a.trx_id || a.transaction_id || a.action_trace?.trx_id || '';
  return `<div class="action"><div class="action-top"><span class="badge">${esc(act.account || 'contract')}</span><span class="action-name">${esc(act.name || 'action')}</span>${tx ? `<button class="link mono" data-tx="${esc(tx)}">${esc(short(tx,10,8))}</button>` : ''}</div><div class="mono">${date(a['@timestamp'] || a.timestamp || a.block_time)}</div>${act.data ? `<pre>${esc(JSON.stringify(act.data,null,2))}</pre>`:''}</div>`;
}

function renderBlock(payload) {
  const b = payload.data || {};
  const txs = b.transactions_normalized || [];
  content.innerHTML = `
    <div class="result-head"><div class="detail-title"><div class="eyebrow">BLOCK</div><h1>#${num(b.block_num)}</h1><p class="mono">${esc(b.id || '')}</p></div>${backButton()}</div>
    <div class="stats">
      <div class="stat"><span class="stat-label">Timestamp</span><strong class="stat-value" style="font-size:16px">${date(b.timestamp)}</strong><span class="stat-sub">Block time</span></div>
      <div class="stat"><span class="stat-label">Producer</span><strong class="stat-value">${esc(b.producer || '—')}</strong><span class="stat-sub">Block producer</span></div>
      <div class="stat"><span class="stat-label">Transactions</span><strong class="stat-value">${num(txs.length)}</strong><span class="stat-sub">Included in block</span></div>
      <div class="stat"><span class="stat-label">Confirmed</span><strong class="stat-value">${num(b.confirmed)}</strong><span class="stat-sub">Confirmation field</span></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="side-list">
      <div class="kv"><span>Block ID</span><span class="mono">${esc(b.id || '—')}</span></div>
      <div class="kv"><span>Previous</span><span class="mono">${esc(b.previous || '—')}</span></div>
      <div class="kv"><span>Transaction MRoot</span><span class="mono">${esc(b.transaction_mroot || '—')}</span></div>
      <div class="kv"><span>Action MRoot</span><span class="mono">${esc(b.action_mroot || '—')}</span></div>
    </div></div>
    <div class="card"><div class="card-head"><div><div class="eyebrow">CONTENTS</div><h2>Transactions</h2></div><span class="subtle">${txs.length} records</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Transaction</th><th>Status</th><th>CPU</th><th>NET words</th></tr></thead><tbody>
        ${txs.map(t => `<tr><td>${t.index+1}</td><td>${t.id ? `<button class="link mono" data-tx="${esc(t.id)}">${esc(short(t.id,14,10))}</button>`:'Deferred/packed transaction'}</td><td><span class="badge ${t.status==='executed'?'success':'neutral'}">${esc(t.status || '—')}</span></td><td>${num(t.cpu_usage_us)}</td><td>${num(t.net_usage_words)}</td></tr>`).join('') || '<tr><td colspan="5">No transactions in this block.</td></tr>'}
      </tbody></table></div>
    </div>`;
}

function renderTransaction(payload) {
  const t = payload.data || {};
  const actions = t.actions || [];
  content.innerHTML = `
    <div class="result-head"><div class="detail-title"><div class="eyebrow">TRANSACTION</div><h1>${t.executed === false ? 'Not executed' : 'Executed'}</h1><p class="mono">${esc(t.trx_id || '')}</p></div>${backButton()}</div>
    <div class="stats">
      <div class="stat"><span class="stat-label">Status</span><strong class="stat-value">${t.executed === false ? 'Failed' : 'Executed'}</strong><span class="stat-sub">Hyperion result</span></div>
      <div class="stat"><span class="stat-label">Block</span><strong class="stat-value">${num(actions[0]?.block_num || t.block_num)}</strong><span class="stat-sub"><button class="link" data-block="${esc(actions[0]?.block_num || t.block_num || '')}">Open block</button></span></div>
      <div class="stat"><span class="stat-label">Actions</span><strong class="stat-value">${num(actions.length)}</strong><span class="stat-sub">Recorded action traces</span></div>
      <div class="stat"><span class="stat-label">LIB</span><strong class="stat-value">${num(t.lib)}</strong><span class="stat-sub">Last irreversible block</span></div>
    </div>
    <div class="card detail-card"><div class="card-head" style="padding:0 0 15px"><div><div class="eyebrow">TRACE</div><h2>Actions</h2></div><span class="subtle">${actions.length} total</span></div>
      ${actions.map(actionView).join('') || '<div class="empty">No action traces returned.</div>'}
    </div>`;
}

async function home() {
  history.replaceState(null,'','#/');
  setLoading('Reading the latest Ultra Testnet blocks…');
  try { renderHome(await api('mode=recent&count=8')); } catch(e) { setError(e); }
}

async function search(q) {
  if (!q) return;
  searchInput.value = q;
  setLoading(`Searching Ultra Testnet for ${short(q,16,10)}…`);
  try {
    const result = await api(`mode=search&q=${encodeURIComponent(q)}`);
    history.replaceState(null,'',`#/search/${encodeURIComponent(q)}`);
    if (result.type === 'account') renderAccount(result);
    else if (result.type === 'transaction') renderTransaction(result);
    else if (result.type === 'block') renderBlock(result);
  } catch(e) { setError(e); }
}

async function block(id) {
  if (!id) return;
  setLoading(`Loading block ${id}…`);
  try { const r=await api(`mode=block&id=${encodeURIComponent(id)}`); history.replaceState(null,'',`#/block/${encodeURIComponent(id)}`); renderBlock(r); } catch(e) { setError(e); }
}
async function transaction(id) {
  if (!id) return;
  setLoading('Loading transaction…');
  try { const r=await api(`mode=transaction&id=${encodeURIComponent(id)}`); history.replaceState(null,'',`#/tx/${encodeURIComponent(id)}`); renderTransaction(r); } catch(e) { setError(e); }
}

searchForm.addEventListener('submit', e => { e.preventDefault(); search(searchInput.value.trim()); });
document.addEventListener('click', e => {
  const s=e.target.closest('[data-search]'); if(s) search(s.dataset.search);
  const b=e.target.closest('[data-block]'); if(b && b.dataset.block) block(b.dataset.block);
  const t=e.target.closest('[data-tx]'); if(t && t.dataset.tx) transaction(t.dataset.tx);
  if(e.target.closest('[data-home]')) home();
  if(e.target.closest('[data-close-drawer]')) drawer.classList.remove('open');
});

document.querySelector('#statusButton').addEventListener('click', async () => {
  drawer.classList.add('open');
  drawerContent.innerHTML = '<div class="loading" style="min-height:140px">Checking Ultra Testnet…</div>';
  try {
    const status = await api('mode=info');
    const info=status.data || {};
    drawerContent.innerHTML = `
      <div class="card detail-card"><div class="kv"><span>Status</span><span class="badge success">Connected</span></div><div class="kv"><span>Chain</span><span>${info.chain_id===EXPECTED_CHAIN_ID?'Ultra Testnet verified':'Unexpected chain ID'}</span></div><div class="kv"><span>Head block</span><span>${num(info.head_block_num)}</span></div><div class="kv"><span>Active endpoint</span><span class="mono">${esc(status.endpoint)}</span></div></div>
      <div style="margin-top:22px"><div class="eyebrow">FAILOVER POOL</div><div class="endpoint-list">${CHAIN_ENDPOINTS.map(x=>`<div class="endpoint-item ${x===status.endpoint?'active':''}">${esc(x)}${x===status.endpoint?' · active':''}</div>`).join('')}</div></div>
      <p style="font-size:11px;color:var(--muted);line-height:1.6;margin-top:18px">Read-only requests automatically fail over between Ultra public Testnet producer endpoints. Transaction history uses Hyperion-capable endpoints.</p>`;
  } catch(e) { drawerContent.innerHTML=`<div class="error"><div><strong>Connection check failed</strong>${esc(e.message)}</div></div>`; }
});

function route() {
  const hash=decodeURIComponent(location.hash || '#/');
  if(hash.startsWith('#/block/')) return block(hash.slice(8));
  if(hash.startsWith('#/tx/')) return transaction(hash.slice(5));
  if(hash.startsWith('#/search/')) return search(hash.slice(9));
  return home();
}
window.addEventListener('hashchange', route);
route();
