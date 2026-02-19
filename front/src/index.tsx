// diploma/front/src/index.tsx

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Could not find root element");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
