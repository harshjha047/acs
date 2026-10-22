function buildTree(flat, extra = {}) {
  const doc = { ...extra };
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = doc;
    for (const part of parts.slice(0, -1)) node = node[part] ??= { _object: true };
    node[parts.at(-1)] = { _object: false, _value: value, _type: typeof value === "number" ? "xsd:int" : "xsd:string", _writable: true };
  }
  return doc;
}

module.exports = { buildTree };
