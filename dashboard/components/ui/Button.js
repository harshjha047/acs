import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-plum text-white hover:bg-plum/90",
  secondary: "bg-white text-plum border border-line hover:bg-canvas hover:border-plum/30",
  brand: "bg-brand text-white hover:opacity-90",
  danger: "bg-bad text-white hover:bg-bad/90"
};

export default function Button({ variant = "primary", loading = false, disabled, className = "", children, ...props }) {
  return (
    <button
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`relative inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${loading ? "!opacity-80" : ""} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
