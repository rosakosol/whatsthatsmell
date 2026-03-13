import { useState } from 'react'
import './App.css'
import SmellMap from './SmellMap'
import "leaflet/dist/leaflet.css"

function App() {
  return (
    <>
      <div>
        <h1>What's That Smell?</h1>
        <SmellMap />
      </div>
    </>
  )
}

export default App
