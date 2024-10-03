import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";

import "./index.css";
import { init } from "@dojoengine/sdk";
import { Schema, schema } from "./bindings.ts";
import { dojoConfig } from "../dojoConfig.ts";
import { DojoContextProvider } from "./DojoContext.tsx";
import { setupBurner } from "./setupBurner.tsx";

async function main() {
    const db = await init<Schema>(
        {
            client: {
                rpcUrl: dojoConfig.rpcUrl,
                toriiUrl: dojoConfig.toriiUrl,
                relayUrl: dojoConfig.relayUrl,
                worldAddress: dojoConfig.manifest.world.address,
            },
            domain: {
                name: "Example",
                version: "1.0",
                chainId: "your-chain-id",
                revision: "1",
            },
        },
        schema
    );

    const burnerManager = await setupBurner(dojoConfig);

    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <DojoContextProvider burnerManager={burnerManager}>
                <App db={db} />
            </DojoContextProvider>
        </StrictMode>
    );
}

main().catch((error) => {
    console.error("Failed to initialize the application:", error);
});