# Topology import (Batch 8)

Maps ONUs to OLT → PON port so the ACS can tell a PON outage from a customer-side fault.

## CSV
`Topology → Import` (admin, `topology.write`). Delimiter `,` `;` or tab (auto). Header names are case-insensitive.

| Column | Required | Notes |
|---|---|---|
| `olt` | yes | OLT name (unique) |
| `pon` | yes* | `EPON0/1`, `0/1`, `0/2/7`. *Or derived from `onu_id` |
| `onu_id` | one of | `EPON0/1:29` |
| `serial` / `mac` / `pppoe` | one of | Used to match the ACS device (serial → MAC → serial ending in MAC hex → PPPoE) |
| `pop`, `olt_vendor`, `olt_model`, `olt_ip`, `pon_type` | no | `pon_type` EPON/GPON/XGS (guessed from `pon`) |
| `account`, `customer_name`, `phone` | no | Links the customer; creates it when `customer_name` is given |
| `service_id` | no | Defaults to `pppoe`, then `olt/onu_id`, serial, MAC. Re-import updates by this key |
| `plan`, `vlan`, `splitter`, `status` | no | `status`: pending/active/suspended/terminated |

Always **Dry run** first. Rows with errors are skipped. Devices that have not informed yet stay "not matched"; re-import later to link them.

## Behaviour
- Intel hook (every `INTEL_INTERVAL_SEC`, 300 s): health score, trend alerts, PON outages.
- `pon_outage`: ≥ `PON_OUTAGE_MIN` (3) mapped ONUs offline **and** ≥ `PON_OUTAGE_RATIO` (0.5) of the port. Offline alerts of devices inside the outage are grouped under it on Outage & alerts.
- Trend alerts: `optical_degrading` (Rx drop vs 24 h ago, verified profiles), `high_temp`, `high_fec` (FEC/h), `wan_flapping`, `ppp_flapping` (per hour), `lan_100m` (gigabit port at 100 M), `firmware_changed` (not by an ACS job).
