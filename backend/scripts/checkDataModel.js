require("dotenv").config();
const genie = require("../genieacsClient");

(async () => {
  const device = await genie.getDevice(process.argv[2]);
  console.log("Root keys:", Object.keys(device).filter(k => !k.startsWith("_")));
  process.exit(0);
})();
