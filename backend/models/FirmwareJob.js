const { Schema, model } = require("mongoose");

const STATES = ["queued", "sent", "downloading", "rebooting", "applied", "failed", "skipped"];

const FirmwareJobSchema = new Schema({
  rollout: { type: Schema.Types.ObjectId, ref: "FirmwareRollout" },
  release: { type: Schema.Types.ObjectId, ref: "FirmwareRelease", required: true },
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  wave: { type: Number },
  fromVersion: { type: String },
  toVersion: { type: String },
  taskId: { type: String },
  state: { type: String, enum: STATES, default: "queued" },
  sentAt: { type: Date },
  executedAt: { type: Date },
  finishedAt: { type: Date },
  error: { type: String },
  auditId: { type: Schema.Types.ObjectId },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

FirmwareJobSchema.index({ rollout: 1, device: 1 }, { unique: true, partialFilterExpression: { rollout: { $type: "objectId" } } });
FirmwareJobSchema.index({ state: 1 });
FirmwareJobSchema.index({ device: 1, createdAt: -1 });
FirmwareJobSchema.index({ rollout: 1, wave: 1, state: 1 });

module.exports = Object.assign(model("FirmwareJob", FirmwareJobSchema), { STATES });
