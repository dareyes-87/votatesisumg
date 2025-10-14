// src/ProtectedRoute.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtenemos la sesión activa
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Escuchamos cambios en la autenticación (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div>Cargando...</div>; // O un spinner
  }

  // Si hay sesión, muestra el contenido de la ruta. Si no, redirige a /auth.
  return session ? <Outlet /> : <Navigate to="/auth" replace />;
}