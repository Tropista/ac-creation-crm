import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTheme } from './utils/theme'
import App from './App.jsx'
import AppRouter from './components/AppRouter.jsx'
import ToastContainer from './components/ToastContainer.jsx'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter>
      <App />
      <ToastContainer />
    </AppRouter>
  </StrictMode>,
)
