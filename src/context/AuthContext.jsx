import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("forensiai_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("forensiai_token"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("forensiai_token", token);
    } else {
      localStorage.removeItem("forensiai_token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("forensiai_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("forensiai_user");
    }
  }, [user]);

  const login = async (username, password) => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";
      const res = await axios.post(`${baseUrl}/login`, { username, password });
      setUser(res.data.user);
      setToken(res.data.token);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || "Login failed" };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
