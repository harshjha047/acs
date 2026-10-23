require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

for (const key of ["MONGO_URI", "JWT_SECRET", "GENIEACS_NBI_URL"]) {
  if (!process.env[key]) throw new Error(`Missing env ${key}`);
}

const app = express();
app.set("trust proxy", 1);
const sink = require("./lib/uploadSink");
app.put("/speedtest/upload/:token", sink.handler);
app.post("/speedtest/upload/:token", sink.handler);
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",") }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => res.json({ ok: mongoose.connection.readyState === 1 }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/devices", require("./routes/devices"));
app.use("/api/audit", require("./routes/audit"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/profiles", require("./routes/profiles"));
app.use("/api/users", require("./routes/users"));
app.use("/api/templates", require("./routes/templates"));
app.use("/api/preregistrations", require("./routes/preregistrations"));
app.use("/api/firmware", require("./routes/firmware"));
app.use("/api/topology", require("./routes/topology"));
app.use("/api", require("./routes/monitor"));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  const status = err.status && err.status < 500 ? err.status : err.isAxiosError || err.status ? 502 : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "Internal error" : err.message });
});

const port = process.env.PORT || 4000;
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    await require("./models/Alert").syncIndexes().catch(err => console.error("Alert indexes:", err.message));
    app.listen(port, () => console.log(`API on :${port}`));
    require("./lib/monitor").start({ after: [require("./lib/provisioner").tick, require("./lib/firmwareRunner").tick, require("./lib/intel").tick] });
  })
  .catch(err => {
    console.error("Mongo connection failed:", err.message);
    process.exit(1);
  });
