import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

// Attach Auth0 token to every request
export const setAuthToken = (token: string) => {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export default api;