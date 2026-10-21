const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const DeviceProfile = require("../models/DeviceProfile");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

const UNITS = ["dBm", "0.1dBm", "0.001dBm", "0.1uW", "uW"];

router.get("/", async (req, res) => res.json(await DeviceProfile.find().sort({ manufacturer: 1, productClass: 1 }).lean()));

router.patch("/:id", requireRole("admin"), async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const { parameterMap, units, notes, verifiedOnRealDevice, supportsFirmwareUpgrade, supportsFactoryReset } = req.body || {};
  if (units && Object.values(units).some(u => u && !UNITS.includes(u))) return res.status(400).json({ error: `Units must be one of ${UNITS.join(", ")}` });
  const update = Object.fromEntries(Object.entries({ parameterMap, units, notes, verifiedOnRealDevice, supportsFirmwareUpgrade, supportsFactoryReset }).filter(([, v]) => v !== undefined));
  if (verifiedOnRealDevice) update.autoLearned = false;
  const profile = await DeviceProfile.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

module.exports = router;
