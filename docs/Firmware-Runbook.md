# Firmware & Factory Reset Runbook

## How it works
- Release file lives in GenieACS FS (GridFS in the `genieacs` DB, so it is in backups). CPEs fetch it from `http://acs.thediv.in/fw/<file>` (Caddy → genieacs-fs; `GENIEACS_FS_URL_PREFIX`).
- A push queues an NBI `download` task (FileType `1 Firmware Upgrade Image`). Behind CGNAT it runs at the next inform (≤ 5 min).
- Job states: `sent` (task queued) → `downloading` (task taken by device) → `rebooting` (offline) → `applied` (device reports the release version) | `failed` (CWMP fault, rebooted on old version, no upgrade in `FIRMWARE_APPLY_TIMEOUT_MIN` (60), not picked up in `FIRMWARE_PICKUP_TIMEOUT_H` (24)) | `skipped` (not eligible at send time, or rollout halted).
- Eligibility: same manufacturer/product class, profile `supportsFirmwareUpgrade`, current version known and ≠ target, in from-versions (if set), hardware version in list (if set), no provisioning in progress, no other active job.

## Before the first push
1. Get the image from the vendor with its target `SoftwareVersion` string, supported hardware versions and sha256.
2. Confirm a recovery path for this model **before** pushing: OLT-side reboot/ONU reset, local web UI upgrade (superuser), vendor TFTP/serial tool. If none, do not push.
3. Enable the model: `[VPS] docker compose exec api node scripts/setProfile.js "<Mfr>" "<Class>" --firmware on`
4. Record a baseline of the bench device (Device → All parameters → capture).

## Bench test (required before approve)
1. Firmware → Upload release (stays `draft`).
2. Bench device (not a customer ONU) → Overview → Firmware → Upgrade, with a reason.
3. Watch: Waiting for check-in → Downloading → Rebooting → Applied. Typical: download + flash + boot 3–10 min.
4. Verify after upgrade: online, optical Rx/Tx same as baseline, PPPoE up, Wi-Fi SSIDs unchanged, ACS URL/creds kept, inform interval 300 s, Readiness score same.
5. Leave it 48 h. Wider rollout needs 0 failures across 5 test devices over 48 h, signed off by the team lead.
6. Firmware → Approve (only possible after a bench job is Applied).

## Rollout
- Tag canary devices (`canary`), New rollout → target tags, waves `5,50,500,0` (0 = rest), max fail % (default 5), window (default 01:00–05:00 IST), reason.
- Only online devices are picked, at most `FIRMWARE_MAX_SEND` (20) per minute.
- Each wave pauses when done. Check the wave (Details), then Promote.
- Auto-halt when failed / (applied + failed) > max fail %. Halt cancels tasks not yet picked up; devices already downloading continue.

## Halt criteria (manual)
- Any device not back online 30 min after Downloading.
- Any optical / PPPoE / Wi-Fi regression on upgraded devices.
- Customer complaints mentioning the upgraded devices.
- Vendor advisory against the image.

## Recovery
1. Device offline after upgrade: wait 15 min (some images do two boots).
2. OLT: check the ONU registers (`EPON0/x:y`); reboot the ONU from the OLT.
3. Registers but no inform: OLT re-push of the ACS settings (any OLT TR-069 change reboots the Realtek model).
4. Boots on old version: image rejected (wrong HW/signature); retire the release, collect the fault from Device → History.
5. No register: field visit; local web UI or vendor TFTP recovery; replace the unit if bricked.
6. Record the outcome in device notes; update the release notes.

## Factory reset
- Admin only; type the serial; reason required; audited as `factory_reset` (pending until the device boots again, failed after 6 h).
- It wipes ACS URL/credentials, PPPoE and Wi-Fi. The OLT must re-push the ACS settings; PPPoE must be restored by OLT/OMCI or a technician.
- "Re-apply the last provisioning template" re-queues the device's last template (with its stored Wi-Fi overrides) when it comes back.
- Customer ONUs: network-team approval, night hours.

## Comms
- Before a wave > 50 devices: inform NOC + support (window, expected 5 min outage per device).
- On halt: post in the NOC channel with the halt reason and affected count (Firmware → Details).
