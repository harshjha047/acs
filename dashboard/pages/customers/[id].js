import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { ago, apiError, onlineState, when, PROV_TONE, PROV_LABEL } from "../../lib/format";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Field from "../../components/ui/Field";
import Modal from "../../components/ui/Modal";
import CustomerForm from "../../components/CustomerForm";
import PreRegisterForm from "../../components/PreRegisterForm";
import { Table, Row, Cell } from "../../components/ui/Table";
import { useToast } from "../../components/ui/Toast";
import useAction from "../../lib/useAction";

const STATUS_TONE = { waiting: "warn", matched: "ok", cancelled: "muted" };

export default function CustomerPage() {
  const { query: { id }, push } = useRouter();
  const toast = useToast();
  const [c, setC] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [preReg, setPreReg] = useState(false);
  const [role, setRole] = useState(null);
  const [busy, run] = useAction();

  const load = useCallback(() => {
    if (!id) return;
    api.get(`/customers/${id}`).then(({ data }) => setC(data)).catch(err => setError(apiError(err, "Failed to load customer")));
  }, [id]);

  useEffect(() => {
    setRole(JSON.parse(localStorage.getItem("user") || "null")?.role);
    load();
  }, [load]);

  const save = form => run(async () => {
    try {
      await api.patch(`/customers/${id}`, form);
      toast("Saved", "ok");
      setEditing(false);
      load();
    } catch (err) {
      toast(apiError(err, "Save failed"), "bad");
    }
  });

  const remove = () => run(async () => {
    if (!window.confirm(`Delete customer ${c.name}?`)) return;
    try {
      await api.delete(`/customers/${id}`);
      toast("Customer deleted", "ok");
      push("/customers");
    } catch (err) {
      toast(apiError(err, "Delete failed"), "bad");
    }
  });

  const canWrite = role === "noc" || role === "admin";

  return (
    <Shell title={c ? c.name : "Customer"}>
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
      {!c && !error && <p className="text-sm">Loading...</p>}
      {c && (
        <div className="grid gap-4">
          <Card title="Details" action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
              {role === "admin" && <Button variant="secondary" loading={busy} onClick={remove}>Delete</Button>}
            </div>
          }>
            <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
              <Field label="Account ID" value={c.accountId} mono />
              <Field label="Phone" value={c.phone} mono />
              <Field label="Email" value={c.email} />
              <Field label="Address" value={c.address} />
              <Field label="Created" value={when(c.createdAt)} />
            </dl>
          </Card>

          <Card title={`Devices (${c.devices.length})`}>
            {!c.devices.length && <p className="text-sm text-ink-2">No devices linked. Link one from the device page, or pre-register it below.</p>}
            {c.devices.length > 0 && (
              <Table head={["Status", "Serial", "Model", "PPPoE / IP", "Provisioning", "Last seen", ""]}>
                {c.devices.map(d => {
                  const s = onlineState(d);
                  return (
                    <Row key={d._id}>
                      <Cell><Badge tone={s === "online" ? "ok" : s === "offline" ? "bad" : "muted"}>{s}</Badge></Cell>
                      <Cell mono>{d.serialNumber}</Cell>
                      <Cell>{d.manufacturer?.split(" ")[0]} {d.productClass}</Cell>
                      <Cell mono>{d.pppoeUsername || d.wanIp}</Cell>
                      <Cell>{d.provisioning?.state ? <Badge tone={PROV_TONE[d.provisioning.state]}>{PROV_LABEL[d.provisioning.state]}</Badge> : null}</Cell>
                      <Cell>{ago(d.lastInformAt)}</Cell>
                      <Cell className="text-right"><Link href={`/devices/${d._id}`} className="font-semibold text-plum underline">Open</Link></Cell>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>

          <Card title="Pre-registrations" action={canWrite && <Button variant="secondary" onClick={() => setPreReg(true)}>Pre-register device</Button>}>
            {!c.preRegistrations.length && <p className="text-sm text-ink-2">None.</p>}
            {c.preRegistrations.length > 0 && (
              <Table head={["Status", "Serial / MAC", "Template", "Created"]}>
                {c.preRegistrations.map(p => (
                  <Row key={p._id}>
                    <Cell><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></Cell>
                    <Cell mono>{p.serialNumber || p.macAddress}</Cell>
                    <Cell>{p.template?.name}</Cell>
                    <Cell>{when(p.createdAt)}</Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit customer">
        {c && <CustomerForm initial={c} busy={busy} onSubmit={save} onCancel={() => setEditing(false)} />}
      </Modal>
      <Modal open={preReg} onClose={() => setPreReg(false)} title="Pre-register device" size="max-w-lg">
        {c && <PreRegisterForm customer={c} onDone={() => { setPreReg(false); load(); }} onCancel={() => setPreReg(false)} />}
      </Modal>
    </Shell>
  );
}
