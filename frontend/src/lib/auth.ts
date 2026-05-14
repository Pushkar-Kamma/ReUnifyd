import { api, ApiError } from "./api";

export type Me = {
  ok: true;
  user_id: number;
  email: string | null;
  name: string | null;
};

export const auth = {
  signup: (data: { email: string; password: string; name?: string }) =>
    api<{ ok: true; user_id: number; email: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    api<{ ok: true; user_id: number; email: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () =>
    api<{ ok: true }>("/auth/logout", { method: "POST" }),

  me: () => api<Me>("/auth/me"),

  /** Returns null when the user is not authenticated, else the Me payload. */
  meOrNull: async (): Promise<Me | null> => {
    try {
      return await api<Me>("/auth/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },
};
