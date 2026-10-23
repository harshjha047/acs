import { useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";
import Button from "../components/ui/Button";
import useAction from "../lib/useAction";
import { setSession, needsMfaSetup } from "../lib/session";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState(null);
  const [error, setError] = useState("");
  const [busy, run] = useAction();
  const router = useRouter();

  function handleSubmit(e) {
    e.preventDefault();
    run(async () => {
      setError("");
      try {
        const { data } = mfaToken
          ? await api.post("/auth/mfa/verify", { mfaToken, code })
          : await api.post("/auth/login", { email, password });
        if (data.mfaRequired) {
          setMfaToken(data.mfaToken);
          return;
        }
        setSession(data.token, data.user);
        await router.push(needsMfaSetup(data.user) ? "/account" : "/devices");
      } catch (err) {
        const res = err?.response;
        if (res?.data?.restart) {
          setMfaToken(null);
          setCode("");
        }
        setError(res?.status === 429 ? res.data?.error || "Too many attempts. Try again in a few minutes." : res?.data?.error || "Sign-in failed");
      }
    });
  }

  const field = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card border border-line bg-white p-8">
        <div className="bg-brand bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">DIV</div>
        <h1 className="mt-6 text-2xl font-extrabold">Sign in</h1>
        <p className="mt-1 text-sm text-ink-2">Device management console</p>
        {mfaToken ? (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-sm text-ink-2">Enter the 6-digit code from your authenticator app.</p>
            <input className={field} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="self-start text-sm font-semibold text-plum" onClick={() => { setMfaToken(null); setCode(""); setError(""); }}>Back</button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <input className={field} placeholder="Email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
            <input className={field} placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-bad">{error}</p>}
        <Button type="submit" loading={busy} className="mt-6 w-full">{busy ? "Signing in…" : mfaToken ? "Verify" : "Sign in"}</Button>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-ink-3">Powered by {"<Div/>"}</p>
      </form>
    </div>
  );
}
