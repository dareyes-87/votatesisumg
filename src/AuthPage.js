// src/AuthPage.js
import React, { useState } from 'react';
import styles from './AuthPage.module.css';
import { supabase } from './supabaseClient'; // Importamos nuestro cliente de Supabase
import { useNavigate } from 'react-router-dom';

export default function AuthPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [university, setUniversity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/dashboard'); // Si el login es exitoso, vamos al panel de control
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            university_name: university, // Esto envía los metadatos a la DB
          }
        }
      });
      if (error) throw error;
      alert('¡Registro exitoso! Revisa tu email para confirmar la cuenta.');
      setActiveTab('login'); // Cambiamos a la pestaña de login
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>VotaTesis</h1>
        <p className={styles.subtitle}>La plataforma definitiva para la evaluación de proyectos académicos.</p>

        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('login')}
            className={`${styles.tabButton} ${activeTab === 'login' ? styles.active : ''}`}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => setActiveTab('signup')}
            className={`${styles.tabButton} ${activeTab === 'signup' ? styles.active : ''}`}
          >
            Crear Cuenta
          </button>
        </div>

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email-login">Email</label>
              <input
                id="email-login"
                type="email"
                placeholder="tu@universidad.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password-login">Contraseña</label>
              <input
                id="password-login"
                type="password"
                placeholder="********"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </form>
        )}

        {activeTab === 'signup' && (
          <form onSubmit={handleSignUp} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="university-signup">Nombre de la Universidad</label>
              <input
                id="university-signup"
                type="text"
                placeholder="Universidad del Saber"
                required
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="email-signup">Email</label>
              <input
                id="email-signup"
                type="email"
                placeholder="tu@universidad.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password-signup">Contraseña</label>
              <input
                id="password-signup"
                type="password"
                placeholder="********"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? 'Creando...' : 'Crear Cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}