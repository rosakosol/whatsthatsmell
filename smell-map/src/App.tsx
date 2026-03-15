import './App.css'
import SmellMap from './components/SmellMap'
import "leaflet/dist/leaflet.css"
import GreenMist from "./assets/green-mist.png"
import { ThemeProvider } from './components/theme-provider'
import { ModeToggle } from './components/mode-toggle'

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div>
        <div className="flex items-center justify-end p-2">
          <ModeToggle />
        </div>
        <div className="flex flex-col items-center justify-center pb-4">
          <div className="flex flex-row">
            <img src={GreenMist} className="h-10 w-auto mr-3" />
            <h1 className="text-4xl font-bold">What's That Smell?</h1>
          </div>
          <h2>Report and investigate offensive smells nearby.</h2>
        </div>
        <SmellMap />
      </div>
    </ThemeProvider>
  )
}

export default App