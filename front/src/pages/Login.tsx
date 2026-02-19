// diploma/front/src/pages/Login.tsx

import React, { useState, useContext, FormEvent } from "react";
import { AuthContext } from "../auth/AuthContext";
import "./Login.css";

export const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useContext(AuthContext);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // For debugging: show entered values before login
    console.log("Login attempt:", { username, password });
    // In production this would be an API call.
    // For demo: encode credentials in base64 as a fake token.
    const fakeToken = btoa(`${username}:${password}`);
    console.log("Generated fake token:", fakeToken);
    login(fakeToken);
  };

  return (
    <div className="login-page">
      <h2>Войти</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Имя пользователя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Войти</button>
      </form>
    </div>
  );
};
