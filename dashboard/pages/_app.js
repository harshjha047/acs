import "../styles/globals.css";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { ToastProvider } from "../components/ui/Toast";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });

export default function App({ Component, pageProps }) {
  return (
    <div className={`${jakarta.variable} ${plex.variable} font-sans`}>
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </div>
  );
}
