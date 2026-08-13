# SEO setup for PaperMosaic

The production build now emits `sitemap.xml` and `robots.txt` into `dist/`. It also replaces the canonical URL, Open Graph URL, and JSON-LD URL with the value of the `SITE_URL` environment variable.

## Before deploying

The configured production origin is **https://ilovepdf.vossgraves.cyou**. Set `SITE_URL` explicitly during deployment, including `https://` and without a trailing slash:

```bash
SITE_URL=https://ilovepdf.vossgraves.cyou npm run build
```

If `SITE_URL` is omitted, the build falls back to `https://ilovepdf.vossgraves.cyou` and prints a warning. Use the explicit command above for production and use a different `SITE_URL` for staging or preview deployments. The build output should contain these files:

| File | Purpose |
|---|---|
| `dist/sitemap.xml` | Lists the canonical homepage and public policy pages for search crawlers. |
| `dist/robots.txt` | Allows crawling and points crawlers to the sitemap. |
| `dist/index.html` | Contains the title, description, canonical URL, Open Graph metadata, Twitter metadata, and WebApplication JSON-LD. |

The current application is a single-page app, so the sitemap contains the homepage plus the independently rendered `/privacy.html`, `/terms.html`, and `/security.html` pages. Tool cards open client-side modals rather than independent crawlable URLs. Adding fake `/merge-pdf` or `/ocr-pdf` URLs would create pages that do not independently render, so dedicated SEO landing pages should be added before those URLs are placed in the sitemap.

## Public policy and license pages

The build also publishes `/privacy.html`, `/terms.html`, and `/security.html`. Replace the contact and operator placeholders in those drafts before publishing. The repository is licensed under Apache License 2.0 and includes a `NOTICE` file; redistributors must preserve the license and notices, and a visible “Powered by PaperMosaic” credit is requested where practical.

## Google Search Console

1. Deploy the production build to **https://ilovepdf.vossgraves.cyou** and confirm that `https://ilovepdf.vossgraves.cyou/sitemap.xml` and `https://ilovepdf.vossgraves.cyou/robots.txt` load publicly in a browser.
2. Open [Google Search Console](https://search.google.com/search-console) and add a property. A **Domain property** covers the domain and its protocol/subdomain variants but requires DNS verification. A **URL-prefix property** is narrower and supports HTML-file or HTML-tag verification.
3. The simplest option for this Vite deployment is usually **HTML file upload**. Google will give you a file named similar to `google1234567890abcdef.html`. Put that exact file in the repository’s `public/` directory, deploy again, and confirm it is available at `https://ilovepdf.vossgraves.cyou/google1234567890abcdef.html`. Do not rename it or remove it after verification.
4. If you prefer **DNS verification**, add the TXT record Google provides at the domain’s DNS provider. This does not require a code change, but DNS propagation can take time.
5. If you choose **HTML tag verification**, send the `content` value from Google’s tag to the developer. It can be added to the `<head>` of `index.html`; do not send a password or API key.
6. After ownership is verified, open the **Sitemaps** report and submit `sitemap.xml` (or the full URL if Search Console requests it). Google will show whether it fetched and parsed the file successfully.
7. Use URL Inspection for the homepage after deployment. Request indexing only after the page, canonical URL, robots.txt, and sitemap are all publicly reachable.

## What you need to provide

To finish the setup, the public production URL is **https://ilovepdf.vossgraves.cyou**. Tell the developer which verification method you want to use. If you choose HTML-file verification, upload the Google verification file to the repository or send it here. If you choose HTML-tag verification, provide only the verification token value. If you choose DNS verification, you can perform the DNS change yourself and then tell the developer when it is complete.

## References

- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google Search Console Help: Verify your site ownership](https://support.google.com/webmasters/answer/9008080)
- [Google Search Console Help: Sitemaps report](https://support.google.com/webmasters/answer/7451001)
