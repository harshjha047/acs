const axios = require("axios");

const nbi = axios.create({ baseURL: process.env.GENIEACS_NBI_URL, timeout: 10000 });

async function listDevices(query = {}) {
  const params = {};
  if (Object.keys(query).length) params.query = JSON.stringify(query);
  const { data } = await nbi.get("/devices", { params });
  return data;
}

async function getDevice(genieacsDeviceId) {
  const { data } = await nbi.get("/devices", {
    params: { query: JSON.stringify({ _id: genieacsDeviceId }) }
  });
  return data[0] || null;
}

async function queueTask(genieacsDeviceId, task, { connectionRequest = true, timeout = 5000 } = {}) {
  const params = connectionRequest ? { connection_request: "" } : {};
  const { data } = await nbi.post(`/devices/${encodeURIComponent(genieacsDeviceId)}/tasks`, task, {
    params,
    timeout,
    validateStatus: () => true
  });
  return data;
}

const reboot = id => queueTask(id, { name: "reboot" });
const getParameterValues = (id, parameterNames) => queueTask(id, { name: "getParameterValues", parameterNames });

module.exports = { listDevices, getDevice, queueTask, reboot, getParameterValues };
