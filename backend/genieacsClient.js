const axios = require("axios");

const nbi = axios.create({ baseURL: process.env.GENIEACS_NBI_URL, timeout: 10000 });

async function listDevices(query = {}, projection = []) {
  const params = {};
  if (Object.keys(query).length) params.query = JSON.stringify(query);
  if (projection.length) params.projection = projection.join(",");
  const { data } = await nbi.get("/devices", { params });
  return data;
}

async function getDevice(genieacsDeviceId, projection = []) {
  const [doc] = await listDevices({ _id: genieacsDeviceId }, projection);
  return doc || null;
}

async function queueTask(genieacsDeviceId, task, { connectionRequest = true, timeout = 15000 } = {}) {
  const res = await nbi.post(`/devices/${encodeURIComponent(genieacsDeviceId)}/tasks`, task, {
    params: connectionRequest ? { connection_request: "" } : {},
    timeout,
    validateStatus: () => true
  });
  if (res.status === 200) return { outcome: "success", task: res.data };
  if (res.status === 202) return { outcome: "pending", task: res.data, reason: res.statusText };
  const err = new Error(`NBI ${res.status}: ${typeof res.data === "string" ? res.data : res.statusText}`);
  err.status = res.status;
  throw err;
}

const reboot = id => queueTask(id, { name: "reboot" });
const refreshObject = (id, objectName) => queueTask(id, { name: "refreshObject", objectName });
const getParameterValues = (id, parameterNames) => queueTask(id, { name: "getParameterValues", parameterNames });

module.exports = { listDevices, getDevice, queueTask, reboot, refreshObject, getParameterValues };
