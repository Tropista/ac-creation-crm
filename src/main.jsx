import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTheme } from './utils/theme'
import App from './App.jsx'
import AppRouter from './components/AppRouter.jsx'
import ToastContainer from './components/ToastContainer.jsx'

initTheme()

if (import.meta.env.PROD && typeof window !== "undefined" && !window.electronAPI?.isElectron) {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter>
      <App />
      <ToastContainer />
    </AppRouter>
  </StrictMode>,
)
