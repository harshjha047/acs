import { useEffect, useState } from "react";
import api from "./api";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export function setSession(token, user) {
  if (token) localStorage.setItem("token", token);
  if (user) localStorage.setItem("user", JSON.stringify(user));
  me = null;
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  me = null;
}

export const can = (user, perm) => !!user?.permissions?.includes(perm);
export const needsMfaSetup = user => !!user?.mfa?.required && !user?.mfa?.enabled;

let me = null;
export function refreshUser() {
  me = api.get("/auth/me").then(({ data }) => {
    localStorage.setItem("user", JSON.stringify(data));
    return data;
  });
  me.catch(() => (me = null));
  return me;
}

export function useUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    setUser(read());
    let live = true;
    (me || refreshUser()).then(u => live && setUser(u)).catch(() => {});
    return () => { live = false; };
  }, []);
  return user;
}
