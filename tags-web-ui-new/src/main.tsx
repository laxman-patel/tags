
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./app/App.tsx";
import { clerkAppearance } from "./app/clerkAppearance.ts";
import Landing from "./landing/Landing.tsx";
import "./styles/index.css";

const pathname = window.location.pathname;
const isLandingRoute = pathname === "/home" || pathname.startsWith("/home/");

if (!isLandingRoute) {
  document.documentElement.dataset.mode = "dark";
  document.body.dataset.mode = "dark";
}

const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")!).render(
  clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={clerkAppearance}>
      {isLandingRoute ? <Landing clerkEnabled /> : <App clerkEnabled />}
    </ClerkProvider>
  ) : (
    isLandingRoute ? <Landing /> : <App />
  ),
);
