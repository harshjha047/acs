import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Router as RouterIcon, ScrollText, Users, LogOut, Siren, Activity, Contact, WandSparkles, Cpu, ShieldCheck, Network, Gauge } from "lucide-react";
import { useUser, can, clearSession, needsMfaSetup } from "../lib/session";

const nav = [
  { href: "/noc", label: "NOC wall", icon: Gauge },
  { href: "/devices", label: "Devices", icon: RouterIcon },
  { href: "/customers", label: "Customers", icon: Contact },
  { href: "/provisioning", label: "Provisioning", icon: WandSparkles },
  { href: "/firmware", label: "Firmware", icon: Cpu, perm: "firmware.view" },
  { href: "/outage", label: "Outage & alerts", icon: Siren },
  { href: "/topology", label: "Topology", icon: Network },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/system", label: "System health", icon: Activity, perm: "system.view" },
  { href: "/users", label: "Users", icon: Users, perm: "user.manage" },
  { href: "/account", label: "My account", icon: ShieldCheck }
];

export default function Shell({ title, children }) {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (!localStorage.getItem("token")) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (needsMfaSetup(user) && router.pathname !== "/account") router.replace("/account");
  }, [user, router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[72px] flex-col items-center bg-plum py-5">
        <div className="bg-brand bg-clip-text text-lg font-extrabold tracking-tight text-transparent">DIV</div>
        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {nav.filter(n => !n.perm || can(user, n.perm)).map(({ href, label, icon: Icon }) => {
            const active = router.pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={`relative flex h-11 w-11 items-center justify-center rounded-control transition ${active ? "bg-white/10 text-white" : "text-ink-3 hover:text-white"}`}
              >
                {active && <span className="absolute -left-4 h-6 w-[3px] rounded-full bg-brand" />}
                <Icon size={20} />
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} title="Log out" aria-label="Log out" className="flex h-11 w-11 items-center justify-center rounded-control text-ink-3 hover:text-white">
          <LogOut size={20} />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-8 py-5">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {user && (
            <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-white pl-1 pr-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-xs font-bold text-white">
                {user.name?.[0]?.toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-plum">{user.name}</span>
            </div>
          )}
        </header>

        <main className="flex-1 px-8 pb-8">{children}</main>

        <footer className="px-8 pb-5 font-mono text-[11px] uppercase tracking-widest text-ink-3">
          Powered by {"<Div/>"}
        </footer>
      </div>
    </div>
  );
}
