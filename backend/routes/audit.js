const router = require("express").Router();
const AuditLog = require("../models/AuditLog");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", async (req, res) => {
  const { action, device } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (device) filter.device = device;
  const logs = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .limit(200)
    .populate("user", "name email")
    .populate("device", "serialNumber manufacturer")
    .lean();
  res.json(logs);
});

module.exports = router;
