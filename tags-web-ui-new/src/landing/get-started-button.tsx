import { SignInButton, useUser } from "@clerk/react";
import { Button, LinkButton } from "@cloudflare/kumo";

type KumoButtonSize = "sm" | "base" | "lg";
type KumoButtonVariant = "primary" | "secondary" | "outline";

type GetStartedButtonProps = {
  clerkEnabled?: boolean;
  size?: KumoButtonSize;
  variant?: KumoButtonVariant;
  className?: string;
};

export function GetStartedButton({
  clerkEnabled = false,
  size = "base",
  variant = "primary",
  className,
}: GetStartedButtonProps) {
  if (!clerkEnabled) {
    return (
      <LinkButton href="/" size={size} variant={variant} className={className}>
        Get started
      </LinkButton>
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
      <LinkButton href="/" size={size} variant={variant} className={className}>
        Get started
      </LinkButton>
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
