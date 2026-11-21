import { Gauge, Router, Contact, Cpu, Network, Activity, Shield } from "lucide-react";

const STEPS = ["Plug in the ONT", "Auto-provision", "Monitor", "Fix remotely"];
const TABS = ["Overview", "Trends & events", "Wi-Fi & devices", "Tools", "History & notes", "Readiness"];
const SIDE = [Gauge, Router, Contact, Cpu, Network, Activity, Shield];
const DOTS = { backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)", backgroundSize: "22px 22px" };

function Label({ children }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#766C7C]">{children}</div>;
}

function Bar({ label, pct, value }) {
  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 text-[12px]">
      <Label>{label}</Label>
      <div className="h-2 rounded-full bg-[#EFEAF0]">
        <div className="h-2 rounded-full bg-[#158039]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[#52465A] min-[860px]:min-w-[96px]">{value}</span>
    </div>
  );
}

function Signal({ label, value, range }) {
  return (
    <div className="rounded-[12px] border border-[#ECE7ED] p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-[10px] font-bold text-[#158039]">OK</span>
      </div>
      <div className="mt-1 text-[24px] font-bold tracking-[-0.03em] text-[#2B1B30]">
        {value} <span className="text-[13px] font-semibold">dBm</span>
      </div>
      <div className="text-[11px] text-[#766C7C]">{range}</div>
    </div>
  );
}

export default function ProductMockup() {
  return (
    <div className="mx-auto mt-14 max-w-[1240px] px-6">
      <div className="flex justify-center">
        <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-t-[22px] bg-[#2B1B30] px-2 pt-2 pb-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-semibold ${i === 0 ? "bg-white text-[#2B1B30]" : "bg-[#3D2A43] text-[#E9E1EC]"}`}
            >
              <span className={`grid size-5 place-items-center rounded-[6px] text-[11px] ${i === 0 ? "bg-[#FFE3F2] text-[#C4006F]" : "bg-[#5A4362] text-[#E9E1EC]"}`}>{i + 1}</span>
              {s}
            </span>
          ))}
        </div>
      </div>

      <div
        role="img"
        aria-label="DIV ACS device screen with sample data: ONT DMOA3F2C81D online, health score 94 out of 100, RX power -18.4 dBm, TX power 2.3 dBm, 7 active devices."
        className="overflow-hidden rounded-[28px] bg-[#2B1B30] px-4 pt-4 min-[860px]:px-10 min-[860px]:pt-10"
        style={DOTS}
      >
        <div className="flex overflow-hidden rounded-t-[18px] bg-[#F6F3F5] shadow-[0_30px_80px_rgba(0,0,0,.35)]">
          <div className="hidden w-16 shrink-0 flex-col items-center gap-2 bg-[#2B1B30] py-4 min-[860px]:flex">
            <span className="mb-2 bg-[linear-gradient(90deg,#FF0091,#FFAC00)] bg-clip-text text-[13px] font-extrabold text-transparent">DIV</span>
            {SIDE.map((Icon, i) => (
              <span key={i} className={`grid size-10 place-items-center rounded-[10px] ${i === 1 ? "bg-[#43304A] text-white" : "text-[#A9A1AE]"}`}>
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-4 min-[860px]:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[20px] font-bold tracking-[-0.02em] text-[#2B1B30]">
                Device <span className="font-mono font-medium">DMOA3F2C81D</span>
              </div>
              <div className="flex gap-2 text-[12px] font-semibold">
                <span className="rounded-[8px] border border-[#E5E0E6] bg-white px-3 py-1.5 text-[#2B1B30]">Refresh live</span>
                <span className="rounded-[8px] bg-[#C62626] px-3 py-1.5 text-white">Reboot</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 rounded-[14px] bg-white p-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
              <div>
                <Label>Status</Label>
                <span className="mt-1 inline-block rounded-full bg-[#E3F4EA] px-2 py-0.5 text-[11px] font-semibold text-[#158039]">● online · 12s ago</span>
              </div>
              <div><Label>Model</Label><div className="mt-1 text-[13px] text-[#2B1B30]">Demo GPON ONT · DX-4G2</div></div>
              <div><Label>PPPoE</Label><div className="mt-1 font-mono text-[13px] text-[#2B1B30]">demo_user_014</div></div>
              <div><Label>Customer</Label><div className="mt-1 text-[13px] text-[#2B1B30]">Account #10482</div></div>
              <div><Label>PON</Label><div className="mt-1 font-mono text-[13px] text-[#2B1B30]">OLT-01 · 0/3 · ONU 14</div></div>
            </div>

            <div className="mt-4 hidden gap-1 text-[12px] font-semibold text-[#766C7C] min-[860px]:flex">
              {TABS.map((t, i) => (
                <span key={t} className={`rounded-full px-3 py-1.5 ${i === 0 ? "bg-[#2B1B30] text-white" : ""}`}>{t}</span>
              ))}
            </div>

            <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              <div className="rounded-[14px] bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[14px] font-bold text-[#2B1B30]">Health &amp; likely cause</div>
                  <span className="rounded-[6px] bg-[#E3F4EA] px-2 py-0.5 text-[11px] font-semibold text-[#158039]">94 / 100 · good</span>
                </div>
                <div className="mt-4 space-y-3">
                  <Bar label="Internet" pct={100} value="Connected" />
                  <Bar label="Stability" pct={92} value="No reboots 24 h" />
                  <Bar label="Optical" pct={86} value="Stable" />
                </div>
                <div className="mt-4 rounded-[10px] bg-[#E3F4EA] px-3 py-2 text-[12px] text-[#158039]">
                  No issues found. Fiber, power and Wi-Fi all look normal.
                </div>
              </div>

              <div className="rounded-[14px] bg-white p-5">
                <div className="text-[14px] font-bold text-[#2B1B30]">Optical signal</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Signal label="RX power" value="-18.4" range="Normal -8 to -25" />
                  <Signal label="TX power" value="2.3" range="Normal 0.5 to 5" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t min-[480px]:grid-cols-4 border-[#EFEAF0] pt-3">
                  {[["Active devices", "7"], ["On Wi-Fi", "5"], ["LAN up", "2"], ["Wi-Fi", "2.4 + 5G"]].map(([l, v]) => (
                    <div key={l}><Label>{l}</Label><div className="mt-1 text-[14px] font-bold text-[#2B1B30]">{v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[13px] text-[#766C7C]">Product screen with sample data.</p>
    </div>
  );
}
