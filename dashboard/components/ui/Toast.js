import { Toaster, toast as hot } from "react-hot-toast";

const show = (message, tone = "muted", opts = {}) => {
  if (tone === "ok") return hot.success(message, opts);
  if (tone === "bad") return hot.error(message, { duration: 6000, ...opts });
  if (tone === "warn") return hot(message, { icon: "⏳", duration: 6000, ...opts });
  return hot(message, opts);
};
show.loading = (message, opts) => hot.loading(message, opts);
show.dismiss = id => hot.dismiss(id);
show.promise = (promise, msgs) => hot.promise(promise, msgs);

export const useToast = () => show;

export function ToastProvider({ children }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        gutter={10}
        toastOptions={{
          duration: 4000,
          className: "!rounded-control !border !border-line !bg-white !px-4 !py-3 !text-sm !text-plum !shadow-xl",
          success: { iconTheme: { primary: "#158039", secondary: "#fff" } },
          error: { iconTheme: { primary: "#c62626", secondary: "#fff" } }
        }}
      />
    </>
  );
}
