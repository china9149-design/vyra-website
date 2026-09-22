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

## Make the forms work (Google Sheets)

Submissions go to the "VYRA submissions" Google Sheet:
- **Mint list** tab: Wallet, Joined at. Each wallet appears once (case-insensitive).
- **Share your work** tab: Post ID, Post URL, Wallet, Note, Submitted at. Each X post appears once
  (matched by post ID, so x.com and twitter.com links to the same post count as duplicates).

Flow: website → `api/submit.js` on Vercel (validates) → Apps Script in the sheet
(`google-apps-script/Code.gs`, enforces uniqueness, writes the row).

Setup:
1. Open the sheet → Extensions → Apps Script. Replace the editor contents with `Code.gs`. Save.
2. Pick `createSecret` in the function dropdown → Run → allow access. Copy the SECRET from the execution log.
3. Deploy → New deployment → type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy, copy the URL ending in `/exec`.
4. Vercel → vyra-website → Settings → Environment Variables, add for Production and Preview:
   `GOOGLE_SCRIPT_URL` = the /exec URL, `GOOGLE_SCRIPT_SECRET` = the secret.
5. Redeploy.

If you edit Code.gs later: Deploy → Manage deployments → edit → Version: New version (keeps the same URL).

## Things to replace

- Guardian names in `FORGES` (index.html script) are placeholders I named from the art:
  Runebound, Gunmetal, Hexbloom, Crimson, Crescent, Argent, Aurum, Obsidian, Geode.
- Phase descriptions ("For early supporters…") are inferred; confirm them.
- Artwork previews are 340×340. Replacing `assets/*.webp` with 800×800+ versions
  (same file names) will make the large specimen view sharper.
