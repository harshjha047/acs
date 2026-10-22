require("dotenv").config();
const mongoose = require("mongoose");

const QUIRKS = {
  "00177C": { note: "Realtek xPON (DG-GR6821AC): NextLevel=false GPN returns incomplete subtrees", gpnNextLevel: 16, maxCommitIterations: 128 }
};
const DEFAULTS = { gpnNextLevel: 0, maxCommitIterations: 32 };

const expr = key => {
  const cases = Object.entries(QUIRKS).filter(([, q]) => q[key] !== undefined).map(([oui, q]) => `WHEN DeviceID.OUI = "${oui}" THEN ${q[key]}`);
  return cases.length ? `CASE ${cases.join(" ")} ELSE ${DEFAULTS[key]} END` : null;
};

(async () => {
  const args = process.argv.slice(2);
  const off = args.includes("--off");
  const debugIdx = args.indexOf("--debug");
  await mongoose.connect(process.env.MONGO_URI);
  const config = mongoose.connection.useDb("genieacs").collection("config");

  if (debugIdx >= 0) {
    const oui = args[debugIdx + 1];
    if (oui === "off") {
      await config.deleteOne({ _id: "cwmp.debug" });
      console.log("cwmp.debug removed");
    } else if (/^[0-9A-F]{6}$/i.test(oui || "")) {
      await config.updateOne({ _id: "cwmp.debug" }, { $set: { value: `DeviceID.OUI = "${oui.toUpperCase()}"` } }, { upsert: true });
      console.log(`cwmp.debug on for OUI ${oui.toUpperCase()}`);
    } else {
      console.error("Usage: --debug <OUI>|off");
      process.exitCode = 1;
    }
    return mongoose.disconnect();
  }
  for (const key of Object.keys(DEFAULTS)) {
    const id = `cwmp.${key}`;
    const value = expr(key);
    if (off || !value) {
      await config.deleteOne({ _id: id });
      console.log(`${id} removed`);
    } else {
      await config.updateOne({ _id: id }, { $set: { value } }, { upsert: true });
      console.log(`${id} = ${value}`);
    }
  }
  await mongoose.disconnect();
})();
