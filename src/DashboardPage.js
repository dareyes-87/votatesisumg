// src/DashboardPage.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Obtener datos del usuario
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
      } else {
        navigate('/auth');
      }
    };
    fetchUser();
  }, [navigate]);

  useEffect(() => {
    // 2. Obtener los eventos (salas) del usuario cuando el usuario esté disponible
    if (user) {
      const fetchEvents = async () => {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching events:', error);
        } else {
          setEvents(data);
        }
        setLoading(false);
      };
      fetchEvents();
    }
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleCreateEvent = async () => {
    const eventName = prompt('Ingresa el nombre de la nueva sala de votación:');
    if (eventName && user) {
      const { data, error } = await supabase
        .from('events')
        .insert({ name: eventName, created_by: user.id })
        .select();

      if (error) {
        alert('Error al crear la sala.');
        console.error(error);
      } else {
        setEvents([data[0], ...events]); // Añade la nueva sala al inicio de la lista
      }
    }
  };

  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    // Cargar las votaciones de esta sala
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('event_id', event.id);
    
    if(error) console.error("Error fetching votes:", error);
    else setVotes(data);
  };

  if (loading) {
    return <div>Cargando panel...</div>;
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Barra Lateral */}
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.newEventButton} onClick={handleCreateEvent}>
            + Nueva Sala
          </button>
          {/* Aquí podría ir un input de búsqueda */}
        </div>

        <ul className={styles.eventList}>
          {events.map((event) => (
            <li key={event.id} className={styles.eventItem}>
              <button
                onClick={() => handleSelectEvent(event)}
                className={selectedEvent?.id === event.id ? styles.active : ''}
              >
                {event.name}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.sidebarFooter}>
          <p style={{fontSize: '0.8rem', color: '#9CA3AF', textAlign: 'center'}}>{user?.email}</p>
          <button className={styles.logoutButton} onClick={handleLogout}>
            Cerrar Sesión
          </button>
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className={styles.mainContent}>
        {selectedEvent ? (
          <div>
            <h2>{selectedEvent.name}</h2>
            <p>Aquí se mostrarán las votaciones de esta sala.</p>
            {/* TODO: Botón para crear nueva votación */}
            
            <ul className={styles.voteList}>
              {votes.length > 0 ? (
                votes.map(vote => (
                  <li key={vote.id} className={styles.voteItem}>
                    <h3>{vote.title}</h3>
                    <p>Estado: {vote.status}</p>
                  </li>
                ))
              ) : (
                <p>No hay votaciones en esta sala. ¡Crea una!</p>
              )}
            </ul>
          </div>
        ) : (
          <div className={styles.placeholder}>
            Selecciona o crea una sala para empezar
          </div>
        )}
      </main>
    </div>
  );
}