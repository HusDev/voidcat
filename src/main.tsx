import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App";
import { CloudGate } from "./cloud/CloudGate";
import { cloudConfigured } from "./cloud/firebase";
import { libraryLocked, onMac } from "./lib/library";
import { applyTheme, savedTheme } from "./lib/theme";
import { TabsProvider } from "./lib/tabs";
import { VeilProvider } from "./lib/veil";
import { Recover } from "./routes/Recover";
import "./index.css";

// Before the first paint, so a chosen theme never flashes the other one.
applyTheme(savedTheme());

/** In a browser with the cloud set up, the app runs on a signed-in, unlocked cloud library; on the Mac, on the local one. */
const Shell = ({ children }: { children: React.ReactNode }) => (!onMac && cloudConfigured ? <CloudGate>{children}</CloudGate> : <>{children}</>);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// A library whose key is missing opens on the recovery screen and nothing else.
libraryLocked().then((locked) =>
  root.render(
    <React.StrictMode>
      {locked ? (
        <Recover />
      ) : (
        <Shell>
          <HashRouter>
            <VeilProvider>
              <TabsProvider>
                <App />
              </TabsProvider>
            </VeilProvider>
          </HashRouter>
        </Shell>
      )}
    </React.StrictMode>,
  ),
);
