require("dotenv").config();
const genie = require("../genieacsClient");

(async () => {
  console.log(JSON.stringify(await genie.getDevice(process.argv[2]), null, 2));
  process.exit(0);
})();
