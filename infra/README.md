# Infra: GenieACS + simulator

## Start GenieACS
    docker compose up -d --build
    docker compose ps

- CWMP (devices): :7547
- NBI (your API only): 127.0.0.1:7557
- GenieACS UI: http://localhost:3001 (mapped to 3001 so it doesn't clash with the Next.js dashboard on 3000)
- MongoDB: 127.0.0.1:27017 (the backend uses a separate `acs_app` DB on the same server)

First visit to the GenieACS UI: create a user from the login screen prompt if asked (GenieACS 1.2 allows any login when auth isn't configured).

## Virtual router (simulator)
    git clone https://github.com/zaidka/genieacs-sim.git
    cd genieacs-sim
    npm install
    node genieacs-sim -u http://127.0.0.1:7547/

Simulates device `202BC1-BM632w-000000`. Leave it running; it informs every 300s.
More devices: `node genieacs-sim -u http://127.0.0.1:7547/ -p 5 -s 1` (serial offset avoids the 000000 clash).

Note: connection-request push fails from Docker on localhost (NAT). Tasks are delivered on the next periodic inform instead. Expected locally, not on a VPS.

## Provisioning the ACS database for a VPS
Open 7547 only. Keep 7557, 27017 and the UI private.
