# VYRA website

Static page + one Vercel serverless function.

```
index.html        the site
assets/           artwork (webp) + og.jpg social card
favicon.svg
api/submit.js     saves mint-list wallets and work submissions
vercel.json       long cache headers for /assets
package.json      marks api/ as ES modules
```

## Make the forms work (required)

The old site saved wallets with `claude.use('db')`, which only exists inside
Claude's artifact preview, so every submission on Vercel failed.

1. Vercel dashboard → vyra-website → Storage → Create / connect **Upstash Redis** (free tier is fine).
2. Connect it to Production and Preview. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Redeploy.

Until that's done the forms show: "The mint list is not connected yet."

Where the data lives (view in the Upstash console):
- `vyra:wallets` set of lowercase addresses (the mint list). Export with `SMEMBERS vyra:wallets`.
- `vyra:wallet:<address>` original casing + submittedAt.
- `vyra:work` list of work submissions, newest first. Read with `LRANGE vyra:work 0 -1`.

## Things to replace

- Guardian names in `FORGES` (index.html script) are placeholders I named from the art:
  Runebound, Gunmetal, Hexbloom, Crimson, Crescent, Argent, Aurum, Obsidian, Geode.
- Phase descriptions ("For early supporters…") are inferred; confirm them.
- Artwork previews are 340×340. Replacing `assets/*.webp` with 800×800+ versions
  (same file names) will make the large specimen view sharper.
