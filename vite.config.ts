import { defineConfig, type Plugin } from 'vite';

const DEFAULT_SITE_URL = 'https://ilovepdf.vossgraves.cyou';

function normalizedSiteUrl(): string {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function staticSeoAssets(): Plugin {
  return {
    name: 'static-seo-assets',
    configResolved(config) {
      if (config.command !== 'build') return;

      const siteUrl = normalizedSiteUrl();

      if (siteUrl === DEFAULT_SITE_URL) {
        console.warn(`[seo] SITE_URL is not set; generated SEO URLs use ${DEFAULT_SITE_URL}. Set SITE_URL explicitly for non-production deployments.`);
      }
    },
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', normalizedSiteUrl());
    },
    generateBundle() {
      const siteUrl = normalizedSiteUrl();
      const sitemapPaths = ['/', '/privacy.html', '/terms.html', '/security.html'];
      const sitemapUrls = sitemapPaths
        .map((pathname) => `  <url>\n    <loc>${xmlEscape(`${siteUrl}${pathname}`)}</loc>\n  </url>`)
        .join('\n');
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`;
      const robots = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;

      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    }
  };
}

export default defineConfig(({ command }) => ({
  plugins: command === 'build' ? [staticSeoAssets()] : [],
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
}));
