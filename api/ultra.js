const CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';

const CHAIN_ENDPOINTS = [
  'https://ultra-testnet.eosphere.io',
  'https://testnet.ultra.eosrio.io',
  'https://test.ultra.eosusa.io',
  'https://api.ultra-testnet.cryptolions.io',
  'https://api.testnet.ultra.eossweden.org'
];

const HYPERION_ENDPOINTS = [
  'https://api.testnet.ultra.eossweden.org',
  'https://test.ultra.eosusa.io'
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error?.what || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function withFailover(endpoints, requestBuilder) {
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      const { url, options } = requestBuilder(endpoint);
      const data = await fetchJson(url, options);
      return { data, endpoint };
    } catch (error) {
      failures.push({ endpoint, message: error.message });
    }
  }
  const err = new Error('All Ultra public endpoints failed for this request.');
  err.failures = failures;
  throw err;
}

function chainPost(path, body) {
  return withFailover(CHAIN_ENDPOINTS, endpoint => ({
    url: `${endpoint}${path}`,
    options: { method: 'POST', body: JSON.stringify(body) }
  }));
}

function chainGet(path) {
  return withFailover(CHAIN_ENDPOINTS, endpoint => ({
    url: `${endpoint}${path}`,
    options: { method: 'GET' }
  }));
}

function hyperionGet(path) {
  return withFailover(HYPERION_ENDPOINTS, endpoint => ({
    url: `${endpoint}${path}`,
    options: { method: 'GET' }
  }));
}

function normalizeTransactions(block) {
  return (block?.transactions || []).map((entry, index) => {
    const trx = entry?.trx;
    let id = null;
    if (typeof trx === 'string') id = trx;
    else if (trx && typeof trx === 'object') id = trx.id || trx.transaction_id || null;
    return {
      index,
      id,
      status: entry?.status || entry?.receipt?.status || null,
      cpu_usage_us: entry?.cpu_usage_us ?? entry?.receipt?.cpu_usage_us ?? null,
      net_usage_words: entry?.net_usage_words ?? entry?.receipt?.net_usage_words ?? null
    };
  });
}

async function getInfo() {
  const result = await chainGet('/v1/chain/get_info');
  const okChain = result.data?.chain_id === CHAIN_ID;
  return { ...result, verifiedTestnet: okChain };
}

async function getBlock(id) {
  const result = await chainPost('/v1/chain/get_block', { block_num_or_id: String(id) });
  result.data = { ...result.data, transactions_normalized: normalizeTransactions(result.data) };
  return result;
}

async function getTransaction(id) {
  return hyperionGet(`/v2/history/get_transaction?id=${encodeURIComponent(id)}`);
}

async function getActions(account) {
  try {
    const result = await hyperionGet(`/v2/history/get_actions?account=${encodeURIComponent(account)}&limit=25&sort=desc`);
    return result;
  } catch (error) {
    return { data: { actions: [], warning: 'Recent action history is temporarily unavailable.' }, endpoint: null };
  }
}

async function getAccount(name) {
  const [accountResult, actionsResult] = await Promise.all([
    chainPost('/v1/chain/get_account', { account_name: name }),
    getActions(name)
  ]);
  return {
    data: {
      account: accountResult.data,
      actions: actionsResult.data?.actions || [],
      actions_warning: actionsResult.data?.warning || null
    },
    endpoint: accountResult.endpoint,
    hyperionEndpoint: actionsResult.endpoint
  };
}

async function getRecentBlocks(count = 8) {
  const info = await getInfo();
  const head = Number(info.data?.head_block_num || 0);
  const wanted = Math.max(1, Math.min(Number(count) || 8, 12));
  const nums = Array.from({ length: wanted }, (_, i) => head - i).filter(n => n > 0);
  const blocks = [];
  for (const n of nums) {
    try {
      const block = await getBlock(n);
      blocks.push({
        block_num: block.data?.block_num || n,
        id: block.data?.id,
        timestamp: block.data?.timestamp,
        producer: block.data?.producer,
        transaction_count: block.data?.transactions?.length || 0
      });
    } catch {}
  }
  return { data: { info: info.data, blocks }, endpoint: info.endpoint, verifiedTestnet: info.verifiedTestnet };
}

async function searchValue(value) {
  const q = String(value || '').trim();
  if (!q) throw new Error('Enter an account, transaction ID, or block number.');
  if (/^\d+$/.test(q)) {
    const block = await getBlock(q);
    return { type: 'block', ...block };
  }
  if (/^[a-z1-5.]{1,12}$/.test(q)) {
    const account = await getAccount(q);
    return { type: 'account', ...account };
  }
  if (/^[0-9a-fA-F]{64}$/.test(q)) {
    try {
      const transaction = await getTransaction(q);
      return { type: 'transaction', ...transaction };
    } catch {
      const block = await getBlock(q);
      return { type: 'block', ...block };
    }
  }
  throw new Error('That does not look like a valid Ultra account, 64-character transaction/block ID, or block number.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const mode = url.searchParams.get('mode') || 'info';
  try {
    let result;
    if (mode === 'info') result = await getInfo();
    else if (mode === 'recent') result = await getRecentBlocks(url.searchParams.get('count'));
    else if (mode === 'account') result = await getAccount(url.searchParams.get('name') || '');
    else if (mode === 'block') result = await getBlock(url.searchParams.get('id') || '');
    else if (mode === 'transaction') result = await getTransaction(url.searchParams.get('id') || '');
    else if (mode === 'search') result = await searchValue(url.searchParams.get('q') || '');
    else return json(res, 400, { ok: false, error: 'Unknown mode' });

    return json(res, 200, {
      ok: true,
      mode,
      network: 'Ultra Testnet',
      expectedChainId: CHAIN_ID,
      ...result
    });
  } catch (error) {
    return json(res, 502, {
      ok: false,
      error: error.message || 'Ultra request failed',
      failures: error.failures || undefined
    });
  }
};

module.exports._internals = { CHAIN_ID, CHAIN_ENDPOINTS, HYPERION_ENDPOINTS, normalizeTransactions };
