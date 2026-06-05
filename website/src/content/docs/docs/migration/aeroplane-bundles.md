---
title: Aeroplane Bundles
description: Export and import encrypted Aeroplane migration bundles between servers.
---

Aeroplane bundles move an Aeroplane instance from one server to another. They are different from Railway imports: a bundle is an Aeroplane-to-Aeroplane migration format.

## Export a Bundle

Open System Settings, choose Migration, and export the instance. You must enter a passphrase with at least 8 characters.

Aeroplane creates a `.aeroplane` file. The file is an encrypted archive, so keep the passphrase with the same care you would give a database backup key.

## What the Bundle Includes

The export includes:

- `manifest.json`
- `runtime-env.json`
- `system-settings.json`
- `logical-data.json`
- Database dumps for database services.
- Static site files when present.
- Backup files when present.
- Postgres TLS assets when present.
- Caddyfile when present.

Logical data includes project groups, projects, services, deployments, deployment logs, environment variables, domains, database backup records, database backup settings, service import sources, and users.

## Database Dumps

During export, Aeroplane creates disk backups for database services and copies those backup files into the bundle.

The bundle records each dump's service ID, engine, format, size, and checksum. Import validates the checksum before restoring a dump.

## Import a Bundle

During onboarding on the target server, choose the `.aeroplane` file and enter the passphrase from the source server.

Aeroplane decrypts the bundle, validates the manifest, writes managed runtime env, saves system settings, replaces logical data, restores optional files, restores database dumps, reloads Caddy, restores users, and clears auth sessions.

## Runtime Env Merge

Some runtime values must stay local to the target server. On import, Aeroplane preserves target values for:

- `DATA_DIR`
- `CADDY_CONFIG_PATH`
- `CADDY_RELOAD_CMD`
- `PORT`
- `HOST`
- `PUBLIC_URL`
- `BUILDKIT_HOST`
- `AEROPLANE_RUNTIME_NETWORK`

This keeps the restored instance aligned with the new server layout instead of blindly copying paths from the old server.

## After Import

After import, sign in with the restored owner account and inspect:

- Dashboard domain and wildcard root domain.
- GitHub App credentials and webhook URL.
- R2 connection.
- DNS provider credentials.
- Database services and restored data.
- App services queued for redeploy.

If a restored app service depends on registry credentials, SSH keys, or host-level tools that were not in the bundle, configure those on the target server before redeploying.
