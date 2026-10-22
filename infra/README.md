# Infra

One compose project (`acs`) for both the VPS and local dev.

| Service | Exposure |
|---|---|
| genieacs-cwmp | `7547` public (preferred CWMP path), and via Caddy on `ACS_DOMAIN` (80/443) |
| cpe-sim | profile `sim`; genieacs-sim using the ACS credentials |
| genieacs-nbi / fs / ui, mongo | `127.0.0.1` only |
| api, dashboard, caddy | profile `prod`; Caddy serves `API_DOMAIN` (`/api/*` → api, rest → dashboard) |

## VPS: first deploy (migrating from the hand-built `/opt/acs`)

    sudo git clone https://github.com/harshjha047/acs.git /opt/acs/repo && sudo chown -R deploy:deploy /opt/acs/repo
    cd /opt/acs/repo/infra
    cp /opt/acs/.env .env
    cat >> .env <<EOF
    COMPOSE_PROFILES=prod
    JWT_SECRET=$(openssl rand -hex 64)
    API_DOMAIN=tr069-api.thediv.in
    ACS_DOMAIN=acs.thediv.in
    ACME_EMAIL=info@thediv.in
    ADMIN_EMAIL=info@thediv.in
    ADMIN_PASSWORD=<min 12 chars>
    EOF
    chmod 600 .env

    docker stop cpe-sim
    (cd /opt/acs && docker compose down)
    docker compose up -d --build
    docker start cpe-sim
    docker compose exec api node scripts/seedAdmin.js

Volumes (`acs_mongo-data`, `acs_caddy-data`) are reused because the project name stays `acs`.
After this works, delete the old `/opt/acs/docker-compose.yml`, `Caddyfile` and `genieacs/` to avoid running the wrong stack.

## VPS: update

    cd /opt/acs/repo && git pull && cd infra && docker compose up -d --build

## Checks

    docker compose ps
    curl -s https://tr069-api.thediv.in/api/health      # {"ok":true}
    curl -s -o /dev/null -w "%{http_code}\n" https://acs.thediv.in/   # 405

## Local dev

    cp .env.example .env   # set COMPOSE_PROFILES= and GENIEACS_UI_PORT=3001
    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # Mongo without auth
    cd ../backend && cp .env.example .env && npm i && npm run seed && npm run dev
    cd ../dashboard && NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run dev

Simulator: add `sim` to `COMPOSE_PROFILES` (e.g. `COMPOSE_PROFILES=sim`).

## One-time extras (VPS)

    cd /opt/acs/repo/infra
    head -c 50M /dev/zero > speedtest/50MB.bin
    docker run --rm --network acs_default -e NBI_URL=http://genieacs-nbi:7557 -v "$PWD":/w node:24-alpine node /w/seedProvision.js
    docker compose up -d

- `speedtest/50MB.bin`: file the router downloads for the TR-143 speed test (`http://ACS_DOMAIN/speedtest/50MB.bin`).
- `seedProvision.js` (re-run after each update): installs provisions/presets `inform` (enables 300 s periodic inform on `0 BOOTSTRAP` / `1 BOOT` only, so a CPE that rejects or rewrites the value cannot cause a set loop on every inform), `fullscan` (full tree read on `0 BOOTSTRAP`, which otherwise leaves the tree mostly empty), `refresh` (light refresh every periodic inform) and `diagnostics` (fetches ping/speed results on `8 DIAGNOSTICS COMPLETE`).

## ACS authentication (`cwmp.auth`)

Every CPE must send `CWMP_USER` / `CWMP_PASS` (set in `.env`). Devices without them are rejected before they are registered.

    docker rm -f cpe-sim                                   # old hand-run simulator
    # .env: COMPOSE_PROFILES=prod,sim  + CWMP_USER / CWMP_PASS (alphanumeric, 16+)
    docker compose up -d --build
    docker compose exec api node scripts/setCwmpAuth.js
    docker compose restart genieacs-cwmp
    docker compose logs --since 10m genieacs-cwmp | grep -iE "auth|inform" | tail

Rollback: `docker compose exec api node scripts/setCwmpAuth.js --off && docker compose restart genieacs-cwmp`

CPE ACS URL, in order of preference:

| URL | Auth | Notes |
|---|---|---|
| `https://acs.thediv.in/` | Basic over TLS | needs CPE TLS support |
| `http://acs.thediv.in:7547/` | Digest | direct to GenieACS |
| `http://acs.thediv.in/` | — | via Caddy over plain HTTP; Digest nonces are bound to the TCP connection, so auth fails here. Avoid once `cwmp.auth` is on |

## Backups

    sudo mkdir -p /opt/acs/backups && sudo chown deploy /opt/acs/backups
    ./backup.sh
    crontab -e   # 30 2 * * * /opt/acs/repo/infra/backup.sh >> /opt/acs/backups/backup.log 2>&1

Off-box: set `BACKUP_RSYNC_TARGET=user@host:/path/` (key-based SSH). Restore:

    docker compose exec -T mongo mongorestore --archive --gzip --drop -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin < /opt/acs/backups/<file>
