import { SignInButton, useUser } from "@clerk/react";

import { Button } from "./ui";

type GetStartedButtonProps = {
  clerkEnabled?: boolean;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
  className?: string;
};

export function GetStartedButton({
  clerkEnabled = false,
  size,
  variant,
  className,
}: GetStartedButtonProps) {
  if (!clerkEnabled) {
    return (
      <Button size={size} variant={variant} className={className} asChild>
        <a href="/">Get started</a>
      </Button>
    );
  }

  return (
    <ClerkGetStartedButton
      size={size}
      variant={variant}
      className={className}
    />
  );
}

function ClerkGetStartedButton({
  size,
  variant,
  className,
}: Omit<GetStartedButtonProps, "clerkEnabled">) {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return (
      <Button size={size} variant={variant} className={className} asChild>
        <a href="/">Get started</a>
      </Button>
    );
  }

  return (
    <SignInButton mode="modal" forceRedirectUrl="/">
      <Button size={size} variant={variant} className={className}>
        Get started
      </Button>
    </SignInButton>
  );
}
