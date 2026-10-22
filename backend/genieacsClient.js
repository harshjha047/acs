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

async function queueTask(genieacsDeviceId, task, { connectionRequest = true, timeout = 10000 } = {}) {
  const res = await nbi.post(`/devices/${encodeURIComponent(genieacsDeviceId)}/tasks`, task, {
    params: connectionRequest ? { connection_request: "", timeout } : {},
    timeout: timeout + 10000,
    validateStatus: () => true
  });
  if (res.status === 200) return { outcome: "success", task: res.data };
  if (res.status === 202) return { outcome: "pending", task: res.data, reason: res.statusText };
  const err = new Error(`NBI ${res.status}: ${typeof res.data === "string" ? res.data : res.statusText}`);
  err.status = res.status;
  throw err;
}

async function queueTasks(genieacsDeviceId, tasks, options = {}) {
  for (const task of tasks.slice(0, -1)) await queueTask(genieacsDeviceId, task, { connectionRequest: false });
  return queueTask(genieacsDeviceId, tasks.at(-1), options);
}

async function getFaults(genieacsDeviceId) {
  const { data } = await nbi.get("/faults", { params: { query: JSON.stringify({ device: genieacsDeviceId }) } });
  return data;
}

async function deleteDevice(genieacsDeviceId) {
  const res = await nbi.delete(`/devices/${encodeURIComponent(genieacsDeviceId)}`, { validateStatus: s => s < 500 });
  if (res.status >= 400 && res.status !== 404) throw Object.assign(new Error(`NBI ${res.status}`), { status: res.status });
  return res.status !== 404;
}

async function addTag(genieacsDeviceId, tag) {
  await nbi.post(`/devices/${encodeURIComponent(genieacsDeviceId)}/tags/${encodeURIComponent(tag)}`);
}

const reboot = id => queueTask(id, { name: "reboot" });
const refreshObject = (id, objectName, options) => queueTask(id, { name: "refreshObject", objectName }, options);
const getParameterValues = (id, parameterNames, options) => queueTask(id, { name: "getParameterValues", parameterNames }, options);
const setParameterValues = (id, parameterValues, options) => queueTask(id, { name: "setParameterValues", parameterValues }, options);

module.exports = { listDevices, deleteDevice, addTag, getDevice, queueTask, queueTasks, getFaults, reboot, refreshObject, getParameterValues, setParameterValues };
