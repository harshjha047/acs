const crypto = require("node:crypto");

const key = () => crypto.createHash("sha256").update(process.env.MFA_ENC_KEY || `mfa:${process.env.JWT_SECRET}`).digest();

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), ct].map(x => (typeof x === "string" ? x : x.toString("base64url"))).join(":");
}

function open(blob) {
  const [v, iv, tag, ct] = String(blob || "").split(":");
  if (v !== "v1") throw new Error("Unsupported secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

module.exports = { seal, open };
