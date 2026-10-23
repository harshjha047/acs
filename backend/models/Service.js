const { Schema, model } = require("mongoose");

const ServiceSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: "Customer" },
  device: { type: Schema.Types.ObjectId, ref: "Device", index: true },
  serviceId: { type: String, required: true, unique: true, trim: true },
  plan: { type: String, trim: true },
  pppoeUsername: { type: String, trim: true, index: true },
  ponPort: { type: Schema.Types.ObjectId, ref: "PonPort", index: true },
  onuId: { type: String, trim: true },
  serialNumber: { type: String, trim: true, uppercase: true },
  macAddress: { type: String, trim: true, lowercase: true },
  splitter: { type: String, trim: true },
  vlan: { type: String, trim: true },
  svlan: { type: String, trim: true },
  cvlan: { type: String, trim: true },
  bng: { type: String, trim: true },
  ipv4: { type: String, trim: true },
  ipv6Prefix: { type: String, trim: true },
  status: { type: String, enum: ["pending", "active", "suspended", "terminated"], default: "pending" },
  activatedAt: { type: Date }
}, { timestamps: true });

module.exports = model("Service", ServiceSchema);
