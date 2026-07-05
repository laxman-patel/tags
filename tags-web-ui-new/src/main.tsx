
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./app/App.tsx";
import { clerkAppearance } from "./app/clerkAppearance.ts";
import "./styles/index.css";

document.documentElement.dataset.mode = "dark";
document.body.dataset.mode = "dark";

const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")!).render(
  clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={clerkAppearance}>
      <App clerkEnabled />
    </ClerkProvider>
  ) : (
    <App />
  ),
);
