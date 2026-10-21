import { useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";
import Button from "../components/ui/Button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/devices");
    } catch {
      setError("Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-control border border-line bg-white px-4 text-sm outline-none focus:border-plum";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card border border-line bg-white p-8">
        <div className="bg-brand bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">DIV</div>
        <h1 className="mt-6 text-2xl font-extrabold">Sign in</h1>
        <p className="mt-1 text-sm text-ink-2">Device management console</p>
        <div className="mt-6 flex flex-col gap-3">
          <input className={field} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={field} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-bad">{error}</p>}
        <Button type="submit" disabled={busy} className="mt-6 w-full">{busy ? "Signing in..." : "Sign in"}</Button>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-ink-3">Powered by {"<Div/>"}</p>
      </form>
    </div>
  );
}
