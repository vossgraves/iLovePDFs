# SEO setup for iLovePDF

The production build now emits `sitemap.xml` and `robots.txt` into `dist/`. It also replaces the canonical URL, Open Graph URL, and JSON-LD URL with the value of the `SITE_URL` environment variable.

## Before deploying

Set `SITE_URL` to the real public origin, including `https://` and without a trailing slash. For example:

```bash
SITE_URL=https://pdf.example.com npm run build
```

If `SITE_URL` is omitted, the build remains valid but uses `https://example.com` as a visible placeholder and prints a warning. Do not deploy with that placeholder. The build output should contain these files:

| File | Purpose |
|---|---|
| `dist/sitemap.xml` | Lists the canonical homepage for search crawlers. |
| `dist/robots.txt` | Allows crawling and points crawlers to the sitemap. |
| `dist/index.html` | Contains the title, description, canonical URL, Open Graph metadata, Twitter metadata, and WebApplication JSON-LD. |

The current application is a single-page app, so the sitemap intentionally contains the homepage only. Tool cards open client-side modals rather than independent crawlable URLs. Adding fake `/merge-pdf` or `/ocr-pdf` URLs would create pages that do not independently render, so dedicated SEO landing pages should be added before those URLs are placed in the sitemap.

## Google Search Console

1. Deploy the production build to the real domain and confirm that `https://YOUR-DOMAIN/sitemap.xml` and `https://YOUR-DOMAIN/robots.txt` load publicly in a browser.
2. Open [Google Search Console](https://search.google.com/search-console) and add a property. A **Domain property** covers the domain and its protocol/subdomain variants but requires DNS verification. A **URL-prefix property** is narrower and supports HTML-file or HTML-tag verification.
3. The simplest option for this Vite deployment is usually **HTML file upload**. Google will give you a file named similar to `google1234567890abcdef.html`. Put that exact file in the repository’s `public/` directory, deploy again, and confirm it is available at `https://YOUR-DOMAIN/google1234567890abcdef.html`. Do not rename it or remove it after verification.
4. If you prefer **DNS verification**, add the TXT record Google provides at the domain’s DNS provider. This does not require a code change, but DNS propagation can take time.
5. If you choose **HTML tag verification**, send the `content` value from Google’s tag to the developer. It can be added to the `<head>` of `index.html`; do not send a password or API key.
6. After ownership is verified, open the **Sitemaps** report and submit `sitemap.xml` (or the full URL if Search Console requests it). Google will show whether it fetched and parsed the file successfully.
7. Use URL Inspection for the homepage after deployment. Request indexing only after the page, canonical URL, robots.txt, and sitemap are all publicly reachable.

## What you need to provide

To finish the setup, provide the public production URL and tell the developer which verification method you want to use. If you choose HTML-file verification, upload the Google verification file to the repository or send it here. If you choose HTML-tag verification, provide only the verification token value. If you choose DNS verification, you can perform the DNS change yourself and then tell the developer when it is complete.

## References

- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google Search Console Help: Verify your site ownership](https://support.google.com/webmasters/answer/9008080)
- [Google Search Console Help: Sitemaps report](https://support.google.com/webmasters/answer/7451001)
