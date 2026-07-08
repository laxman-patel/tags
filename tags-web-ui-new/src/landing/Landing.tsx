import { useUser } from "@clerk/react";
import { useEffect } from "react";

import { Background } from "./background";
import { Capabilities } from "./capabilities";
import { Features } from "./features";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { Navbar } from "./navbar";

type LandingProps = {
  clerkEnabled?: boolean;
};

export default function Landing({ clerkEnabled = false }: LandingProps) {
  useEffect(() => {
    document.title = "Tags — the open-source AI teammate for Slack";
  }, []);

  if (clerkEnabled) {
    return <ClerkLanding />;
  }

  return <LandingContent clerkEnabled={false} />;
}

function ClerkLanding() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace("/");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="landing flex min-h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <LandingContent clerkEnabled />;
}

function LandingContent({ clerkEnabled }: { clerkEnabled: boolean }) {
  return (
    <>
      <Navbar clerkEnabled={clerkEnabled} />
      <div className="landing min-h-screen bg-background text-foreground">
        <main>
          <Background className="via-muted to-muted/80">
            <Hero clerkEnabled={clerkEnabled} />
            <Features />
            <Capabilities />
          </Background>
          <Background variant="bottom" className="mb-0 overflow-hidden pb-0">
            <Footer clerkEnabled={clerkEnabled} />
          </Background>
        </main>
      </div>
    </>
  );
}
