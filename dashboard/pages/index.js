import Head from "next/head";
import { ArrowRight, Check, Lock, UserCheck, FileText, Shield } from "lucide-react";
import ProductMockup from "../components/landing/ProductMockup";

const DIV = "https://thediv.in";
const LOGIN = "https://acs.thediv.in/login";
const TITLE = "DIV ACS — TR-069 device management for fiber ISPs | DIV";
const DESC = "Provision, monitor and fix fiber ONTs remotely over TR-069. Root-cause diagnosis, safe firmware rollouts and a live NOC wall. Built by DIV.";
const URL = "https://acs.thediv.in/";

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${DIV}/#org`, name: "DIV", url: DIV },
    {
      "@type": "SoftwareApplication",
      name: "DIV ACS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://acs.thediv.in",
      description: DESC,
      publisher: { "@id": `${DIV}/#org` },
    },
  ],
};

const BRAND = "bg-[linear-gradient(90deg,#FF0091,#FFAC00)]";
const DOTS = { backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)", backgroundSize: "22px 22px" };
const GRID = {
  backgroundImage: "linear-gradient(#F3EEF4 1px, transparent 1px), linear-gradient(90deg, #F3EEF4 1px, transparent 1px)",
  backgroundSize: "64px 64px",
};
const WRAP = "mx-auto max-w-[1200px] px-6";
const H2 = "text-[32px] min-[860px]:text-[44px] font-bold leading-[1.12] tracking-[-0.035em] text-[#2B1B30]";
const H2S = "text-[32px] min-[860px]:text-[40px] font-bold leading-[1.14] tracking-[-0.035em] text-[#2B1B30]";
const PAD = "py-[72px] min-[860px]:py-[104px]";
const SPLIT = "grid items-center gap-12 min-[860px]:grid-cols-2 min-[860px]:gap-16";
const BTN = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold transition-colors";
const BTN_OUT = `${BTN} border border-[#E5E0E6] bg-white text-[#2B1B30] hover:bg-[#F6F3F5]`;
const BTN_PLUM = `${BTN} bg-[#2B1B30] text-white hover:bg-[#3D2A43]`;
const LINK = "font-semibold text-[#C4006F] hover:underline";
const CAPTION = "mt-4 text-[13px] text-[#766C7C]";

function Wordmark({ href }) {
  const inner = (
    <>
      <span className={`${BRAND} bg-clip-text text-[22px] font-extrabold tracking-[-0.02em] text-transparent`}>DIV</span>
      <span className="h-[18px] w-px bg-[#E5E0E6]" aria-hidden="true" />
      <span className="text-[16px] font-bold text-[#2B1B30]">ACS</span>
    </>
  );
  return href ? (
    <a href={href} className="flex min-h-[44px] items-center gap-2.5" aria-label="DIV ACS, built by DIV">{inner}</a>
  ) : (
    <a href="#top" className="flex min-h-[44px] items-center gap-2.5" aria-label="DIV ACS home">{inner}</a>
  );
}

function Eyebrow({ children, className = "" }) {
  return <p className={`font-mono text-[12px] uppercase tracking-[0.12em] text-[#C4006F] ${className}`}>{children}</p>;
}

function Header() {
  const links = [["Features", "#features"], ["How it works", "#how"], ["Firmware", "#firmware"], ["Security", "#security"]];
  return (
    <header className="sticky top-0 z-20 border-b border-[#EFEAF0] bg-white/95 backdrop-blur">
      <div className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-7 text-[14px] font-medium text-[#52465A] min-[860px]:flex">
          {links.map(([l, h]) => <a key={h} href={h} className="hover:text-[#2B1B30]">{l}</a>)}
          <a href={DIV} title="DIV — network software for ISPs" className="hover:text-[#2B1B30]">About DIV</a>
        </nav>
        <div className="flex items-center gap-2">
          <a href={LOGIN} className={BTN_OUT}>Log in</a>
          <a href="#demo" className={BTN_PLUM}>Book a demo</a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="pt-16 pb-14 min-[860px]:pt-24" style={GRID}>
      <div className={`${WRAP} text-center`}>
        <a href={DIV} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#E5E0E6] bg-white py-1.5 pr-4 pl-1.5 text-[13px] font-medium text-[#52465A] hover:border-[#D6CFD8]">
          <span className="rounded-full bg-[#2B1B30] px-2.5 py-1 text-[12px] font-semibold text-white">New</span>
          TR-069 ACS, built by DIV
        </a>
        <h1 className="mx-auto mt-6 max-w-[900px] text-[40px] font-bold leading-[1.08] tracking-[-0.04em] text-[#2B1B30] min-[860px]:text-[64px]">
          Run every ONT on your network from{" "}
          <span className={`${BRAND} inline-block -rotate-[1.5deg] rounded-[14px] px-3 text-white`}>one screen.</span>{" "}
          <span className="inline-block rounded-[14px] bg-[#2B1B30] px-3 text-white">Remotely.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-[18px] leading-[1.6] text-[#52465A]">
          DIV ACS provisions, monitors and fixes your customers&apos; fiber routers over TR-069. See the fault before the customer calls, tell a cut feeder from a loose patch cord, and push firmware in safe waves.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#demo" className={`${BTN_PLUM} min-h-[48px] px-5`}>Book a demo <ArrowRight size={16} aria-hidden="true" /></a>
          <a href="#features" className={`${BTN_OUT} min-h-[48px] px-5`}>See features</a>
        </div>
      </div>
      <ProductMockup />
    </section>
  );
}

function Facts() {
  const items = [
    ["TR-069 / CWMP", "Works with standard fiber ONTs and routers"],
    ["EPON · GPON · XGS-PON", "Map every ONU to its OLT and PON port"],
    ["Works behind CGNAT", "Devices check in every 5 minutes"],
    ["Every action audited", "Who changed what, when, and why"],
  ];
  return (
    <section aria-label="Key facts" className="border-y border-[#EFEAF0] bg-[#FBF9FB] py-8">
      <ul className={`${WRAP} grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]`}>
        {items.map(([t, d]) => (
          <li key={t}>
            <div className="text-[15px] font-bold text-[#2B1B30]">{t}</div>
            <div className="mt-1 text-[14px] text-[#766C7C]">{d}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Features() {
  const items = [
    ["Zero-touch provisioning", "Pre-register a serial, plug the ONT in, and PPPoE, VLAN and Wi-Fi come up from your template. No truck roll.", "#how"],
    ["Health score & likely cause", "Every device gets a score out of 100 and a plain-English cause with the next step, so support can answer in one call.", "#rootcause"],
    ["Safe firmware rollouts", "Bench test, then canary waves in your night window. The rollout halts itself if failures cross your limit.", "#firmware"],
    ["Remote tools", "Run ping, traceroute and download/upload speed tests from the customer's router, not from your office.", "#tools"],
  ];
  return (
    <section id="features" className="scroll-mt-16 pt-[72px] pb-12 min-[860px]:pt-[112px]">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className={`${H2} max-w-[620px]`}>Features that make fiber support a lot quieter</h2>
          <a href="#how" className={BTN_PLUM}>How it works <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        <div className="mt-14 grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {items.map(([t, d, h], i) => (
            <div key={t} className={`pl-5 ${i === 0 ? "border-l-2 border-[#2B1B30]" : "border-l border-[#E5E0E6]"}`}>
              <h3 className="text-[17px] font-bold text-[#2B1B30]">{t}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-[#52465A]">{d}</p>
              <a href={h} className={`${LINK} mt-3 inline-flex min-h-[44px] items-center text-[14px]`} aria-label={`Learn more about ${t.toLowerCase()}`}>Learn more →</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CheckItem({ children }) {
  return (
    <li className="flex items-start gap-3">
      <Check size={18} className="mt-0.5 shrink-0 text-[#158039]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function RootCause() {
  return (
    <section id="rootcause" className={`scroll-mt-16 ${PAD}`}>
      <div className={`${WRAP} ${SPLIT}`}>
        <div>
          <Eyebrow>Root cause</Eyebrow>
          <h2 className={`${H2S} mt-4`}>Is it the fiber, the power, or the whole PON?</h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-[#52465A]">
            When a device drops, DIV ACS checks its neighbours on the same PON port. If most of them are down too, it&apos;s an area fault. Send the line team, not a technician to the customer&apos;s home. If only one is down, it&apos;s the customer&apos;s power or drop fiber.
          </p>
          <ul className="mt-6 space-y-3 text-[15px] text-[#52465A]">
            <CheckItem>Weak and degrading optical signal, flagged early</CheckItem>
            <CheckItem>Fiber errors (FEC) and unexpected reboots tracked hourly</CheckItem>
            <CheckItem>Each diagnosis comes with evidence and a next step</CheckItem>
          </ul>
        </div>
        <figure className="rounded-[24px] bg-[#F6F3F5] p-5 min-[860px]:p-7">
          <div className="space-y-4">
            <div className="rounded-[16px] border border-[#F3D9B0] bg-[#FFFAF1] p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[16px] font-bold text-[#2B1B30]">PON / feeder outage</h3>
                <span className="shrink-0 text-[13px] font-semibold text-[#B45309]">90% likely</span>
              </div>
              <ul className="mt-3 space-y-1 text-[13px] text-[#52465A]">
                <li>• 27/32 ONUs on OLT-02 · PON 0/5 offline</li>
                <li>• Offline 14 min</li>
              </ul>
              <p className="mt-3 text-[14px] text-[#2B1B30]">Area fault: check the OLT port, feeder fiber and splitter. Not a customer-side problem.</p>
            </div>
            <div className="rounded-[16px] border border-[#E5E0E6] bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[16px] font-bold text-[#2B1B30]">Customer-side: power or drop fiber</h3>
                <span className="shrink-0 text-[13px] font-semibold text-[#766C7C]">80% likely</span>
              </div>
              <ul className="mt-3 space-y-1 text-[13px] text-[#52465A]">
                <li>• 30 of 31 other ONUs on OLT-01 · PON 0/3 are online</li>
              </ul>
              <p className="mt-3 text-[14px] text-[#2B1B30]">Ask about power and the LOS light. If power is fine, check the drop fiber and patch cord.</p>
            </div>
          </div>
          <figcaption className={CAPTION}>Sample diagnoses.</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Wave({ label, pct, status, brand, muted }) {
  return (
    <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4 text-[13px]">
      <span className="text-[#E1D8E4]">{label}</span>
      <div className="h-2.5 rounded-full bg-[#4A3651]">
        {pct > 0 && <div className={`h-2.5 rounded-full ${brand ? BRAND : "bg-[#4ADE80]"}`} style={{ width: `${pct}%` }} />}
      </div>
      <span className={`text-right ${muted ? "text-[#A9A1AE]" : "text-[#E9E1EC]"}`}>{status}</span>
    </div>
  );
}

function Firmware() {
  return (
    <section id="firmware" className={`scroll-mt-16 ${PAD} pt-0 min-[860px]:pt-0`}>
      <div className={`${WRAP} ${SPLIT}`}>
        <figure className="order-2 min-[860px]:order-1">
          <div className="rounded-[24px] bg-[#2B1B30] p-6 min-[860px]:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold text-white!">Rollout · DX-4G2 → v2.4.1</h3>
              <span className="font-mono text-[12px] text-[#CFC5D3]">window 01:00–05:00 IST</span>
            </div>
            <div className="mt-6 space-y-4">
              <Wave label="Canary · 5" pct={100} status="Applied" />
              <Wave label="Wave · 50" pct={100} status="Applied" />
              <Wave label="Wave · 500" pct={62} status="Running" brand />
              <Wave label="Rest" pct={0} status="Waiting" muted />
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-[12px] text-[#E9E1EC]">
              {["Fail rate 0.4% · limit 5%", "Auto-halt on", "Online devices only"].map(c => (
                <span key={c} className="rounded-[8px] bg-[#3D2A43] px-3 py-1.5">{c}</span>
              ))}
            </div>
            <figcaption className="mt-5 text-[13px] text-[#CFC5D3]">Sample rollout.</figcaption>
          </div>
        </figure>
        <div className="order-1 min-[860px]:order-2">
          <Eyebrow>Firmware</Eyebrow>
          <h2 className={`${H2S} mt-4`}>Upgrade thousands of ONTs without risking a single one</h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-[#52465A]">
            A release can&apos;t go out until it&apos;s been applied on a bench device. Then it rolls out in waves you choose, inside your maintenance window, and pauses after each wave so you can check it.
          </p>
          <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {[["Eligibility checks", "Model, hardware and current version are checked before any push."], ["Live job states", "Sent, downloading, rebooting, applied or failed, per device."]].map(([t, d]) => (
              <div key={t} className="rounded-[14px] border border-[#E5E0E6] p-4">
                <h3 className="text-[15px] font-bold text-[#2B1B30]">{t}</h3>
                <p className="mt-1 text-[14px] text-[#52465A]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Noc() {
  const ports = [
    ["POP-East › OLT-02 › 0/5", "27 / 32 offline", "text-[#C62626]"],
    ["POP-North › OLT-01 › 0/7", "avg Rx -24.6 dBm", "text-[#B45309]"],
    ["POP-East › OLT-03 › 0/1", "2 / 30 offline", "text-[#52465A]"],
  ];
  const label = "font-mono text-[11px] uppercase tracking-[0.1em] text-[#766C7C]";
  return (
    <section className={`${PAD} pt-0 min-[860px]:pt-0`}>
      <div className={`${WRAP} ${SPLIT}`}>
        <div>
          <Eyebrow>NOC wall &amp; topology</Eyebrow>
          <h2 className={`${H2S} mt-4`}>See your whole network, from POP to living room</h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-[#52465A]">
            Import your OLTs, PON ports and splitters from a CSV. The NOC wall then shows availability, active outages, critical alerts and your worst PON ports, updated live.
          </p>
          <a href="#demo" className={`${LINK} mt-4 inline-flex min-h-[44px] items-center text-[15px]`}>See it on a live demo →</a>
        </div>
        <figure>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-[#F6F3F5] p-5">
              <div className={label}>Availability</div>
              <div className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-[#2B1B30]">99.2%</div>
              <div className="text-[13px] font-semibold text-[#158039]">1,846 of 1,861 online</div>
            </div>
            <div className="rounded-[18px] bg-[#F6F3F5] p-5">
              <div className={label}>Active outages</div>
              <div className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-[#2B1B30]">1</div>
              <div className="text-[13px] font-semibold text-[#B45309]">OLT-02 · PON 0/5</div>
            </div>
            <div className="col-span-2 rounded-[18px] bg-[#F6F3F5] p-5">
              <div className={label}>Worst PON ports</div>
              <ul className="mt-2 divide-y divide-[#E5E0E6]">
                {ports.map(([p, s, c]) => (
                  <li key={p} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                    <span className="font-mono text-[#2B1B30]">{p}</span>
                    <span className={`font-semibold ${c}`}>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <figcaption className={CAPTION}>Sample data.</figcaption>
        </figure>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    ["Pre-register", "Add the ONT serial and pick a template with the customer's plan, PPPoE and VLAN."],
    ["Plug in", "The device calls home and is recognised by its serial, even behind CGNAT."],
    ["Auto-configure", "Internet, Wi-Fi name and password are pushed, and the device is linked to the customer."],
    ["Watch & fix", "Health, optical levels and Wi-Fi clients are tracked. Reboot, test or reconfigure in one click."],
  ];
  return (
    <section id="how" className={`scroll-mt-16 border-y border-[#EFEAF0] bg-[#FBF9FB] ${PAD}`}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[720px] text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className={`${H2} mt-4`}>From box to browsing, with nobody on site</h2>
        </div>
        <ol className="mt-14 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-[18px] border border-[#EFEAF0] bg-white p-6">
              <span className="font-mono text-[13px] font-medium text-[#C4006F]">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-[18px] font-bold text-[#2B1B30]">{t}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-[#52465A]">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ToolsSecurity() {
  const sec = [
    [Lock, "2-step login", "Authenticator app codes"],
    [UserCheck, "Role permissions", "Support, NOC and admin"],
    [FileText, "Full audit log", "Every change, with a reason"],
    [Shield, "Encrypted secrets", "Passwords never in plain text"],
  ];
  return (
    <section className={PAD}>
      <div className={`${WRAP} grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]`}>
        <div id="tools" className="scroll-mt-20 rounded-[24px] bg-[#F6F3F5] p-6 min-[860px]:p-8">
          <Eyebrow>Remote tools</Eyebrow>
          <h3 className="mt-3 text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-[#2B1B30]">Test from the router the customer is actually using</h3>
          <figure className="mt-6">
            <pre className="overflow-x-auto rounded-[14px] bg-[#2B1B30] p-5 font-mono text-[13px] leading-[1.8] text-[#E9E1EC]">
              <span className="text-[#FF7AC2]">ping</span> 8.8.8.8 · 4 sent, 4 received{"\n"}
              <span className="text-[#CFC5D3]">avg / min / max  6.1 / 5.4 / 7.2 ms · loss 0%</span>{"\n"}
              <span className="text-[#FFC35C]">speedtest</span> download 312 Mbps · upload 298 Mbps
            </pre>
            <figcaption className={CAPTION}>Sample output.</figcaption>
          </figure>
        </div>
        <div id="security" className="scroll-mt-20 rounded-[24px] border border-[#E5E0E6] bg-white p-6 min-[860px]:p-8">
          <Eyebrow>Security</Eyebrow>
          <h3 className="mt-3 text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-[#2B1B30]">Built for teams, locked down by default</h3>
          <ul className="mt-6 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {sec.map(([Icon, t, d]) => (
              <li key={t} className="flex items-start gap-3">
                <Icon size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-[#2B1B30]" aria-hidden="true" />
                <div>
                  <div className="text-[15px] font-bold text-[#2B1B30]">{t}</div>
                  <div className="text-[14px] text-[#766C7C]">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="demo" className="scroll-mt-16 pb-[72px] min-[860px]:pb-[104px]">
      <div className={WRAP}>
        <div className="rounded-[28px] bg-[#2B1B30] px-6 py-16 text-center min-[860px]:px-10" style={DOTS}>
          <h2 className="mx-auto max-w-[760px] text-[32px] font-bold leading-[1.12] tracking-[-0.035em] text-white! min-[860px]:text-[44px]">Fewer truck rolls. Shorter support calls.</h2>
          <p className="mx-auto mt-5 max-w-[600px] text-[17px] leading-[1.6] text-[#E1D8E4]">
            See DIV ACS running on your own ONT models. We&apos;ll walk your team through provisioning, monitoring and a firmware rollout.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={DIV} className={`${BTN} ${BRAND} min-h-[48px] px-5 font-bold text-white hover:opacity-95`}>Book a demo with DIV</a>
            <a href={LOGIN} className={`${BTN} min-h-[48px] border border-[#6B5573] px-5 text-white hover:bg-[#3D2A43]`}>Log in</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    ["Product", [["Features", "#features"], ["Firmware rollouts", "#firmware"], ["Root cause", "#rootcause"], ["Security", "#security"]]],
    ["DIV", [["About DIV", DIV], ["More products from DIV", DIV], ["Contact DIV", DIV]]],
    ["Account", [["Log in", LOGIN], ["Book a demo", "#demo"]]],
  ];
  return (
    <footer className="border-t border-[#EFEAF0] bg-white">
      <div className={`${WRAP} grid gap-10 py-14 min-[860px]:grid-cols-[1.4fr_2fr]`}>
        <div>
          <Wordmark href={DIV} />
          <p className="mt-3 max-w-[340px] text-[14px] leading-[1.6] text-[#52465A]">
            DIV ACS is TR-069 device management for fiber ISPs, designed and built by <a href={DIV} className={LINK}>DIV</a>.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 min-[560px]:grid-cols-3">
          {cols.map(([h, links]) => (
            <nav key={h} aria-label={`${h} links`}>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#766C7C]!">{h}</h2>
              <ul className="mt-2">
                {links.map(([l, href]) => (
                  <li key={l}><a href={href} className="inline-flex min-h-[44px] items-center text-[14px] text-[#52465A] hover:text-[#2B1B30]">{l}</a></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-[#EFEAF0]">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-[#766C7C]`}>
          <p>© 2026 <a href={DIV} className="font-semibold text-[#2B1B30] hover:underline">DIV · thediv.in</a>. All rights reserved.</p>
          <p>A product of <a href={DIV} className={LINK}>DIV</a></p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESC} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={URL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="DIV ACS" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:url" content={URL} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESC} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </Head>
      <div id="top" className="min-h-screen scroll-smooth bg-white text-[#52465A]">
        <Header />
        <main>
          <Hero />
          <Facts />
          <Features />
          <RootCause />
          <Firmware />
          <Noc />
          <How />
          <ToolsSecurity />
          <Cta />
        </main>
        <Footer />
      </div>
    </>
  );
}
