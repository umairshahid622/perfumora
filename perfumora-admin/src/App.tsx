import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { OrdersProvider } from "./orders/OrdersProvider";
import { FragrancesProvider } from "./fragrances/FragrancesProvider";
import { AdminLayout } from "./layout/AdminLayout";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Fragrances } from "./pages/Fragrances";
import { Orders } from "./pages/Orders";
import { OrderDetail } from "./pages/OrderDetail";

/* Route map. Public auth routes sit outside the guard; everything under the
   AdminLayout is wrapped in ProtectedRoute (redirects to /login when there's
   no session). The two data providers wrap the protected area so each list is
   fetched once and shared — orders by the list and detail screens, fragrances
   by the inventory grid and the dashboard.

   /reset-password is public: the recovery link has to open without a session
   already in place (opening it creates one). */

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected */}
          <Route
            element={
              <ProtectedRoute>
                <FragrancesProvider>
                  <OrdersProvider>
                    <AdminLayout />
                  </OrdersProvider>
                </FragrancesProvider>
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
