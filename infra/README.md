# Infra

One compose project (`acs`) for both the VPS and local dev.

| Service | Exposure |
|---|---|
| genieacs-cwmp | `7547` public, and via Caddy on `ACS_DOMAIN` (80/443) |
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

Simulator: `git clone https://github.com/genieacs/genieacs-sim && cd genieacs-sim && npm i && node genieacs-sim -u http://127.0.0.1:7547/ -s 1`

## One-time extras (VPS)

    cd /opt/acs/repo/infra
    head -c 50M /dev/zero > speedtest/50MB.bin
    docker run --rm --network acs_default -e NBI_URL=http://genieacs-nbi:7557 -v "$PWD":/w node:24-alpine node /w/seedProvision.js
    docker compose up -d

- `speedtest/50MB.bin`: file the router downloads for the TR-143 speed test (`http://ACS_DOMAIN/speedtest/50MB.bin`).
- `seedProvision.js`: installs provisions/presets `refresh` (light refresh every periodic inform) and `diagnostics` (fetches ping/speed results on `8 DIAGNOSTICS COMPLETE`).
