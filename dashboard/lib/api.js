import axios from "axios";

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || "/api" });

api.interceptors.request.use(config => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (typeof window !== "undefined" && !err.config?.url?.startsWith("/auth/login") && !err.config?.url?.startsWith("/auth/mfa/verify")) {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      } else if (err.response?.data?.mfaSetupRequired && window.location.pathname !== "/account") {
        window.location.href = "/account";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
