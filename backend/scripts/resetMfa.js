require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error("Usage: node scripts/resetMfa.js <email>");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const { matchedCount } = await User.updateOne({ email }, { $unset: { mfa: 1, lockedUntil: 1 }, $set: { failedLogins: 0 }, $inc: { tokenVersion: 1 } });
  console.log(matchedCount ? `MFA reset and sessions revoked for ${email}; set up again at next sign-in` : `No user ${email}`);
  await mongoose.disconnect();
})();
