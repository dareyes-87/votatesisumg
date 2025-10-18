// src/VoteCard.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import styles from './SalaPage.module.css';

// Componente para la interfaz de votación con slider
const VotingInterface = ({ onSubmit, disabled, roleType }) => {
  const [score, setScore] = useState(5.0); // Inicia en 5.0

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(score);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.votingArea}>
      <p>
        ¡Votación Abierta!
        {roleType === 'judge' && (
          <span className={styles.roleIdentifier}> (Votando como Juez)</span>
        )}
      </p>
      <div className={styles.voteSliderContainer}>
        <span className={styles.scoreDisplay}>{score.toFixed(1)}</span>
        <input
          type="range"
          min="1"
          max="10"
          step="0.1"
          value={score}
          onChange={(e) => setScore(parseFloat(e.target.value))}
          className={styles.voteSlider}
          disabled={disabled}
        />
      </div>
      <button
        type="submit"
        className={styles.voteButton}
        disabled={disabled}
      >
        Enviar Voto
      </button>
    </form>
  );
};

export default function VoteCard({ vote }) {
  const [userRole, setUserRole] = useState(null); // { type: 'normal' | 'judge', id: 'uuid' }
  const [hasVoted, setHasVoted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  // 1. Identificar al usuario y su rol para ESTA votación
  useEffect(() => {
    const identifyUser = async () => {
      setIsLoadingRole(true);
      const judgeToken = localStorage.getItem('judge_token');
      const voterId = localStorage.getItem('voterId');

      if (judgeToken) {
        // Es un juez, necesitamos saber su ID y si está asignado
        const { data: judgeData } = await supabase
          .from('judges')
          .select('id, device_voter_id')
          .eq('invite_token', judgeToken)
          .single();

        if (judgeData) {
          // Ahora, verificar si está asignado a ESTA votación
          const { data: assignmentData } = await supabase
            .from('vote_assignments')
            .select('vote_id')
            .eq('vote_id', vote.id)
            .eq('judge_id', judgeData.id)
            .maybeSingle();

          if (assignmentData) {
            // SÍ es un Juez Asignado
            setUserRole({ type: 'judge', id: judgeData.id });
          } else {
            // Es un Juez, pero No Asignado (actúa como normal)
            setUserRole({ type: 'normal', id: judgeData.device_voter_id });
          }
        } else {
          // Token de juez inválido o corrupto, actuar como normal
          setUserRole({ type: 'normal', id: voterId });
        }
      } else {
        // Es un Usuario Normal
        setUserRole({ type: 'normal', id: voterId });
      }
      setIsLoadingRole(false);
    };
    identifyUser();
  }, [vote.id]);

  // 2. Verificar si el usuario ya votó (una vez que tengamos su rol)
  useEffect(() => {
    if (!userRole) return; // No hacer nada si aún no sabemos el rol

    const checkVoteStatus = async () => {
      let table, idField, idValue;

      if (userRole.type === 'judge') {
        table = 'submissions_judge';
        idField = 'judge_id';
        idValue = userRole.id;
      } else {
        table = 'submissions_normal';
        idField = 'voter_id';
        idValue = userRole.id;
      }

      const { data } = await supabase
        .from(table)
        .select('id')
        .eq('vote_id', vote.id)
        .eq(idField, idValue)
        .maybeSingle();

      if (data) {
        setHasVoted(true);
      }
    };
    checkVoteStatus();
  }, [userRole, vote.id]);

  // 3. Enviar el voto a la tabla correcta
  const handleVoteSubmit = async (score) => {
    setIsProcessing(true);
    let table, submission;

    if (userRole.type === 'judge') {
      table = 'submissions_judge';
      submission = {
        vote_id: vote.id,
        judge_id: userRole.id,
        score: score,
      };
    } else {
      table = 'submissions_normal';
      submission = {
        vote_id: vote.id,
        voter_id: userRole.id,
        score: score,
      };
    }

    const { error } = await supabase.from(table).insert(submission);

    if (error) {
      if (error.code === '23505') { // Ya votó
        alert('Ya has enviado tu voto para este proyecto.');
      } else {
        alert('Error al enviar el voto.');
      }
    } else {
      setHasVoted(true); // Voto exitoso
    }
    setIsProcessing(false);
  };

  // 4. Renderizar la acción correcta según el estado
  const renderVoteAction = () => {
    if (vote.status === 'pending') {
      return <span className={styles.statusBadge}>Próximamente</span>;
    }
    if (vote.status === 'finished') {
      return <span className={styles.statusBadge}>Finalizada</span>;
    }
    if (vote.status === 'active') {
      if (isLoadingRole) {
        return <span className={styles.statusBadge}>Verificando...</span>;
      }
      if (hasVoted) {
        return <span className={styles.statusBadge}>¡Voto Enviado!</span>;
      }
      return (
        <VotingInterface 
          onSubmit={handleVoteSubmit} 
          disabled={isProcessing} 
          roleType={userRole?.type}
        />
      );
    }
    return null;
  };

  return (
    <div className={`${styles.voteCard} ${styles[vote.status]}`}>
      <div className={styles.voteInfo}>
        <h3>{vote.title}</h3>
        <p>Presentado por: {vote.student_presenter || 'N/A'}</p>
      </div>
      <div className={styles.voteAction}>
        {renderVoteAction()}
      </div>
    </div>
  );
}