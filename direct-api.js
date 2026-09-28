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

  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}
  });

  async function request(url, options = {}, timeout = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await nativeFetch(url, {
        ...options,
        mode: 'cors',
        signal: controller.signal,
        headers: {Accept: 'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}
      });
      const text = await r.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = {raw:text}; }
      if (!r.ok) throw new Error(data?.error?.what || data?.message || `HTTP ${r.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function failover(endpoints, build) {
    const failures = [];
    for (const endpoint of endpoints) {
      try {
        const {path, options} = build(endpoint);
        return {data: await request(`${endpoint}${path}`, options), endpoint};
      } catch (e) {
        failures.push({endpoint, message:e.message});
      }
    }
    const error = new Error('All Ultra public endpoints failed for this request.');
    error.failures = failures;
    throw error;
  }

  const chainGet = path => failover(CHAIN, () => ({path, options:{method:'GET'}}));
  const chainPost = (path, body) => failover(CHAIN, () => ({path, options:{method:'POST', body:JSON.stringify(body)}}));
  const hyperionGet = path => failover(HYPERION, () => ({path, options:{method:'GET'}}));

  async function info() {
    const r = await chainGet('/v1/chain/get_info');
    return {...r, verifiedTestnet:r.data?.chain_id === CHAIN_ID};
  }

  function txList(block) {
    return (block?.transactions || []).map((entry,index) => {
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
    const r = await chainPost('/v1/chain/get_block', {block_num_or_id:String(id)});
    return {...r, data:{...r.data, transactions_normalized:txList(r.data)}};
  }

  const transaction = id => hyperionGet(`/v2/history/get_transaction?id=${encodeURIComponent(id)}`);

  async function actions(name) {
    try { return await hyperionGet(`/v2/history/get_actions?account=${encodeURIComponent(name)}&limit=25&sort=desc`); }
    catch { return {data:{actions:[], warning:'Recent action history is temporarily unavailable.'}, endpoint:null}; }
  }

  async function account(name) {
    const [a,h] = await Promise.all([
      chainPost('/v1/chain/get_account', {account_name:name}),
      actions(name)
    ]);
    return {
      data:{account:a.data, actions:h.data?.actions || [], actions_warning:h.data?.warning || null},
      endpoint:a.endpoint,
      hyperionEndpoint:h.endpoint
    };
  }

  async function recent(count=8) {
    const i = await info();
    const head = Number(i.data?.head_block_num || 0);
    const total = Math.max(1, Math.min(Number(count)||8, 10));
    const nums = Array.from({length:total},(_,x)=>head-x).filter(Boolean);
    const rows = await Promise.all(nums.map(async n => {
      try {
        const b = await block(n);
        return {block_num:b.data?.block_num || n, id:b.data?.id, timestamp:b.data?.timestamp, producer:b.data?.producer, transaction_count:b.data?.transactions?.length || 0};
      } catch { return null; }
    }));
    return {data:{info:i.data, blocks:rows.filter(Boolean)}, endpoint:i.endpoint, verifiedTestnet:i.verifiedTestnet};
  }

  async function search(q) {
    q = String(q || '').trim();
    if (!q) throw new Error('Enter an account, transaction ID, or block number.');
    if (/^\d+$/.test(q)) return {type:'block', ...(await block(q))};
    if (/^[a-z1-5.]{1,12}$/.test(q)) return {type:'account', ...(await account(q))};
    if (/^[0-9a-fA-F]{64}$/.test(q)) {
      try { return {type:'transaction', ...(await transaction(q))}; }
      catch { return {type:'block', ...(await block(q))}; }
    }
    throw new Error('That does not look like a valid Ultra account, transaction/block ID, or block number.');
  }

  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || url.pathname !== '/api/ultra') return nativeFetch(input, init);

    try {
      const mode = url.searchParams.get('mode') || 'info';
      let result;
      if (mode === 'info') result = await info();
      else if (mode === 'recent') result = await recent(url.searchParams.get('count'));
      else if (mode === 'account') result = await account(url.searchParams.get('name') || '');
      else if (mode === 'block') result = await block(url.searchParams.get('id') || '');
      else if (mode === 'transaction') result = await transaction(url.searchParams.get('id') || '');
      else if (mode === 'search') result = await search(url.searchParams.get('q') || '');
      else return reply({ok:false,error:'Unknown mode'},400);
      return reply({ok:true, mode, network:'Ultra Testnet', expectedChainId:CHAIN_ID, ...result});
    } catch (e) {
      return reply({ok:false,error:e.message || 'Ultra request failed', failures:e.failures},502);
    }
  };
})();
