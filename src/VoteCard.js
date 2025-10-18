// src/VoteCard.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import styles from './SalaPage.module.css';

// Component for the slider voting interface
const VotingInterface = ({ onSubmit, disabled, roleType }) => {
  const [score, setScore] = useState(5.0); // Initial score

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(score);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.votingArea}>
      <p>
        ¡Votación Abierta!
        {roleType === 'judge' && (
          <span className={styles.roleIdentifier}> (Votando como Juez Asignado)</span>
        )}
      </p>
      <div className={styles.voteSliderContainer}>
        <span className={styles.scoreDisplay}>{score.toFixed(1)}</span>
        <input
          type="range"
          min="1"
          max="10"
          step="0.1" // Allows decimals
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
        {disabled ? 'Enviando...' : 'Enviar Voto'}
      </button>
    </form>
  );
};

// Component to display the results
const ResultsDisplay = ({ results }) => {
  // Show loading state if results are null (still fetching)
  if (!results) return <div className={styles.resultsArea}>Calculando resultados...</div>;

  // Handle case where calculation might have failed or returned unexpected data
  if (results.error) {
      return <div className={styles.resultsArea} style={{color: 'red'}}>Error al calcular resultados.</div>;
  }

  return (
    <div className={styles.resultsArea}>
      <h4>Resultados Finales</h4>
      {/* Public Average */}
      <p>
        <strong>Promedio Público:</strong>{' '}
        {results.publicAvg !== null && results.publicAvg !== undefined ? results.publicAvg.toFixed(2) : 'N/A'}
        <span style={{ fontSize: '0.8em', color: 'gray' }}> (Aporta {results.publicPoints !== null && results.publicPoints !== undefined ? results.publicPoints.toFixed(2) : 'N/A'} / 10 pts)</span>
      </p>

      {/* Judge Scores */}
      <div>
        <strong>Puntajes Jueces</strong> (Total: {results.judgeTotal !== null && results.judgeTotal !== undefined ? results.judgeTotal.toFixed(1) : 'N/A'} / 30 pts):
        {results.judgeScores && results.judgeScores.length > 0 ? (
          <ul>
            {results.judgeScores.map((score, index) => (
              <li key={index}>
                Juez {index + 1}: {score !== null && score !== undefined ? score.toFixed(1) : 'No votó'} / 10 pts
              </li>
            ))}
             {/* Show placeholders if fewer than 3 judges voted */}
             {[...Array(Math.max(0, 3 - results.judgeScores.length))].map((_, i) => (
                <li key={`placeholder-${i}`} style={{ fontStyle: 'italic', color: 'gray' }}>Juez {results.judgeScores.length + i + 1}: No votó</li>
            ))}
          </ul>
        ) : (
          <p style={{ marginLeft: '1rem', fontStyle: 'italic', color: 'gray' }}>No hay votos de jueces registrados.</p>
        )}
      </div>

      {/* Total Score */}
      <p style={{ marginTop: '1rem', fontWeight: 'bold', fontSize: '1.1em' }}>
        <strong>Puntaje Total:</strong> {results.total !== null && results.total !== undefined ? results.total.toFixed(2) : 'N/A'} / 40 pts
      </p>
    </div>
  );
};


// Main VoteCard Component
export default function VoteCard({ vote }) {
  // State for user identification and role
  const [userRole, setUserRole] = useState(null); // { type: 'normal' | 'judge', id: 'uuid' }
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  // State for voting status
  const [hasVoted, setHasVoted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // State for results display
  const [resultsData, setResultsData] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [isFetchingResults, setIsFetchingResults] = useState(false);

  // Effect 1: Identify the user and their role for THIS specific vote
  useEffect(() => {
    const identifyUser = async () => {
      setIsLoadingRole(true);
      setHasVoted(false); // Reset vote status when role check starts
      const judgeToken = localStorage.getItem('judge_token');
      const voterId = localStorage.getItem('voterId');

      let finalRole = null;

      if (judgeToken) {
        // User has a judge token, check its validity and assignment
        const { data: judgeData } = await supabase
          .from('judges')
          .select('id, device_voter_id') // Get judge ID and their normal voter ID
          .eq('invite_token', judgeToken)
          .single();

        if (judgeData) {
          // Valid judge token, now check if assigned to this vote
          const { data: assignmentData } = await supabase
            .from('vote_assignments')
            .select('vote_id')
            .eq('vote_id', vote.id)
            .eq('judge_id', judgeData.id)
            .maybeSingle(); // Use maybeSingle as assignment might not exist

          if (assignmentData) {
            // Judge is assigned! Role is 'judge' with their judge ID.
            finalRole = { type: 'judge', id: judgeData.id };
          } else {
            // Judge is NOT assigned. Role is 'normal' using their device_voter_id.
            finalRole = { type: 'normal', id: judgeData.device_voter_id };
          }
        }
        // If judgeData is null (invalid token), fall through to normal user logic
      }

      // If not identified as a judge (or token was invalid), check for normal voter ID
      if (!finalRole) {
          if (voterId) {
            // Normal user with an existing ID
            finalRole = { type: 'normal', id: voterId };
          } else {
            // Completely new user/browser, should have been assigned in SalaPage, but generate as fallback
             console.warn(`VoteCard: No voterId found for non-judge user. Generating fallback.`);
             const newVoterId = crypto.randomUUID();
             localStorage.setItem('voterId', newVoterId);
             finalRole = { type: 'normal', id: newVoterId };
          }
      }

      // Ensure the role ID is valid before setting state
       if (finalRole && finalRole.id) {
           setUserRole(finalRole);
       } else {
           console.error("Failed to determine valid user role or ID", { finalRole, voterId, judgeToken });
           // Handle error state, maybe prevent voting?
           setUserRole({ type: 'error', id: null}); // Set an error state
       }

      setIsLoadingRole(false);
    };
    identifyUser();
  }, [vote.id]); // Rerun if the vote object changes ID

  // Effect 2: Check if the user (based on determined role) has already voted
  useEffect(() => {
    // Only run if role identification is complete and role is valid
    if (isLoadingRole || !userRole || !userRole.id || userRole.type === 'error') return;

    const checkVoteStatus = async () => {
      let table, idField, idValue;

      if (userRole.type === 'judge') {
        table = 'submissions_judge';
        idField = 'judge_id';
        idValue = userRole.id;
      } else { // 'normal'
        table = 'submissions_normal';
        idField = 'voter_id';
        idValue = userRole.id;
      }

      const { data, error } = await supabase
        .from(table)
        .select('id')
        .eq('vote_id', vote.id)
        .eq(idField, idValue)
        .maybeSingle();

      if (error) {
        console.error(`Error checking vote status in ${table}:`, error);
        setHasVoted(false); // Assume not voted on error
      } else {
        setHasVoted(!!data); // Set to true if data exists, false otherwise
      }
    };
    checkVoteStatus();
  }, [userRole, vote.id, isLoadingRole]); // Rerun when role is determined or vote ID changes

  // Function to handle vote submission
  const handleVoteSubmit = async (score) => {
    // Prevent submission if role is invalid or still loading
     if (isLoadingRole || !userRole || !userRole.id || userRole.type === 'error') {
         alert("No se puede votar: el rol del usuario no está claro. Recarga la página.");
         return;
     }
     if (hasVoted) return; // Prevent double submission

    setIsProcessing(true);
    let table, submission;

    if (userRole.type === 'judge') {
      table = 'submissions_judge';
      submission = { vote_id: vote.id, judge_id: userRole.id, score: score };
    } else { // 'normal'
      table = 'submissions_normal';
      submission = { vote_id: vote.id, voter_id: userRole.id, score: score };
    }

    const { error } = await supabase.from(table).insert(submission);

    if (error) {
      if (error.code === '23505') { // Unique constraint violation (already voted)
        alert('Ya has enviado tu voto para este proyecto.');
        setHasVoted(true); // Sync UI state
      } else {
        alert('Error al enviar el voto.');
        console.error(`Vote Submission Error (${table}):`, error);
      }
    } else {
      setHasVoted(true); // Mark as voted upon successful submission
    }
    setIsProcessing(false);
  };

  // Function to fetch and calculate results
  const fetchResults = async () => {
     // Don't refetch if already showing or fetching
    if (showResults && resultsData && !isFetchingResults) return;
    // Allow fetching only if vote is finished
    if (vote.status !== 'finished') {
      alert("Los resultados solo están disponibles cuando la votación ha finalizado.");
      return;
    }

    setIsFetchingResults(true);
    setShowResults(true); // Show the results area (will display loader initially)
    setResultsData(null); // Clear previous results

    try {
      // 1. Fetch judge submissions for this vote
      const { data: judgeSubmissions, error: judgeError } = await supabase
        .from('submissions_judge')
        .select('score') // Only need the score
        .eq('vote_id', vote.id);

      // 2. Fetch normal submissions for this vote
      const { data: normalSubmissions, error: normalError } = await supabase
        .from('submissions_normal')
        .select('score') // Only need the score
        .eq('vote_id', vote.id);

      if (judgeError || normalError) {
        console.error({ judgeError, normalError });
        throw new Error('Error al obtener los envíos de votos.');
      }

      // Calculate results
      const judgeScores = judgeSubmissions.map(s => s.score);
      // Judge contribution = sum of their scores (max 10 each, total max 30)
      const judgeTotalPoints = judgeScores.reduce((sum, score) => sum + (score || 0), 0);

      let publicAvg = 0;
      let publicPoints = 0; // Public contribution (max 10)
      if (normalSubmissions && normalSubmissions.length > 0) {
        const publicSum = normalSubmissions.reduce((sum, s) => sum + (s.score || 0), 0);
        publicAvg = (publicSum / normalSubmissions.length);
        // The average score (1-10) directly translates to the points contributed
        publicPoints = publicAvg;
      }

      // Final score = Judge points + Public points (max 40)
      const totalScore = judgeTotalPoints + publicPoints;

      setResultsData({
        judgeScores: judgeScores,     // Array [scoreJ1, scoreJ2, scoreJ3] (or fewer if not all voted)
        publicAvg: publicAvg,         // Actual public average (1-10)
        publicPoints: publicPoints,   // Points from public (max 10)
        judgeTotal: judgeTotalPoints, // Points from judges (max 30)
        total: totalScore,            // Final score (max 40)
        error: null                   // No error during calculation
      });

    } catch (error) {
      console.error("Error fetching/calculating results:", error);
      // Set an error state in resultsData to display an error message
      setResultsData({ error: "No se pudieron cargar los resultados." });
    } finally {
      setIsFetchingResults(false);
    }
  };


  // Render the appropriate action/display based on vote status and user state
  const renderVoteAction = () => {
    if (vote.status === 'pending') {
      return <span className={styles.statusBadge}>Próximamente</span>;
    }
    if (vote.status === 'finished') {
      // Vote finished, show "Ver Resultados" button
      return (
        <div style={{ textAlign: 'center' }}>
          <span className={styles.statusBadge}>Finalizada</span>
          <button
            onClick={fetchResults}
            disabled={isFetchingResults}
            className={styles.resultsButton}
          >
            {isFetchingResults ? 'Cargando...' : (showResults ? 'Actualizar Resultados' : 'Ver Resultados')}
          </button>
        </div>
      );
    }
    if (vote.status === 'active') {
      // Vote is active
      if (isLoadingRole) {
        return <span className={styles.statusBadge}>Verificando rol...</span>;
      }
       if (userRole && userRole.type === 'error') {
           return <span className={styles.statusBadge} style={{backgroundColor: 'red', color: 'white'}}>Error de Rol</span>;
       }
      if (hasVoted) {
        // User has already voted
        return <span className={styles.statusBadge}>¡Voto Enviado!</span>;
      }
      // User hasn't voted yet, show voting interface
      return (
        <VotingInterface
          onSubmit={handleVoteSubmit}
          disabled={isProcessing}
          roleType={userRole?.type} // Pass role type for display ('judge' or 'normal')
        />
      );
    }
    // Should not happen, but return null as fallback
    return null;
  };

  // --- JSX Rendering ---
  return (
    <div className={`${styles.voteCard} ${styles[vote.status]}`}>
      {/* Vote Information */}
      <div className={styles.voteInfo}>
        <h3>{vote.title}</h3>
        <p>Presentado por: {vote.student_presenter || 'N/A'}</p>
      </div>
      {/* Action Area (Voting Interface or Status/Results Button) */}
      <div className={styles.voteAction}>
        {renderVoteAction()}
        {/* Results Display Area - shown only when showResults is true */}
        {showResults && <ResultsDisplay results={resultsData} />}
      </div>
    </div>
  );
}