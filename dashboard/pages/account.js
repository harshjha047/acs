import { useState } from "react";
import { useRouter } from "next/router";
import QRCode from "qrcode";
import api from "../lib/api";
import { apiError } from "../lib/format";
import Shell from "../components/Shell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Field from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import useAction from "../lib/useAction";
import { useUser, setSession, clearSession, refreshUser, needsMfaSetup } from "../lib/session";

const input = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";
const digits = v => v.replace(/\D/g, "").slice(0, 6);

function MfaCard({ user }) {
  const toast = useToast();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, run] = useAction();
  const enabled = !!user?.mfa?.enabled;

  const start = () => run(async () => {
    try {
      const { data } = await api.post("/auth/mfa/setup");
      setSetup({ ...data, qr: await QRCode.toDataURL(data.uri, { margin: 1, width: 200 }) });
    } catch (err) {
      toast(apiError(err, "Setup failed"), "bad");
    }
  });

  const enable = () => run(async () => {
    try {
      await api.post("/auth/mfa/enable", { code });
      await refreshUser();
      toast("Two-factor sign-in is on.", "ok");
      window.location.href = "/devices";
    } catch (err) {
      toast(apiError(err, "Code didn't match"), "bad");
    }
  });

  const disable = () => run(async () => {
    try {
      await api.post("/auth/mfa/disable", { code, password });
      await refreshUser();
      toast("Two-factor sign-in is off.", "ok");
      window.location.reload();
    } catch (err) {
      toast(apiError(err, "Failed"), "bad");
    }
  });

  return (
    <Card title="Two-factor sign-in" action={<Badge tone={enabled ? "ok" : user?.mfa?.required ? "bad" : "muted"}>{enabled ? "on" : user?.mfa?.required ? "required" : "off"}</Badge>}>
      {needsMfaSetup(user) && <p className="mb-4 text-sm font-semibold text-bad">Your role requires two-factor sign-in. Set it up to continue.</p>}
      {!enabled && !setup && (
        <>
          <p className="text-sm text-ink-2">Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Aegis).</p>
          <Button className="mt-4" loading={busy} onClick={start}>Set up</Button>
        </>
      )}
      {!enabled && setup && (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <img src={setup.qr} alt="Authenticator QR code" width={200} height={200} className="rounded-control border border-line" />
          <div className="grid content-start gap-3">
            <p className="text-sm text-ink-2">Scan the code, or enter this key manually:</p>
            <code className="break-all rounded-control bg-canvas px-3 py-2 font-mono text-sm">{setup.secret.match(/.{1,4}/g).join(" ")}</code>
            <input className={input} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={e => setCode(digits(e.target.value))} />
            <Button disabled={code.length !== 6} loading={busy} onClick={enable}>Turn on</Button>
          </div>
        </div>
      )}
      {enabled && !user?.mfa?.required && (
        <div className="grid max-w-sm gap-3">
          <p className="text-sm text-ink-2">To turn it off, confirm your password and a current code.</p>
          <input className={input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <input className={input} inputMode="numeric" placeholder="6-digit code" value={code} onChange={e => setCode(digits(e.target.value))} />
          <Button variant="secondary" disabled={!password || code.length !== 6} loading={busy} onClick={disable}>Turn off</Button>
        </div>
      )}
      {enabled && user?.mfa?.required && <p className="text-sm text-ink-2">Required for your role. Lost your phone? Ask an admin to reset it.</p>}
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, run] = useAction();
  const save = e => {
    e.preventDefault();
    run(async () => {
      try {
        const { data } = await api.post("/auth/password", { current: form.current, next: form.next });
        setSession(data.token, data.user);
        setForm({ current: "", next: "", confirm: "" });
        toast("Password changed. Other sessions were signed out.", "ok");
      } catch (err) {
        toast(apiError(err, "Failed"), "bad");
      }
    });
  };
  const mismatch = form.confirm && form.next !== form.confirm;
  return (
    <Card title="Password">
      <form onSubmit={save} className="grid max-w-sm gap-3">
        <input className={input} type="password" autoComplete="current-password" placeholder="Current password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} />
        <input className={input} type="password" autoComplete="new-password" minLength={12} placeholder="New password (12+ characters)" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} />
        <input className={input} type="password" autoComplete="new-password" placeholder="Repeat new password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
        {mismatch && <p className="text-sm font-semibold text-bad">Passwords don't match</p>}
        <Button type="submit" disabled={!form.current || form.next.length < 12 || form.next !== form.confirm} loading={busy}>Change password</Button>
      </form>
    </Card>
  );
}

export default function Account() {
  const user = useUser();
  const router = useRouter();
  const [busy, run] = useAction();
  const logoutAll = () => run(async () => {
    if (!window.confirm("Sign out on all devices, including this one?")) return;
    await api.post("/auth/logout-all").catch(() => {});
    clearSession();
    router.replace("/login");
  });

  return (
    <Shell title="My account">
      <div className="grid gap-4">
        <Card title="Profile" action={<Button variant="secondary" loading={busy} onClick={logoutAll}>Sign out everywhere</Button>}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" value={user?.name} />
            <Field label="Email" value={user?.email} />
            <Field label="Role" value={user?.role} />
          </dl>
        </Card>
        <MfaCard user={user} />
        <PasswordCard />
      </div>
    </Shell>
  );
}
