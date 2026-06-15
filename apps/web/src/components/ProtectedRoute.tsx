import { LoaderCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="full-loader"><LoaderCircle className="spin" size={30} /></div>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

