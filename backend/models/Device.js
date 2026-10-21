const { Schema, model } = require("mongoose");

const DeviceSchema = new Schema({
  genieacsDeviceId: { type: String, required: true, unique: true },
  serialNumber: { type: String, required: true },
  manufacturer: { type: String, required: true },
  productClass: { type: String, required: true },
  oui: { type: String, required: true },
  customer: { type: Schema.Types.ObjectId, ref: "Customer" },
  deviceProfile: { type: Schema.Types.ObjectId, ref: "DeviceProfile" },
  status: { type: String, enum: ["provisioned", "unprovisioned", "flagged", "decommissioned"], default: "unprovisioned" },
  firstSeenAt: { type: Date, default: Date.now },
  lastInformAt: { type: Date },
  tags: [{ type: String }]
}, { timestamps: true });

module.exports = model("Device", DeviceSchema);
