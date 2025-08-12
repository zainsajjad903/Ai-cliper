// /src/App.jsx
import React from "react";
import AuthGate from "./auth/AuthGate";
import OriginalApp from "./OriginalApp";

export default function App() {
  return (
    <AuthGate>
      <OriginalApp />
    </AuthGate>
  );
}
