require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

(async () => {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars)");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(password, 12);
  const { upsertedCount } = await User.updateOne(
    { email },
    { $set: { passwordHash, role: "admin", isActive: true }, $setOnInsert: { name: process.env.ADMIN_NAME || "Admin", email } },
    { upsert: true }
  );
  console.log(upsertedCount ? `Admin ${email} created` : `Admin ${email} password reset`);
  await mongoose.disconnect();
})();
