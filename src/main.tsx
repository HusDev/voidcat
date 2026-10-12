import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App";
import { VeilProvider } from "./lib/veil";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <VeilProvider>
        <App />
      </VeilProvider>
    </HashRouter>
  </React.StrictMode>,
);
