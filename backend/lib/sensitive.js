const SENSITIVE_PATH = /pass(word|wd|phrase)?$|passwd|passphrase|presharedkey|\.WEPKey$|\bpsk\b|wpapsk|secret|privatekey|certificate|\.ConfigFile$|ServiceManage\.\w*User(Name)?$|(ftp|telnet|ssh|snmp|tftp)User(Name)?$|\.X_[A-Z0-9-]+_(Key|PIN)$/i;
const SENSITIVE_VALUE = /(pass(word|wd)?|psk|passphrase|secret)["'=: ]/i;

const isSensitive = (path, value) =>
  SENSITIVE_PATH.test(path) || (typeof value === "string" && value.length > 64 && SENSITIVE_VALUE.test(value));

const mask = (path, value) => (value !== null && value !== undefined && value !== "" && isSensitive(path, value) ? "(hidden)" : value ?? null);

module.exports = { isSensitive, mask };
