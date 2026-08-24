import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./query.ts";
import { router } from "./router.tsx";
import { startMenuBridge } from "./menu.ts";
import "./styles.css";

// Hört auf die CustomEvents, die `src/window.ts` aus dem nativen Menü
// hereinschickt. Im Browser-Entwicklungslauf passiert dabei schlicht nichts.
startMenuBridge();

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
