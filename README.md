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

## Architecture

The frontend (`index.html`, `app.js`, and `styles.css`) is served as static content on Vercel.

Only `/api/ultra.js` is deployed as a Vercel Function. It proxies public Ultra APIs server-side and automatically tries another public endpoint if one is unavailable.

There is intentionally no root `server.js`; keeping a custom Node server at the project root can cause Vercel to treat the entire site as a Node application instead of a static site.

## Deploy to Vercel

Import this repository into Vercel with the default project settings. There are no required environment variables and no application build step.

## Network

Ultra Testnet chain ID:

`7fc56be645bb76ab9d747b53089f132dcb7681db06f0852cfa03eaf6f7ac80e9`

The endpoint list is based on Ultra's official developer documentation.
