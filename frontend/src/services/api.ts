import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

// Attach Auth0 token to every request
export const setAuthToken = (token: string) => {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export default api;
export type ParishRole = "admin" | "editor" | "viewer";
export interface ParishMember {
  id: number; email: string; role: ParishRole; account_id: number | null; status: "pending" | "active";
}
export const memberApi = {
  me: (id: string) => api.get<ParishMember>(`/account/parishes/${id}/me`),
  list: (id: string) => api.get<ParishMember[]>(`/account/parishes/${id}/members`),
  invite: (id: string, email: string, role: "editor" | "viewer") =>
    api.post(`/account/parishes/${id}/invitations`, { email, role }),
  changeRole: (id: string, memberId: number, role: ParishRole) =>
    api.patch(`/account/parishes/${id}/members/${memberId}`, { role }),
  remove: (id: string, memberId: number) => api.delete(`/account/parishes/${id}/members/${memberId}`),
};
