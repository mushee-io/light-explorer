# Ultra Lite Explorer

A lightweight, read-only community explorer for **Ultra Testnet (Staging)**.

## Features

- Live Ultra Testnet chain status
- Automatic failover across public Ultra producer endpoints
- Account lookup with UOS balance, RAM / CPU / NET and permissions
- Recent account actions through Hyperion
- Transaction lookup through Hyperion
- Block lookup with transaction list
- Universal search for accounts, transaction/block IDs and block numbers
- No wallet, signing, database or paid infrastructure required
- Deployable directly to Vercel

## Run locally

Requires Node.js 18+.

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Deploy to Vercel

Import this folder/repository into Vercel. There are no environment variables and no dependency install is required. The `/api/ultra.js` function proxies public Ultra APIs server-side and automatically tries another public endpoint if one is unavailable.

## Network

Ultra Testnet chain ID:

`7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9`

The endpoint list is based on Ultra's official developer documentation.
