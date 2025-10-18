// src/SalaPage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import styles from './SalaPage.module.css';
import VoteCard from './VoteCard';

export default function SalaPage() {
  const { eventId } = useParams();
  const [eventName, setEventName] = useState('');
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('🔍 Component mounted with eventId:', eventId);
    
    // --- Lógica de Identificación de Usuario ---
    const identifyUser = () => {
      const judgeToken = localStorage.getItem('judge_token');
      const voterId = localStorage.getItem('voterId');

      if (!judgeToken && !voterId) {
        const newVoterId = crypto.randomUUID();
        localStorage.setItem('voterId', newVoterId);
        console.log('✅ Nuevo votante identificado:', newVoterId);
      } else {
        console.log('👤 Usuario identificado:', { judgeToken, voterId });
      }
    };

    identifyUser();

    // --- Cargar Datos Iniciales de la Sala ---
    const fetchEventData = async () => {
      try {
        console.log('📡 Iniciando fetch de datos...');
        
        // 1. Obtener el nombre de la sala
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('name')
          .eq('id', eventId)
          .single();

        if (eventError) {
          console.error('❌ Error al cargar evento:', eventError);
          setError('No se pudo encontrar la sala de votación.');
          setLoading(false);
          return;
        }
        
        console.log('✅ Evento cargado:', eventData);
        setEventName(eventData.name);

        // 2. Obtener las votaciones de esa sala
        const { data: votesData, error: votesError } = await supabase
          .from('votes')
          .select('*')
          .eq('event_id', eventId);
        
        console.log('📊 Respuesta de votaciones:', {
          data: votesData,
          error: votesError,
          count: votesData?.length
        });

        if (votesError) {
          console.error('❌ Error al cargar votaciones:', votesError);
          setError(`No se pudieron cargar las votaciones: ${votesError.message}`);
        } else if (!votesData || votesData.length === 0) {
          console.warn('⚠️ No se encontraron votaciones para este evento');
          setVotes([]);
        } else {
          console.log('✅ Votaciones cargadas exitosamente:', votesData);
          // Ordenar por fecha de creación
          const sortedVotes = votesData.sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
          );
          setVotes(sortedVotes);
        }
      } catch (err) {
        console.error('❌ Error inesperado:', err);
        setError(`Error inesperado: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();

    // --- Suscripción a Cambios en Tiempo Real ---
    console.log('📡 Configurando suscripción en tiempo real...');
    const channel = supabase
      .channel(`public:votes:event_id=eq.${eventId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'votes', 
          filter: `event_id=eq.${eventId}` 
        },
        (payload) => {
          console.log('🔔 Cambio en tiempo real recibido:', payload);
          
          if (payload.eventType === 'INSERT') {
            setVotes(current => [...current, payload.new].sort((a, b) => 
              new Date(a.created_at) - new Date(b.created_at)
            ));
          } else if (payload.eventType === 'UPDATE') {
            setVotes(current => 
              current.map(vote => vote.id === payload.new.id ? payload.new : vote)
            );
          } else if (payload.eventType === 'DELETE') {
            setVotes(current => 
              current.filter(vote => vote.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Estado de suscripción:', status);
      });

    return () => {
      console.log('🔌 Desconectando canal en tiempo real');
      supabase.removeChannel(channel);
    };

  }, [eventId]);

  if (loading) {
    return (
      <div className={styles.centeredMessage}>
        Cargando Sala...
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={styles.centeredMessage}>
        <div style={{ color: '#ef4444' }}>{error}</div>
        <button 
          onClick={() => window.location.reload()} 
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{eventName}</h1>
        <p>Lista de Proyectos a Votar</p>
      </header>
      
      {votes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
          <p>No hay votaciones disponibles en esta sala aún.</p>
        </div>
      ) : (
        <main className={styles.voteList}>
          {votes.map((vote) => (
            <VoteCard key={vote.id} vote={vote} />
          ))}
        </main>
      )}
    </div>
  );
}