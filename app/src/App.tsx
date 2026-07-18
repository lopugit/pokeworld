import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { GamePage } from "./pages/GamePage";

function environmentPrefix() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "[LC] ";
  if (host.endsWith(".ts.net")) return "[TS] ";
  if (host.endsWith(".vercel.app")) return "[VC] ";
  return "";
}

export function App() {
  useEffect(() => {
    document.title = `${environmentPrefix()}Pokémon World`;
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  );
}
