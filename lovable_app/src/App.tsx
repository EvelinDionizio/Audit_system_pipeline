import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Revisao from "./pages/Revisao";
import Analista from "./pages/Analista";
import NotFound from "./pages/NotFound";

// Rotas equivalentes às da API FastAPI: /login, / (revisão) e /analista.
const App = () => (
  <AuthProvider>
    <Toaster richColors position="top-right" />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Revisao /></ProtectedRoute>} />
        <Route path="/analista" element={<ProtectedRoute analista><Analista /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
