import { BrowserRouter, HashRouter } from "react-router-dom";

/** Electron charge dist/index.html en file:// — BrowserRouter casse les liens profonds. */
function isFileProtocol() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

export default function AppRouter({ children }) {
  const Router = isFileProtocol() ? HashRouter : BrowserRouter;
  return <Router>{children}</Router>;
}
