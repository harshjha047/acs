import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(localStorage.getItem("token") ? "/devices" : "/login");
  }, [router]);
  return null;
}
