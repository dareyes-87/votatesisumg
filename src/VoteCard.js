// src/VoteCard.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import styles from './SalaPage.module.css';

// --- Component VotingInterface (Handles Slider Input) ---
const VotingInterface = ({ onSubmit, disabled, roleType }) => {
  const [score, setScore] = useState(5.0); // Start at 5.0

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(score);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.votingArea}>
      <p>
        ¡Votación Abierta!
        {/* Display role only if it's an assigned judge */}
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

// --- Component ResultsDisplay (Shows Calculated Results) ---
const ResultsDisplay = ({ results }) => {
  // Show loading state if results are null (still fetching)
  if (!results) return <div className={styles.resultsArea}>Calculando resultados...</div>;

  // Handle case where calculation might have failed
  if (results.error) {
      return <div className={styles.resultsArea} style={{color: 'red'}}>Error al calcular resultados.</div>;
  }

  return (
    <div className={styles.resultsArea}>
      <h4>Resultados Finales</h4>
      {/* Public Average */}
      <p>
        <strong>Promedio Público:</strong>{' '}
        {/* Check for null/undefined before calling toFixed */}
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
             {/* Show placeholders if fewer than 3 judges submitted */}
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


// --- Main VoteCard Component ---
export default function VoteCard({ vote }) {
  // State for user identification and role
  const [userRole, setUserRole] = useState(null); // { type: 'normal' | 'judge' | 'error', id: 'uuid' | null }
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  // State for voting status
  const [hasVoted, setHasVoted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // For disabling button during submission

  // State for results display
  const [resultsData, setResultsData] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [isFetchingResults, setIsFetchingResults] = useState(false);

  // Effect 1: Identify the user and determine their role for THIS specific vote
  useEffect(() => {
    const identifyUser = async () => {
      setIsLoadingRole(true);
      setHasVoted(false); // Reset vote status when vote/role check starts
      setShowResults(false); // Hide results when vote changes
      setResultsData(null); // Clear old results
      const judgeToken = localStorage.getItem('judge_token');
      const voterId = localStorage.getItem('voterId');

      let finalRole = null;
      console.log(`[VoteCard ${vote.id}] Identifying user... Judge Token: ${judgeToken ? 'Present' : 'Absent'}, Voter ID: ${voterId || 'Absent'}`);


      if (judgeToken) {
        // User has a judge token, check its validity and assignment
        const { data: judgeData, error: judgeFetchError } = await supabase
          .from('judges')
          .select('id, device_voter_id') // Get judge ID and their normal voter ID
          .eq('invite_token', judgeToken)
          .single(); // Expect only one judge per token

        // Log potential errors fetching judge data
        if (judgeFetchError && judgeFetchError.code !== 'PGRST116') { // Ignore 'PGRST116' (No rows found) means invalid token
            console.error(`[VoteCard ${vote.id}] Error fetching judge data for token:`, judgeFetchError);
        }

        if (judgeData) {
          // Valid judge token found
          console.log(`[VoteCard ${vote.id}] Valid judge token found. Judge ID: ${judgeData.id}, Device Voter ID: ${judgeData.device_voter_id}`);
          // Now check if assigned to this specific vote
          const { data: assignmentData, error: assignmentError } = await supabase
            .from('vote_assignments')
            .select('vote_id', { count: 'exact', head: true }) // Just need to know if the row exists
            .eq('vote_id', vote.id)
            .eq('judge_id', judgeData.id);
            // .maybeSingle(); // maybeSingle is fine too

          if (assignmentError) {
              console.error(`[VoteCard ${vote.id}] Error checking vote assignment for judge ${judgeData.id}:`, assignmentError);
              // Decide how to handle this error - maybe treat as non-assigned judge?
              finalRole = { type: 'error', id: null }; // Set error state
          } else if (assignmentData && assignmentData.count > 0) {
            // Judge is assigned! Role is 'judge' with their judge ID.
            finalRole = { type: 'judge', id: judgeData.id };
            console.log(`[VoteCard ${vote.id}] Judge ${judgeData.id} IS assigned.`);
          } else {
            // Judge is NOT assigned. Role is 'normal' using their device_voter_id.
             // Make sure device_voter_id exists
             if (judgeData.device_voter_id) {
                 finalRole = { type: 'normal', id: judgeData.device_voter_id };
                 console.log(`[VoteCard ${vote.id}] Judge ${judgeData.id} is NOT assigned. Using normal ID: ${judgeData.device_voter_id}`);
             } else {
                 console.error(`[VoteCard ${vote.id}] Judge ${judgeData.id} IS NOT assigned AND missing device_voter_id! Cannot vote.`);
                 finalRole = { type: 'error', id: null }; // Mark as error, cannot vote
             }
          }
        } else {
             console.log(`[VoteCard ${vote.id}] Invalid or expired judge token.`);
             // If judge token is invalid, fall through to normal user logic
        }
      }

      // If not identified as a judge (or token was invalid), check for normal voter ID
      if (!finalRole || finalRole.type === 'error') { // Check error state too
          if (voterId) {
            // Normal user with an existing ID
            finalRole = { type: 'normal', id: voterId };
            console.log(`[VoteCard ${vote.id}] Identified as Normal User with ID: ${voterId}`);
          } else {
            // This case should ideally be handled by SalaPage ensuring voterId exists.
             console.error(`[VoteCard ${vote.id}] CRITICAL - No voterId found and not identified as judge. Cannot determine role.`);
             finalRole = { type: 'error', id: null }; // Cannot vote without an ID
          }
      }

      // Final validation and state update
       if (finalRole && finalRole.id) {
           setUserRole(finalRole);
       } else {
           // Ensure an error state is set if we couldn't get a valid role/ID
           console.error("Failed to determine valid user role or ID", { finalRole, voterId, judgeToken });
           setUserRole({ type: 'error', id: null});
       }

      setIsLoadingRole(false);
    };
    identifyUser();
    // Dependency array includes vote.id to re-run identification if the vote object changes
  }, [vote.id]);

  // Effect 2: Check if the user (based on determined role) has already voted for THIS vote
  useEffect(() => {
    // Only run if role identification is complete and the role/ID is valid
    if (isLoadingRole || !userRole || !userRole.id || userRole.type === 'error') {
        // Reset hasVoted state if role is loading or invalid
        setHasVoted(false);
        return;
    }


    const checkVoteStatus = async () => {
        let table, idField, idValue;

        // Determine the correct table and field based on the user's role
        if (userRole.type === 'judge') {
            table = 'submissions_judge';
            idField = 'judge_id';
            idValue = userRole.id;
        } else { // 'normal' (covers normal users and unassigned judges)
            table = 'submissions_normal';
            idField = 'voter_id';
            idValue = userRole.id;
        }

        console.log(`[VoteCard ${vote.id}] Checking vote status in ${table} for ID ${idValue}`);

        // Query Supabase to see if a submission exists for this vote and user ID
        const { data, error, count } = await supabase
            .from(table)
            .select('id', { count: 'exact', head: true }) // More efficient
            .eq('vote_id', vote.id)
            .eq(idField, idValue);

        if (error) {
            console.error(`[VoteCard ${vote.id}] Error checking vote status in ${table}:`, error);
            setHasVoted(false); // Assume not voted if there's an error checking
        } else {
            // If count > 0, the user has voted
            const voted = count > 0;
            setHasVoted(voted);
            console.log(`[VoteCard ${vote.id}] User hasVoted status for ${idValue}: ${voted}`);
        }
    };

    checkVoteStatus();
    // Rerun this effect if the userRole changes, vote.id changes, or loading state finishes
  }, [userRole, vote.id, isLoadingRole]);

  // Function to handle the actual vote submission
  const handleVoteSubmit = async (score) => {
     // Prevent submission if role is invalid, still loading, or already voted
     if (isLoadingRole || !userRole || !userRole.id || userRole.type === 'error') {
         alert("No se puede votar: el rol del usuario no está claro. Recarga la página.");
         console.error("[VoteCard Submit] Prevented: Invalid user role", userRole);
         return;
     }
     if (hasVoted) {
        console.warn("[VoteCard Submit] Prevented: Already voted.");
        return; // Prevent double submission
     }

    setIsProcessing(true); // Disable button
    let table, submission;

    // Prepare the submission data based on the user's role
    if (userRole.type === 'judge') {
      table = 'submissions_judge';
      submission = { vote_id: vote.id, judge_id: userRole.id, score: score };
    } else { // 'normal'
      table = 'submissions_normal';
      // Ensure the voter_id is valid before submitting
      if (!userRole.id) {
          alert('Error: ID de votante no encontrado. Recarga la página.');
          console.error("[VoteCard Submit] Prevented: Missing voter_id for normal user.", userRole);
          setIsProcessing(false);
          return;
      }
      submission = { vote_id: vote.id, voter_id: userRole.id, score: score };
    }

    console.log(`[VoteCard ${vote.id}] Attempting to insert into "${table}":`, JSON.stringify(submission));

    // Insert the vote into the appropriate table
    const { error } = await supabase.from(table).insert(submission);

    if (error) {
      console.error(`[VoteCard ${vote.id}] Error inserting into "${table}":`, JSON.stringify(error, null, 2));
      if (error.code === '23505') { // Unique constraint violation (already voted)
        alert('Ya has enviado tu voto para este proyecto.');
        setHasVoted(true); // Sync UI state
      } else {
        // Provide more specific error if possible, otherwise generic
        alert(`Error al enviar el voto. (${error.message})`);
      }
    } else {
      console.log(`[VoteCard ${vote.id}] Vote successfully inserted into "${table}"`);
      setHasVoted(true); // Mark as voted upon successful submission
    }
    setIsProcessing(false); // Re-enable button
  };

  // Function to fetch and calculate the results for this vote
  const fetchResults = async () => {
     // Don't refetch if already fetching
    if (isFetchingResults) return;

    // Allow fetching only if vote is finished
    if (vote.status !== 'finished') {
      alert("Los resultados solo están disponibles cuando la votación ha finalizado.");
      return;
    }

    setIsFetchingResults(true);
    setShowResults(true); // Show the results area (will display loader initially)
    setResultsData(null); // Clear previous results to show loading state

    console.log(`[VoteCard ${vote.id}] Fetching results...`);

    try {
      // 1. Fetch all judge submissions for this vote
      const { data: judgeSubmissions, error: judgeError } = await supabase
        .from('submissions_judge')
        .select('score') // Only need the score
        .eq('vote_id', vote.id);

      // 2. Fetch all normal submissions for this vote
      const { data: normalSubmissions, error: normalError } = await supabase
        .from('submissions_normal')
        .select('score') // Only need the score
        .eq('vote_id', vote.id);

      // Handle potential errors during fetching
      if (judgeError || normalError) {
        console.error("Error fetching submissions:", { judgeError, normalError });
        throw new Error('Error al obtener los envíos de votos.');
      }

      console.log(`[VoteCard ${vote.id}] Submissions fetched:`, { judgeSubmissions, normalSubmissions });


      // --- Calculate Results ---
      // Ensure data arrays are not null
      const validJudgeSubmissions = judgeSubmissions || [];
      const validNormalSubmissions = normalSubmissions || [];

      const judgeScores = validJudgeSubmissions.map(s => s.score);
      // Judge contribution = sum of their scores (max 10 each, total max 30)
      const judgeTotalPoints = judgeScores.reduce((sum, score) => sum + (score || 0), 0);

      let publicAvg = 0; // The average score given by the public (1-10)
      let publicPoints = 0; // Public contribution to the final score (max 10)
      if (validNormalSubmissions.length > 0) {
        const publicSum = validNormalSubmissions.reduce((sum, s) => sum + (s.score || 0), 0);
        publicAvg = (publicSum / validNormalSubmissions.length);
        // The average score (1-10) directly translates to the points contributed (max 10)
        publicPoints = publicAvg;
      }

      // Final score = Judge points (max 30) + Public points (max 10)
      const totalScore = judgeTotalPoints + publicPoints;

      // Store the calculated results
      setResultsData({
        judgeScores: judgeScores,     // Array [scoreJ1, scoreJ2, scoreJ3] (or fewer)
        publicAvg: publicAvg,
        publicPoints: publicPoints,
        judgeTotal: judgeTotalPoints,
        total: totalScore,
        error: null // Indicate success
      });
       console.log(`[VoteCard ${vote.id}] Results calculated:`, { judgeScores, publicAvg, publicPoints, judgeTotalPoints, totalScore });

    } catch (error) {
      console.error("Error fetching/calculating results:", error);
      // Set an error state in resultsData to display an error message in ResultsDisplay
      setResultsData({ error: "No se pudieron cargar o calcular los resultados." });
    } finally {
      setIsFetchingResults(false); // Finish fetching state
    }
  };


  // Function to determine what to render in the action area
  const renderVoteAction = () => {
    // Vote hasn't started yet
    if (vote.status === 'pending') {
      return <span className={styles.statusBadge}>Próximamente</span>;
    }

    // Vote has finished
    if (vote.status === 'finished') {
      return (
        <div style={{ textAlign: 'center' }}>
          <span className={styles.statusBadge}>Finalizada</span>
          {/* Always show results button when finished */}
          <button
            onClick={fetchResults}
            disabled={isFetchingResults}
            className={styles.resultsButton}
          >
            {isFetchingResults ? 'Cargando...' : (showResults ? 'Actualizar' : 'Ver Resultados')}
          </button>
        </div>
      );
    }

    // Vote is currently active
    if (vote.status === 'active') {
      // Still determining user role
      if (isLoadingRole) {
        return <span className={styles.statusBadge}>Verificando rol...</span>;
      }
      // Error determining role
       if (userRole && userRole.type === 'error') {
           return <span className={styles.statusBadge} style={{backgroundColor: '#ef4444', color: 'white'}}>Error: No se puede votar</span>;
       }
      // User has already submitted their vote
      if (hasVoted) {
        return <span className={styles.statusBadge}>¡Voto Enviado!</span>;
      }
      // User hasn't voted yet, show the voting interface
      // Ensure userRole exists before rendering VotingInterface
      if (userRole && userRole.id) {
         return (
           <VotingInterface
             onSubmit={handleVoteSubmit}
             disabled={isProcessing} // Disable while submitting
             roleType={userRole.type} // Pass role type for display ('judge' or 'normal')
           />
         );
      } else {
          // Fallback if userRole is somehow invalid after loading
          return <span className={styles.statusBadge} style={{backgroundColor: '#f97316', color: 'white'}}>Error de Identificación</span>;
      }
    }

    // Fallback if status is unexpected
    console.warn(`[VoteCard ${vote.id}] Unexpected vote status: ${vote.status}`);
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