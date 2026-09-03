import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { OrdersProvider } from "./orders/OrdersProvider";
import { AdminLayout } from "./layout/AdminLayout";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Dashboard } from "./pages/Dashboard";
import { Fragrances } from "./pages/Fragrances";
import { Orders } from "./pages/Orders";
import { OrderDetail } from "./pages/OrderDetail";

/* Route map. Public auth routes sit outside the guard; everything under the
   AdminLayout is wrapped in ProtectedRoute (redirects to /login when there's
   no session). OrdersProvider wraps the protected area so the list and detail
   share one order store. */

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Protected */}
          <Route
            element={
              <ProtectedRoute>
                <OrdersProvider>
                  <AdminLayout />
                </OrdersProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="fragrances" element={<Fragrances />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
