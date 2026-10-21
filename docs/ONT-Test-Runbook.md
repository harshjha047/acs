# ONT Test Window Runbook (1–2 hours)

Goal: in one short session with a real ONT, prove Phase 1 (connect → diagnose → reboot) and capture everything needed to finish vendor mapping offline.

## Before the session (do the day before)

- [ ] VPS up to date: `cd /opt/acs/repo && git pull && cd infra && docker compose up -d --build`
- [ ] One-time extras done (`infra/README.md` → speed test file + `seedProvision.js`)
- [ ] `https://tr069-api.thediv.in` login works; simulator device still shows **online**
- [ ] Ask network team for: ONT model, **super-admin login** for its web UI, which **WAN/VLAN carries internet**, and whether the OLT already pushes an ACS URL
- [ ] Laptop: browser logged into dashboard, SSH session open to VPS
- [ ] Phone hotspot available (fallback internet for the laptop)

## ONT settings (web UI → TR-069 / Remote Management / ACS)

| Field | Value |
|---|---|
| TR-069 enable | On |
| ACS URL | `http://acs.thediv.in/` (fallback `http://154.49.142.251:7547/`) |
| ACS username / password | blank |
| Periodic inform | On, **60 s** for the session (set back to 300 after) |
| Connection request user / password | `acs` / `acs12345` |
| WAN binding for TR-069 | the **INTERNET** WAN, or `TR069_INTERNET` |

## Session timeline

| Time | Step | Done when |
|---|---|---|
| 0–10 min | Configure ONT as above, save, reboot ONT if asked | — |
| 10–15 | VPS: `docker compose -f /opt/acs/repo/infra/docker-compose.yml logs -f genieacs-cwmp` → watch for its Inform | Device appears in **Devices** list |
| 15–25 | Device → **Readiness** → **1. Fetch everything** (can take 1–3 min) → **2. Re-check** | ≥ 300 parameters |
| 25–30 | **3. Download capture** — save the JSON file (most important artifact) | File saved |
| 30–40 | **Overview**: compare Rx/Tx power with the ONT web UI’s optical page; note exact values | Values match, or note raw value + ONT value |
| 40–50 | **Wi-Fi & devices**: connect a phone, Fetch live list, check signal; Edit SSID → test name, confirm phone sees it; change back | SSID change applied |
| 50–60 | **Tools**: Ping 8.8.8.8, then speed test | Results shown (or fault code noted) |
| 60–70 | **Reboot** from dashboard; time how long until it shows online again | Rebooted + back online (**Phase 1 exit**) |
| 70–80 | **History & notes** shows all actions; add a note with findings | — |
| 80–90 | Set periodic inform back to 300 s; hand device back | — |

## If something fails

| Symptom | Check |
|---|---|
| No Inform in cwmp logs | WAN binding / VLAN; ONT can reach internet? Try IP URL; `curl http://acs.thediv.in/` from a phone on the ONT Wi-Fi should return 405 |
| Device listed but actions say "queued" | Connection request blocked (ONT behind NAT/CGNAT). Expected; actions run at next inform (60 s during session) |
| Rx power missing | Readiness → "Optical / PON parameters found" table: screenshot it |
| Rx power value wrong | Note raw value and ONT UI value; fix later with profile `units` |
| Wi-Fi edit fault 9007/9005 | Note fault from History; path differs, mapped later from capture |
| Ping / speed test fault | Note fault code; some ONTs need `Interface` set or lack TR-143 |

## After the session

- Send the capture JSON + notes; unverified paths get confirmed and the device profile is marked **verified**.
