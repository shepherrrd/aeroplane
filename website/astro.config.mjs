import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [
    starlight({
      title: "Aeroplane Docs",
      description:
        "Documentation for installing and running Aeroplane, a self-hosted deployment control plane for apps and databases.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/docs.css"],
      disable404Route: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/xt42io/aeroplane",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            "docs",
            "docs/getting-started/install",
            "docs/getting-started/onboarding",
            "docs/getting-started/first-project",
          ],
        },
        {
          label: "Core concepts",
          items: [
            "docs/core-concepts/architecture",
            "docs/core-concepts/projects-and-services",
          ],
        },
        {
          label: "Deployments",
          items: [
            "docs/deployments/source-services",
            "docs/deployments/docker-image-services",
            "docs/deployments/static-sites-and-workers",
            "docs/deployments/environment-variables",
            "docs/deployments/deployment-lifecycle",
          ],
        },
        {
          label: "Migration",
          items: [
            "docs/migration/railway-import",
            "docs/migration/aeroplane-bundles",
          ],
        },
        {
          label: "Databases",
          items: [
            "docs/databases/overview",
            "docs/databases/data-browser",
            "docs/databases/data-imports",
            "docs/databases/public-access-and-tls",
          ],
        },
        {
          label: "Storage and backups",
          items: [
            "docs/storage-and-backups/r2-storage",
            "docs/storage-and-backups/database-backups",
            "docs/storage-and-backups/restore-and-download",
          ],
        },
        {
          label: "Operations",
          items: [
            "docs/operations/domains",
            "docs/operations/dns-providers",
            "docs/operations/system-maintenance",
            "docs/operations/system-updates",
            "docs/operations/troubleshooting",
          ],
        },
        {
          label: "Reference",
          items: [
            "docs/reference/system-settings",
          ],
        },
      ],
      components: {
        SiteTitle: "./src/components/docs-site-title.astro",
        ThemeSelect: "./src/components/docs-theme-select.astro",
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
