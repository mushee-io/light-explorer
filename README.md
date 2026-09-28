# Ultra Lite Explorer

A lightweight, read-only community explorer for **Ultra Testnet (Staging)**.

## Architecture

This deployment is intentionally **100% static**.

- `index.html`, `styles.css`, `direct-api.js`, and `app.js` are static browser assets.
- There are **no Vercel Functions**, no Node server, no package install, and no build step.
- `direct-api.js` talks directly to Ultra's public Testnet producer and Hyperion endpoints and automatically fails over between providers.
- `vercel.json` explicitly overrides the Vercel project to the **Other** framework preset and disables any dashboard build/install commands.

This architecture deliberately removes serverless runtime failure as a failure mode for the explorer homepage.

## Features

- Live Ultra Testnet chain status
- Automatic endpoint failover
- Account lookup with UOS balance, RAM / CPU / NET and permissions
- Recent account actions through Hyperion
- Transaction lookup
- Block lookup with transaction list
- Universal search for accounts, transaction/block IDs and block numbers
- No wallet, signing, database, paid API, or server runtime required

## Network

Ultra Testnet chain ID:

`7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9`

Public endpoint lists are based on Ultra's developer documentation.
