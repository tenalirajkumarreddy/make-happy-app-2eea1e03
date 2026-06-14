import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync, writeFileSync } from "fs";

/**
 * Performance optimization plugin for production builds:
 * 1. Converts <link rel="stylesheet"> to non-blocking (media="print" onload)
 * 2. Makes registerSW script async
 * 3. Removes modulepreload hints (rely on dynamic import for lazy chunks)
 * 4. Converts modulepreload to prefetch for chunk hints
 */
function performanceOptimizer(): Plugin {
  return {
    name: "performance-optimizer",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        let result = html;

        // 1. ADD a modulepreload for the entry JS chunk to prioritize its download (LCP)
        // Keep existing modulepreloads intact — they are needed for vendor/supabase/query
        const entryJsMatch = result.match(/<script[^>]*?type="module"[^>]*?src="([^"]+)"[^>]*?>/);
        if (entryJsMatch) {
          const entryHref = entryJsMatch[1];
          result = result.replace('</head>', `<link rel="modulepreload" as="script" href="${entryHref}" fetchpriority="high" />\n</head>`);
        }

        // 2. Add preload for CSS stylesheet to start download earlier
        const cssMatch = result.match(/<link\b([^>]*?)rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*?)>/);
        if (cssMatch) {
          const cssHref = cssMatch[3];
          const preloadTag = `<link rel="preload" as="style" href="${cssHref}" fetchpriority="high" />`;
          result = result.replace('</head>', `${preloadTag}\n</head>`);
        }

        // 3. Non-blocking CSS: media="print" onload="this.media='all'"
        result = result.replace(
          /<link\b([^>]*?)rel="stylesheet"([^>]*?)>/g,
          '<link$1rel="stylesheet"$2 media="print" onload="this.media=\u0027all\u0027" />'
        );

        return result;
      },
    },
    // 4. Post-build: make registerSW async (PWA plugin injects after transformIndexHtml)
    closeBundle() {
      const distIndex = path.resolve(__dirname, 'dist', 'index.html');
      try {
        let html = readFileSync(distIndex, 'utf-8');
        html = html.replace(
          /<script\b([^>]*?)src="\/registerSW\.js"([^>]*?)><\/script>/g,
          '<script$1src="/registerSW.js"$2 async></script>'
        );
        writeFileSync(distIndex, html, 'utf-8');
      } catch (e) {
        // Index HTML may not exist if build failed
      }
    },
  };
}

const SUPABASE_CACHE_DAYS = 1;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5003,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  build: {
    target: "es2020",
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query", "@tanstack/react-query-persist-client"],
          sentry: ["@sentry/react"],
          sonner: ["sonner"],
          icons: ["lucide-react"],
          charts: ["recharts"],
          maps: ["leaflet", "react-leaflet"],
          radix: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
  plugins: [
    performanceOptimizer(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: [
        "icons/*.png",
        "favicon.png",
        "logo.png",
        "placeholder.svg",
      ],
      manifest: {
        name: "Aqua Prime",
        short_name: "Aqua Prime",
        description: "Business Management System - Sales, Inventory & Customer Management",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        orientation: "portrait",
        id: "/",
        start_url: "/",
        scope: "/",
        categories: ["business", "productivity"],
        lang: "en",
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,woff,ttf}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
