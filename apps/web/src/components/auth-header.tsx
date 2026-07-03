"use client";

import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";

export function AuthHeader() {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        borderBottom: "1px solid var(--border)",
        background: "rgb(9 9 11 / 0.72)",
        color: "var(--text)",
        fontFamily: "system-ui",
      }}
    >
      <Show when="signed-out">
        <SignInButton mode="modal" />
        <SignUpButton mode="modal" />
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </header>
  );
}
