import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.tsx";
import Draft from "./Draft.tsx";
import ScoreboardEditor from "./ScoreboardEditor.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/scoreboard-editor" element={<ScoreboardEditor />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
