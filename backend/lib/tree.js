const childKeys = node => Object.keys(node || {}).filter(k => !k.startsWith("_"));
const isLeaf = node => node?._object === false;
const get = (doc, path) => path.split(".").reduce((acc, key) => acc?.[key], doc);
const valueOf = node => (isLeaf(node) ? node._value ?? null : null);
const rootOf = doc => (doc?.InternetGatewayDevice ? "InternetGatewayDevice" : doc?.Device ? "Device" : null);

function expand(doc, pattern) {
  let frontier = [["", doc]];
  for (const part of pattern.split(".")) {
    const next = [];
    for (const [path, node] of frontier) {
      const keys = part === "*" ? childKeys(node).filter(k => /^\d+$/.test(k)) : [part];
      for (const key of keys) {
        if (node?.[key] !== undefined) next.push([path ? `${path}.${key}` : key, node[key]]);
      }
    }
    frontier = next;
  }
  return frontier;
}

function leaves(node, prefix = "", out = []) {
  for (const key of childKeys(node)) {
    const child = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (isLeaf(child)) out.push([path, child]);
    else leaves(child, path, out);
  }
  return out;
}

const fields = (node, names) => Object.fromEntries(names.map(n => [n, valueOf(node?.[n])]));

module.exports = { childKeys, isLeaf, get, valueOf, rootOf, expand, leaves, fields };
