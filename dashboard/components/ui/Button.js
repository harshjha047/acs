const variants = {
  primary: "bg-plum text-white hover:bg-plum/90",
  secondary: "bg-white text-plum border border-line hover:bg-canvas",
  brand: "bg-brand text-white hover:opacity-90",
  danger: "bg-bad text-white hover:bg-bad/90"
};

export default function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
