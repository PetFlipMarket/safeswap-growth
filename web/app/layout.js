import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "./globals.css";

export const metadata = {
  title: "SafeSwap Growth OS",
  robots: { index: false },
  appleWebApp: { capable: true, title: "Growth OS", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon-192.png" },
};
export const viewport = { themeColor: "#0B0B10", viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
