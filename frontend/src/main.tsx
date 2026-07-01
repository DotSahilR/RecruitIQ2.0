import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import "./styles.css";
import { HomePage } from "@/pages/HomePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CandidatePage } from "@/pages/CandidatePage";
import { ValidationLabPage } from "@/pages/ValidationLabPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/candidate/:id" element={<CandidatePage />} />
        <Route path="/lab" element={<ValidationLabPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
