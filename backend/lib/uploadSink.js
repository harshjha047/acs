const crypto = require("node:crypto");

const MAX_BYTES = () => Number(process.env.UPLOAD_SINK_MAX_BYTES) || 200 * 1024 * 1024;
const testBytes = () => Number(process.env.UPLOAD_TEST_BYTES) || 10 * 1024 * 1024;
const token = () => process.env.UPLOAD_TOKEN || crypto.createHmac("sha256", process.env.JWT_SECRET).update("tr143-upload").digest("hex").slice(0, 32);
const url = () => `${process.env.SPEEDTEST_UPLOAD_BASE.replace(/\/$/, "")}/${token()}`;
const redact = u => String(u).replace(token(), "…");

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function handler(req, res) {
  if (!safeEqual(req.params.token, token())) {
    res.status(404).end();
    return req.resume();
  }
  let received = 0;
  const max = MAX_BYTES();
  req.on("data", chunk => {
    received += chunk.length;
    if (received > max) {
      res.status(413).end();
      req.destroy();
    }
  });
  req.on("end", () => !res.headersSent && res.status(201).end());
  req.on("error", () => {});
}

module.exports = { handler, url, redact, testBytes, token };
