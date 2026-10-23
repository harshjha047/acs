require("dotenv").config();
const mongoose = require("mongoose");

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function authExpression(user, pass, ouis = []) {
  const auth = `AUTH("${user}", "${pass}")`;
  if (!ouis.length) return auth;
  return `(${ouis.map(o => `DeviceID.OUI = "${o}"`).join(" OR ")}) AND ${auth}`;
}

function parseOuis(spec) {
  const list = [...new Set(String(spec || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean))];
  for (const o of list) if (!/^[0-9A-F]{6}$/.test(o)) throw new Error(`Invalid OUI "${o}" (6 hex digits)`);
  return list;
}

if (require.main === module) {
  (async () => {
    const off = process.argv.includes("--off");
    const user = process.env.CWMP_USER;
    const pass = process.env.CWMP_PASS;
    const ouis = parseOuis(arg("--oui") ?? process.env.CWMP_OUIS);
    if (!off && (!/^[A-Za-z0-9._-]{3,64}$/.test(user || "") || !/^[A-Za-z0-9]{16,128}$/.test(pass || ""))) {
      console.error("Set CWMP_USER ([A-Za-z0-9._-]{3,64}) and CWMP_PASS (alphanumeric, 16+ chars)");
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const config = mongoose.connection.useDb("genieacs").collection("config");
    if (off) {
      await config.deleteOne({ _id: "cwmp.auth" });
      console.log("cwmp.auth removed: CWMP accepts any device");
    } else {
      await config.updateOne({ _id: "cwmp.auth" }, { $set: { value: authExpression(user, pass, ouis) } }, { upsert: true });
      console.log(`cwmp.auth set for user ${user}; OUIs: ${ouis.length ? ouis.join(", ") : "any"}`);
    }
    await mongoose.disconnect();
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { authExpression, parseOuis };
