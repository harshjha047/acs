const { Schema, model } = require("mongoose");

const ProvisioningTemplateSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  match: {
    manufacturer: { type: String, trim: true },
    productClass: { type: String, trim: true }
  },
  priority: { type: Number, default: 0 },
  wifi: {
    ssid: { type: String, trim: true },
    ssid5: { type: String, trim: true },
    password: { type: String, enum: ["keep", "generate"], default: "keep" }
  },
  params: [{ _id: false, path: String, value: Schema.Types.Mixed, type: { type: String } }],
  tags: [{ type: String }],
  autoApplyToNew: { type: Boolean, default: false },
  armedAt: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

module.exports = model("ProvisioningTemplate", ProvisioningTemplateSchema);
