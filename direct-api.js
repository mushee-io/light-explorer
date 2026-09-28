(() => {
  const nativeFetch = window.fetch.bind(window);
  const CHAIN_ID = '7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9';
  const CHAIN = [
    'https://ultra-testnet.eosphere.io',
    'https://testnet.ultra.eosrio.io',
    'https://test.ultra.eosusa.io',
    'https://api.ultra-testnet.cryptolions.io',
    'https://api.testnet.ultra.eossweden.org'
  ];
  const HYPERION = [
    'https://api.testnet.ultra.eossweden.org',
    'https://test.ultra.eosusa.io'
  ];

  const CACHE_PREFIX = 'ultra-lite:v2:';
  const PREF_CHAIN = 'ultra-lite:preferred-chain';
  const PREF_HYPERION = 'ultra-lite:preferred-hyperion';
  const MAX_STALE_MS = 6 * 60 * 60 * 1000;
  const healthState = new Map();

  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  function cacheKey(url) {
    return CACHE_PREFIX + url.pathname + '?' + [...url.searchParams.entries()]
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([k,v]) => k + '=' + v)
      .join('&');
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item?.savedAt || Date.now() - item.savedAt > MAX_STALE_MS) return null;
      return item;
    } catch { return null; }
  }

  function writeCache(key, body) {
    try {
      localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), body}));
    } catch {}
  }

  function ordered(endpoints, prefKey) {
    const preferred = safeGet(prefKey);
    if (!preferred || !endpoints.includes(preferred)) return [...endpoints];
    return [preferred, ...endpoints.filter(x => x !== preferred)];
  }

  async function request(url, options = {}, timeout = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const started = performance.now();
    try {
      const response = await nativeFetch(url, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? {'Content-Type': 'application/json'} : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; }
      catch { data = {raw: text}; }
      if (!response.ok) {
        const error = new Error(data?.error?.what || data?.message || 'HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return {data, latencyMs: Math.max(1, Math.round(performance.now() - started))};
    } finally {
      clearTimeout(timer);
    }
  }

  async function failover(endpoints, prefKey, build) {
    const failures = [];
    for (const endpoint of ordered(endpoints, prefKey)) {
      const started = performance.now();
      try {
        const {path, options} = build(endpoint);
        const result = await request(endpoint + path, options);
        const stat = {
          endpoint,
          ok: true,
          latencyMs: result.latencyMs,
          checkedAt: new Date().toISOString()
        };
        healthState.set(endpoint, stat);
        safeSet(prefKey, endpoint);
        return {data: result.data, endpoint, latencyMs: result.latencyMs};
      } catch (error) {
        const stat = {
          endpoint,
          ok: false,
          latencyMs: Math.max(1, Math.round(performance.now() - started)),
          checkedAt: new Date().toISOString(),
          error: error.message
        };
        healthState.set(endpoint, stat);
        failures.push({endpoint, message: error.message});
      }
    }
    const error = new Error('All Ultra public endpoints failed for this request.');
    error.failures = failures;
    throw error;
  }

  const chainGet = path =>
    failover(CHAIN, PREF_CHAIN, () => ({path, options: {method: 'GET'}}));

  const chainPost = (path, body) =>
    failover(CHAIN, PREF_CHAIN, () => ({
      path,
      options: {method: 'POST', body: JSON.stringify(body)}
    }));

  const hyperionGet = path =>
    failover(HYPERION, PREF_HYPERION, () => ({path, options: {method: 'GET'}}));

  async function info() {
    const result = await chainGet('/v1/chain/get_info');
    return {
      ...result,
      verifiedTestnet: result.data?.chain_id === CHAIN_ID
    };
  }

  function normalizeTransactions(block) {
    return (block?.transactions || []).map((entry, index) => {
      const trx = entry?.trx;
      return {
        index,
        id: typeof trx === 'string' ? trx : (trx?.id || trx?.transaction_id || null),
        status: entry?.status || entry?.receipt?.status || null,
        cpu_usage_us: entry?.cpu_usage_us ?? entry?.receipt?.cpu_usage_us ?? null,
        net_usage_words: entry?.net_usage_words ?? entry?.receipt?.net_usage_words ?? null
      };
    });
  }

  async function block(id) {
    const result = await chainPost('/v1/chain/get_block', {block_num_or_id: String(id)});
    return {
      ...result,
      data: {
        ...result.data,
        transactions_normalized: normalizeTransactions(result.data)
      }
    };
  }

  async function transaction(id) {
    return hyperionGet('/v2/history/get_transaction?id=' + encodeURIComponent(id));
  }

  async function accountActions(name, limit = 25) {
    try {
      return await hyperionGet('/v2/history/get_actions?account=' +
        encodeURIComponent(name) + '&limit=' + limit + '&sort=desc');
    } catch {
      return {
        data: {actions: [], warning: 'Recent action history is temporarily unavailable.'},
        endpoint: null
      };
    }
  }

  async function account(name) {
    const [accountResult, historyResult, tokenResult, uniqResult] = await Promise.all([
      chainPost('/v1/chain/get_account', {account_name: name}),
      accountActions(name),
      safePart(
        () => hyperionGet('/v2/state/get_tokens?account=' + encodeURIComponent(name)),
        {data: {tokens: []}, endpoint: null}
      ),
      safePart(
        () => chainPost('/v1/chain/get_table_rows', {
          json: true,
          code: 'eosio.nft.ft',
          scope: name,
          table: 'token.b',
          limit: 100
        }),
        {data: {rows: [], more: false}, endpoint: null}
      )
    ]);
    return {
      data: {
        account: accountResult.data,
        actions: historyResult.data?.actions || [],
        actions_warning: historyResult.data?.warning || null,
        tokens: tokenResult.data?.tokens || [],
        uniqs: uniqResult.data?.rows || [],
        uniq_more: Boolean(uniqResult.data?.more)
      },
      endpoint: accountResult.endpoint,
      hyperionEndpoint: historyResult.endpoint || tokenResult.endpoint
    };
  }

  async function recent(count = 8) {
    const infoResult = await info();
    const head = Number(infoResult.data?.head_block_num || 0);
    const wanted = Math.max(1, Math.min(Number(count) || 8, 10));
    const nums = Array.from({length: wanted}, (_, i) => head - i).filter(n => n > 0);
    const rows = await Promise.all(nums.map(async n => {
      try {
        const result = await block(n);
        return {
          block_num: result.data?.block_num || n,
          id: result.data?.id,
          timestamp: result.data?.timestamp,
          producer: result.data?.producer,
          transaction_count: result.data?.transactions?.length || 0
        };
      } catch { return null; }
    }));
    return {
      data: {info: infoResult.data, blocks: rows.filter(Boolean)},
      endpoint: infoResult.endpoint,
      verifiedTestnet: infoResult.verifiedTestnet
    };
  }

  async function producers() {
    const result = await chainPost('/v1/chain/get_producers', {
      json: true,
      lower_bound: '',
      limit: 50
    });
    return {
      ...result,
      data: {
        rows: result.data?.rows || [],
        total_producer_vote_weight: result.data?.total_producer_vote_weight ?? null,
        more: result.data?.more ?? ''
      }
    };
  }

  async function recentTransfers(limit = 15) {
    const result = await hyperionGet('/v2/history/get_transfers?contract=eosio.token&symbol=UOS&limit=' +
      Math.max(1, Math.min(Number(limit) || 15, 30)));
    const actions = (result.data?.actions || []).map(item => {
      const act = item.act || item.action_trace?.act || {};
      const data = act.data || {};
      const quantity = data.quantity || (
        data.amount !== undefined && data.symbol
          ? String(data.amount) + ' ' + String(data.symbol)
          : null
      );
      return {
        ...item,
        act: {
          ...act,
          data: quantity ? {...data, quantity} : data
        }
      };
    });
    return {...result, data: {...result.data, actions}};
  }

  async function recentUniqActivity(limit = 15) {
    return hyperionGet('/v2/history/get_actions?account=eosio.nft.ft&filter=eosio.nft.ft:*&noBinary=true&limit=' +
      Math.max(1, Math.min(Number(limit) || 15, 30)) + '&sort=desc');
  }

  async function probeChain(endpoint) {
    const started = performance.now();
    try {
      const result = await request(endpoint + '/v1/chain/get_info', {method: 'GET'}, 4500);
      return {
        endpoint,
        kind: 'chain',
        ok: result.data?.chain_id === CHAIN_ID,
        latencyMs: result.latencyMs,
        headBlock: result.data?.head_block_num ?? null,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        endpoint,
        kind: 'chain',
        ok: false,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        error: error.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  async function probeHyperion(endpoint) {
    const started = performance.now();
    try {
      let result;
      try {
        result = await request(endpoint + '/v2/health', {method: 'GET'}, 4500);
      } catch {
        result = await request(endpoint + '/v2/history/get_actions?limit=1&sort=desc', {method: 'GET'}, 4500);
      }
      return {
        endpoint,
        kind: 'hyperion',
        ok: true,
        latencyMs: result.latencyMs,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        endpoint,
        kind: 'hyperion',
        ok: false,
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        error: error.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  async function health() {
    const [chain, hyperion] = await Promise.all([
      Promise.all(CHAIN.map(probeChain)),
      Promise.all(HYPERION.map(probeHyperion))
    ]);
    chain.forEach(x => healthState.set(x.endpoint, x));
    hyperion.forEach(x => healthState.set(x.endpoint, x));
    return {
      data: {
        chain,
        hyperion,
        chainHealthy: chain.filter(x => x.ok).length,
        hyperionHealthy: hyperion.filter(x => x.ok).length,
        checkedAt: new Date().toISOString()
      },
      endpoint: safeGet(PREF_CHAIN) || chain.find(x => x.ok)?.endpoint || null,
      hyperionEndpoint: safeGet(PREF_HYPERION) || hyperion.find(x => x.ok)?.endpoint || null
    };
  }

  async function safePart(fn, fallback) {
    try { return await fn(); }
    catch (error) { return {...fallback, error: error.message}; }
  }

  async function dashboard() {
    const [recentResult, healthResult, producerResult, transferResult, uniqResult] = await Promise.all([
      recent(8),
      health(),
      safePart(producers, {data: {rows: []}, endpoint: null}),
      safePart(() => recentTransfers(12), {data: {actions: []}, endpoint: null}),
      safePart(() => recentUniqActivity(12), {data: {actions: []}, endpoint: null})
    ]);
    return {
      data: {
        info: recentResult.data?.info || {},
        blocks: recentResult.data?.blocks || [],
        health: healthResult.data,
        producers: producerResult.data?.rows || [],
        transfers: transferResult.data?.actions || [],
        uniqActivity: uniqResult.data?.actions || []
      },
      endpoint: recentResult.endpoint,
      hyperionEndpoint: transferResult.endpoint || uniqResult.endpoint || healthResult.hyperionEndpoint,
      verifiedTestnet: recentResult.verifiedTestnet
    };
  }

  async function search(q) {
    q = String(q || '').trim();
    if (!q) throw new Error('Enter an account, transaction ID, or block number.');
    if (/^\d+$/.test(q)) return {type: 'block', ...(await block(q))};
    if (/^[a-z1-5.]{1,12}$/.test(q)) return {type: 'account', ...(await account(q))};
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      try { return {type: 'transaction', ...(await transaction(q))}; }
      catch { return {type: 'block', ...(await block(q))}; }
    }
    throw new Error('That does not look like a valid Ultra account, transaction/block ID, or block number.');
  }

  async function dispatch(url) {
    const mode = url.searchParams.get('mode') || 'info';
    let result;
    if (mode === 'info') result = await info();
    else if (mode === 'recent') result = await recent(url.searchParams.get('count'));
    else if (mode === 'dashboard') result = await dashboard();
    else if (mode === 'health') result = await health();
    else if (mode === 'producers') result = await producers();
    else if (mode === 'transfers') result = await recentTransfers(url.searchParams.get('limit'));
    else if (mode === 'uniq') result = await recentUniqActivity(url.searchParams.get('limit'));
    else if (mode === 'account') result = await account(url.searchParams.get('name') || '');
    else if (mode === 'block') result = await block(url.searchParams.get('id') || '');
    else if (mode === 'transaction') result = await transaction(url.searchParams.get('id') || '');
    else if (mode === 'search') result = await search(url.searchParams.get('q') || '');
    else throw new Error('Unknown explorer mode.');

    return {
      ok: true,
      source: 'live',
      mode,
      network: 'Ultra Testnet',
      expectedChainId: CHAIN_ID,
      fetchedAt: new Date().toISOString(),
      ...result
    };
  }

  window.UltraLiteAPI = {
    CHAIN_ID,
    CHAIN,
    HYPERION,
    getHealthSnapshot: () => [...healthState.values()]
  };

  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || url.pathname !== '/api/ultra') {
      return nativeFetch(input, init);
    }

    const key = cacheKey(url);
    try {
      const body = await dispatch(url);
      if (body.mode !== 'health') writeCache(key, body);
      return reply(body);
    } catch (error) {
      const cached = readCache(key);
      if (cached?.body) {
        return reply({
          ...cached.body,
          ok: true,
          source: 'cache',
          degraded: true,
          cachedAt: new Date(cached.savedAt).toISOString(),
          liveError: error.message,
          failures: error.failures || undefined
        });
      }
      return reply({
        ok: false,
        source: 'error',
        error: error.message || 'Ultra request failed',
        failures: error.failures || undefined
      }, 502);
    }
  };
})();