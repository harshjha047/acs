import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import api from "../../lib/api";
import { apiError, when } from "../../lib/format";
import Shell from "../../components/Shell";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import CustomerForm from "../../components/CustomerForm";
import { Table, Row, Cell } from "../../components/ui/Table";
import { useToast } from "../../components/ui/Toast";
import useAction from "../../lib/useAction";

export default function Customers() {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, run] = useAction();

  const load = useCallback(() => {
    setLoading(true);
    api.get("/customers", { params: { q, limit: 200 } }).then(({ data }) => setList(data)).catch(err => toast(apiError(err, "Failed to load customers"), "bad")).finally(() => setLoading(false));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const create = form => run(async () => {
    try {
      const { data } = await api.post("/customers", form);
      toast("Customer created", "ok");
      router.push(`/customers/${data._id}`);
    } catch (err) {
      toast(apiError(err, "Create failed"), "bad");
    }
  });

  return (
    <Shell title="Customers">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, account ID or email"
          className="h-12 w-full max-w-xl rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum" />
        <Button onClick={() => setAdding(true)}>Add customer</Button>
        {!loading && <span className="text-sm text-ink-2">{list.length} shown</span>}
      </div>
      <Card>
        {loading && !list.length && <p className="text-sm">Loading...</p>}
        {!loading && !list.length && <p className="text-sm text-ink-2">{q ? "No matches." : "No customers yet."}</p>}
        {list.length > 0 && (
          <Table head={["Name", "Account", "Phone", "Devices", "Updated", ""]}>
            {list.map(c => (
              <Row key={c._id}>
                <Cell><span className="font-semibold text-plum">{c.name}</span>{c.email && <div className="text-xs text-ink-2">{c.email}</div>}</Cell>
                <Cell mono>{c.accountId}</Cell>
                <Cell mono>{c.phone}</Cell>
                <Cell>{c.devices ? <Badge tone={c.online === c.devices ? "ok" : c.online ? "warn" : "bad"}>{c.online}/{c.devices} online</Badge> : <span className="text-ink-3">none</span>}</Cell>
                <Cell>{when(c.updatedAt)}</Cell>
                <Cell className="text-right"><Link href={`/customers/${c._id}`} className="font-semibold text-plum underline">Open</Link></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add customer">
        <CustomerForm busy={busy} submitLabel="Create" onSubmit={create} onCancel={() => setAdding(false)} />
      </Modal>
    </Shell>
  );
}
