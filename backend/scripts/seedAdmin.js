require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash("changeme123", 10);
  await User.create({ name: "Admin", email: "admin@local", passwordHash, role: "admin" });
  console.log("Admin created");
  process.exit(0);
})();
