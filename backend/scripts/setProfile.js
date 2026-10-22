require("dotenv").config();
const mongoose = require("mongoose");
const DeviceProfile = require("../models/DeviceProfile");

const UNITS = ["dBm", "0.1dBm", "0.001dBm", "0.1uW", "uW"];
const usage = () => {
  console.error('Usage: setProfile.js "<Manufacturer>" "<ProductClass>" [--units rxPower=0.1uW,txPower=0.1uW] [--verified] [--note "text"]');
  process.exit(1);
};

(async () => {
  const [manufacturer, productClass, ...rest] = process.argv.slice(2);
  if (!manufacturer || !productClass) usage();
  const $set = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--verified") Object.assign($set, { verifiedOnRealDevice: true, autoLearned: false });
    else if (rest[i] === "--note") $set.notes = rest[++i];
    else if (rest[i] === "--units") {
      for (const pair of String(rest[++i] || "").split(",")) {
        const [k, u] = pair.split("=");
        if (!["rxPower", "txPower"].includes(k) || !UNITS.includes(u)) usage();
        $set[`units.${k}`] = u;
      }
    } else usage();
  }
  await mongoose.connect(process.env.MONGO_URI);
  const p = await DeviceProfile.findOneAndUpdate({ manufacturer, productClass }, { $set }, { new: true }).lean();
  console.log(p ? JSON.stringify({ manufacturer: p.manufacturer, productClass: p.productClass, units: p.units, verified: p.verifiedOnRealDevice, parameterMap: p.parameterMap }, null, 2) : "Profile not found (open the device page once so it is auto-learned)");
  await mongoose.disconnect();
})();
