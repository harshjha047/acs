export default function Card({ title, action, className = "", children }) {
  return (
    <section className={`animate-fade-up rounded-card border border-line bg-white p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-base font-bold">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
