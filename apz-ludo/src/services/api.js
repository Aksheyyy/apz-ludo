import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach the JWT (if any) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise server errors to a thrown { code, message }.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const payload = err.response?.data?.error;
    return Promise.reject(payload || { code: 'NETWORK', message: 'Network error. Is the server running?' });
  }
);

export default api;
