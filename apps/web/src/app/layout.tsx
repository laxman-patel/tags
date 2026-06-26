export const metadata = {
  title: "Tags",
  description: "Channel-native agent for teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
