const { Schema, model } = require("mongoose");

const PreRegistrationSchema = new Schema({
  serialNumber: { type: String, trim: true, uppercase: true },
  macAddress: { type: String, trim: true, lowercase: true },
  customer: { type: Schema.Types.ObjectId, ref: "Customer" },
  template: { type: Schema.Types.ObjectId, ref: "ProvisioningTemplate" },
  ssid: { type: String },
  ssid5: { type: String },
  wifiPassword: { type: String, select: false },
  tags: [{ type: String }],
  note: { type: String, trim: true },
  status: { type: String, enum: ["waiting", "matched", "cancelled"], default: "waiting", index: true },
  device: { type: Schema.Types.ObjectId, ref: "Device" },
  matchedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  revealed: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: "User" }, at: Date }]
}, { timestamps: true });

PreRegistrationSchema.index({ serialNumber: 1 }, { unique: true, partialFilterExpression: { status: "waiting", serialNumber: { $type: "string" } } });
PreRegistrationSchema.index({ macAddress: 1 }, { unique: true, partialFilterExpression: { status: "waiting", macAddress: { $type: "string" } } });

module.exports = model("PreRegistration", PreRegistrationSchema);
