const { Schema, model } = require("mongoose");

const DeviceProfileSchema = new Schema({
  manufacturer: { type: String, required: true },
  productClass: { type: String, required: true },
  oui: { type: String },
  parameterMap: { type: Schema.Types.Mixed, default: {} },
  units: { type: Schema.Types.Mixed, default: {} },
  supportsFirmwareUpgrade: { type: Boolean, default: false },
  supportsFactoryReset: { type: Boolean, default: true },
  notes: { type: String },
  verifiedOnRealDevice: { type: Boolean, default: false },
  autoLearned: { type: Boolean, default: true }
}, { timestamps: true, minimize: false });

DeviceProfileSchema.index({ manufacturer: 1, productClass: 1 }, { unique: true });

module.exports = model("DeviceProfile", DeviceProfileSchema);
