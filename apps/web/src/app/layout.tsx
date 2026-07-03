import { ClerkProvider } from "@clerk/nextjs";
import { AuthHeader } from "@/components/auth-header";
import "./globals.css";

export const metadata = {
  title: "Tags",
  description: "Channel-native agent for teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <AuthHeader />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
