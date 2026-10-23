const env = (k, d) => Number(process.env[k] ?? d);

const thresholds = () => ({
  rxWarn: env("ALERT_RX_WARN_DBM", -27),
  rxCrit: env("ALERT_RX_CRIT_DBM", -29),
  rxDropWarn: env("ALERT_RX_DROP_WARN_DB", 2),
  rxDropCrit: env("ALERT_RX_DROP_CRIT_DB", 4),
  tempWarn: env("ALERT_TEMP_WARN_C", 70),
  tempCrit: env("ALERT_TEMP_CRIT_C", 80),
  fecWarn: env("ALERT_FEC_HOUR_WARN", 1000),
  fecCrit: env("ALERT_FEC_HOUR_CRIT", 10000),
  wanFlap: env("ALERT_WAN_FLAP_COUNT", 3),
  pppFlap: env("ALERT_PPP_FLAP_COUNT", 3),
  ponMin: env("PON_OUTAGE_MIN", 3),
  ponRatio: env("PON_OUTAGE_RATIO", 0.5)
});

module.exports = { thresholds };
