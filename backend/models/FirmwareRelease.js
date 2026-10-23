const { Schema, model } = require("mongoose");

const FirmwareReleaseSchema = new Schema({
  manufacturer: { type: String, required: true, trim: true },
  productClass: { type: String, required: true, trim: true },
  oui: { type: String, trim: true },
  hardwareVersions: [{ type: String, trim: true }],
  fromVersions: [{ type: String, trim: true }],
  version: { type: String, required: true, trim: true },
  fileName: { type: String, required: true, unique: true },
  fileSize: { type: Number },
  sha256: { type: String, required: true },
  releaseNotes: { type: String },
  status: { type: String, enum: ["draft", "approved", "retired"], default: "draft", index: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  approvedAt: { type: Date },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

FirmwareReleaseSchema.index({ manufacturer: 1, productClass: 1, version: 1 }, { unique: true });

module.exports = model("FirmwareRelease", FirmwareReleaseSchema);
