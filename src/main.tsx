import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App";
import { applyTheme, savedTheme } from "./lib/theme";
import { TabsProvider } from "./lib/tabs";
import { VeilProvider } from "./lib/veil";
import "./index.css";

// Before the first paint, so a chosen theme never flashes the other one.
applyTheme(savedTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <VeilProvider>
        <TabsProvider>
          <App />
        </TabsProvider>
      </VeilProvider>
    </HashRouter>
  </React.StrictMode>,
);
