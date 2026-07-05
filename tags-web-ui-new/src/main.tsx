
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./app/App.tsx";
import "./styles/index.css";

document.documentElement.dataset.mode = "dark";
document.body.dataset.mode = "dark";

const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const clerkAppearance = {
  variables: {
    colorBackground: "#0a0c11",
    colorText: "#e2e4ea",
    colorTextSecondary: "#9aa0aa",
    colorPrimary: "#7c6fff",
    colorInputBackground: "#10131a",
    colorInputText: "#e2e4ea",
    colorNeutral: "#1a1d28",
    borderRadius: "8px",
  },
  elements: {
    cardBox: "bg-[#0a0c11] border border-white/10 shadow-2xl",
    card: "bg-[#0a0c11]",
    modalContent: "bg-[#0a0c11] text-[#e2e4ea]",
    modalCloseButton: "text-[#e2e4ea] hover:bg-white/10",
    navbar: "bg-[#0a0c11] border-white/10",
    navbarButton: "text-[#e2e4ea] hover:bg-white/10",
    formButtonPrimary: "bg-[#7c6fff] text-white hover:bg-[#6b60e8]",
    userButtonPopoverCard: "bg-[#0a0c11] border border-white/10 text-[#e2e4ea]",
    userButtonPopoverActionButton: "text-[#e2e4ea] hover:bg-white/10",
    userButtonPopoverActionButtonText: "text-[#e2e4ea]",
    userButtonPopoverFooter: "hidden",
  },
};

createRoot(document.getElementById("root")!).render(
  clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={clerkAppearance}>
      <App clerkEnabled />
    </ClerkProvider>
  ) : (
    <App />
  ),
);
