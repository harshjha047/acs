const { Schema, model } = require("mongoose");

const CustomerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  accountId: { type: String, required: true, unique: true, trim: true },
  address: { type: String, trim: true },
  connectionDate: { type: Date }
}, { timestamps: true });

CustomerSchema.index({ name: "text", phone: "text", accountId: "text", email: "text" });

module.exports = model("Customer", CustomerSchema);
