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
  tags: [{ type: String }],
  pppoeUsername: { type: String, index: true },
  macAddress: { type: String, index: true },
  wanIp: { type: String },
  softwareVersion: { type: String },
  rxPower: { type: Number },
  rxGrade: { type: String },
  informInterval: { type: Number },
  lastSummaryAt: { type: Date },
  removedAt: { type: Date, index: true },
  online: { type: Boolean, index: true },
  offlineSince: { type: Date },
  lastBootAt: { type: Date },
  lastSampleAt: { type: Date },
  mon: { type: Schema.Types.Mixed },
  capabilities: { type: Schema.Types.Mixed },
  provisioning: {
    template: { type: Schema.Types.ObjectId, ref: "ProvisioningTemplate" },
    preRegistration: { type: Schema.Types.ObjectId, ref: "PreRegistration" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    state: { type: String, enum: ["pending", "queued", "applied", "failed"] },
    overrides: { type: Schema.Types.Mixed, select: false },
    requestedAt: { type: Date },
    claimedAt: { type: Date },
    queuedAt: { type: Date },
    finishedAt: { type: Date },
    taskId: { type: String },
    auditId: { type: Schema.Types.ObjectId },
    changes: [{ type: String }],
    error: { type: String }
  }
}, { timestamps: true });

DeviceSchema.index({ serialNumber: 1 });
DeviceSchema.index({ "provisioning.state": 1 });
DeviceSchema.index({ tags: 1 });

module.exports = model("Device", DeviceSchema);
