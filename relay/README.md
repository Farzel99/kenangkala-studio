# Kenangkala relay: setup

The Command Center (`index.html`) talks to Instagram directly from your browser.
**TikTok auto-refresh** and **Notion sync** go through this small relay instead. You
run it in your own free Cloudflare account, so no other person or company sits in
between. Your secret keys stay in Cloudflare and are never put in the website files.

You only need the relay if you want TikTok without pasting a new token every day,
or live Notion sync. The CSV buttons on the Content Calendar work without it.

## 1. Create the relay (about 5 minutes)

1. Sign in at <https://dash.cloudflare.com>, then go to **Workers & Pages → Create → Create Worker**.
2. Name it, for example `kenangkala-relay`, then click **Deploy**.
3. Click **Edit code**, delete the sample code, paste in everything from `relay/worker.js`, then click **Deploy**.
4. Go to **Settings → Variables and Secrets** and add these as **Secret**:
   - `RELAY_KEY`: make up a long random password.
   - The Notion and TikTok secrets from steps 2 and 3 below.
5. Copy the worker URL, for example `https://kenangkala-relay.<you>.workers.dev`.
6. In the Command Center, open **Settings & Connections → Your relay**, paste the URL and
   your `RELAY_KEY`, then press **Save & test relay**.

## 2. Notion

1. Go to <https://www.notion.so/profile/integrations>, then **New integration** (Internal).
   Copy the secret into the relay as `NOTION_TOKEN`.
2. Open your content calendar database in Notion, then **••• → Connections → add your integration**.
3. In the Command Center, paste the database link and check the column names
   (default: `Name`, `Date`, `Status`, `Platform`).
4. On the Content Calendar, **Pull from Notion** brings Notion items in, and **Push to Notion**
   adds Content Bank ideas that are not in Notion yet. Push skips items that already match
   on title and date, so it won't create duplicates.

## 3. TikTok

1. Create an app at <https://developers.tiktok.com>. Add **Login Kit** and the
   **Display API** scopes `user.info.basic`, `user.info.stats` and `video.list`, then submit it for review.
2. Sign in once with your TikTok account through Login Kit to get a **refresh token**
   (valid for 365 days).
3. Add `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and `TIKTOK_REFRESH_TOKEN` to the relay.
4. In the Command Center, set TikTok's connection to **Through my relay**.

## Instagram (no relay needed)

You need an Instagram **Business or Creator** account. Create a Meta app with the
**Instagram API with Instagram Login**, then generate a long-lived token with
`instagram_business_basic` and `instagram_business_manage_insights`. Paste it into
**Settings & Connections → Instagram**. Long-lived tokens last 60 days.

## What the relay will and won't do

It forwards only these requests: read a Notion database, query it, create a Notion page,
read TikTok profile stats and list TikTok videos. Every request must carry your `RELAY_KEY`.
It does not store anything.
