import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App";
import { libraryLocked } from "./lib/library";
import { applyTheme, savedTheme } from "./lib/theme";
import { TabsProvider } from "./lib/tabs";
import { VeilProvider } from "./lib/veil";
import { Recover } from "./routes/Recover";
import "./index.css";

// Before the first paint, so a chosen theme never flashes the other one.
applyTheme(savedTheme());

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// A library whose key is missing opens on the recovery screen and nothing else.
libraryLocked().then((locked) =>
  root.render(
    <React.StrictMode>
      {locked ? (
        <Recover />
      ) : (
        <HashRouter>
          <VeilProvider>
            <TabsProvider>
              <App />
            </TabsProvider>
          </VeilProvider>
        </HashRouter>
      )}
    </React.StrictMode>,
  ),
);
