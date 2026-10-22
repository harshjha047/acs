require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  const off = process.argv.includes("--off");
  const user = process.env.CWMP_USER;
  const pass = process.env.CWMP_PASS;
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
    await config.updateOne({ _id: "cwmp.auth" }, { $set: { value: `AUTH("${user}", "${pass}")` } }, { upsert: true });
    console.log(`cwmp.auth set for user ${user}`);
  }
  await mongoose.disconnect();
})();
