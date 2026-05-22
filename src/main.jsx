import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppRouter from './components/AppRouter.jsx'
import ToastContainer from './components/ToastContainer.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter>
      <App />
      <ToastContainer />
    </AppRouter>
  </StrictMode>,
)
