import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Field from "../ui/Field";
import { Table, Row, Cell } from "../ui/Table";
import { ago, duration, when } from "../../lib/format";

const up = s => ["connected", "up"].includes(String(s || "").toLowerCase());

export default function HealthCard({ summary }) {
  const p = summary.wan.primary;
  const online = summary.online.state === "online";
  return (
    <Card title="Connection health" action={<Badge tone={online ? "ok" : summary.online.state === "offline" ? "bad" : "muted"}>{summary.online.state}</Badge>}>
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-3">
        <Field label="Last seen" value={ago(summary.lastInform)} />
        <Field label="Uptime" value={duration(summary.uptime)} />
        <Field label="Last boot" value={when(summary.lastBoot)} />
        <Field label="Internet">
          {p ? <Badge tone={up(p.ConnectionStatus) ? "ok" : "bad"}>{p.ConnectionStatus || "unknown"}</Badge> : "—"}
        </Field>
        <Field label="WAN IP" value={p?.ExternalIPAddress} mono />
        <Field label={p?.kind === "PPPoE" ? "PPPoE user" : "WAN type"} value={p?.kind === "PPPoE" ? p.Username : p?.kind} mono />
        <Field label="Firmware" value={summary.identity.softwareVersion} />
        <Field label="Hardware" value={summary.identity.hardwareVersion} />
        <Field label="Last WAN error" value={p?.LastConnectionError && p.LastConnectionError !== "ERROR_NONE" ? p.LastConnectionError : "None"} />
        <Field label={p?.kind === "PPPoE" ? "PPPoE up for" : "WAN up for"} value={p?.Uptime ? duration(Number(p.Uptime)) : null} />
        <Field label="IPv6" value={p?.ipv6 || null} mono />
        <Field label="Memory free" value={summary.system?.memTotalKb ? `${Math.round(summary.system.memFreeKb / 1024)} / ${Math.round(summary.system.memTotalKb / 1024)} MB` : null} />
      </dl>
      {!online && summary.online.state === "offline" && (
        <p className="mt-4 rounded-control bg-bad-bg px-4 py-3 text-sm text-bad">
          Not heard from in {ago(summary.lastInform).replace(" ago", "")} (inform interval {duration(summary.online.interval)}). Likely powered off, fiber/cable fault or no WAN.
        </p>
      )}
      {summary.wan.connections.length > 1 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-plum">All WAN connections ({summary.wan.connections.length})</summary>
          <div className="mt-3">
            <Table head={["Name", "Type", "Status", "IP", "Services", "User"]}>
              {summary.wan.connections.map(c => (
                <Row key={c.path} className={c.path === p?.path ? "bg-canvas" : ""}>
                  <Cell>{c.Name}</Cell>
                  <Cell>{c.kind}</Cell>
                  <Cell><Badge tone={up(c.ConnectionStatus) ? "ok" : "muted"}>{c.ConnectionStatus || "—"}</Badge></Cell>
                  <Cell mono>{c.ExternalIPAddress}</Cell>
                  <Cell>{c.services}</Cell>
                  <Cell mono>{c.Username}</Cell>
                </Row>
              ))}
            </Table>
          </div>
        </details>
      )}
    </Card>
  );
}
