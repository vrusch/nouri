import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import UpdatePrompt from './components/UpdatePrompt.tsx'

// Appka je pevný mobilní shell — přiblížení prsty tu nic nepřináší, jen omylem roztáhne
// obrazovku a uživatelka pak neví, jak zpátky. iOS Safari od verze 10 ignoruje
// user-scalable=no z viewport metatagu (index.html), pinch spolehlivě zastaví až tohle.
const preventPinchZoom = (e: Event) => e.preventDefault()
document.addEventListener('gesturestart', preventPinchZoom)
document.addEventListener('gesturechange', preventPinchZoom)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
        <UpdatePrompt />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
)
