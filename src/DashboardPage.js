// src/DashboardPage.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import styles from './DashboardPage.module.css';
import Modal from './Modal';
import DropdownMenu from './DropdownMenu';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [votes, setVotes] = useState([]);
  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);

  // States for Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // States for Menu and Forms
  const [openMenuId, setOpenMenuId] = useState(null); // ID of the event whose menu is open
  const [activeModalTab, setActiveModalTab] = useState('createVote');
  const [voteTitle, setVoteTitle] = useState('');
  const [studentPresenter, setStudentPresenter] = useState('');
  const [voteDuration, setVoteDuration] = useState(60);
  const [selectedJudges, setSelectedJudges] = useState([]);
  const [judgeName, setJudgeName] = useState('');

  // Fetch initial data (user, events)
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }
      setUser(session.user);

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('created_by', session.user.id)
        .order('created_at', { ascending: false });

      if (eventsError) console.error('Error fetching events:', eventsError);
      else setEvents(eventsData || []); // Ensure it's an array

      setLoading(false);
    };
    fetchInitialData();
  }, [navigate]);

  // Handle renaming an event
  const handleRenameEvent = async (eventId, currentName) => {
    setOpenMenuId(null); // Close menu
    const newName = prompt('Ingresa el nuevo nombre para la sala:', currentName);
    if (newName && newName !== currentName) {
      const { data, error } = await supabase
        .from('events')
        .update({ name: newName })
        .eq('id', eventId)
        .select()
        .single();

      if (error) {
        alert('Error al renombrar la sala.');
      } else {
        setEvents(events.map(e => (e.id === eventId ? data : e)));
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(data); // Update selected event if it was the one renamed
        }
      }
    }
  };

  // Handle opening the share modal
  const handleShareEvent = (event) => {
    setOpenMenuId(null); // Close menu
    setSelectedEvent(event); // Set the event to generate QR/link for
    setIsShareModalOpen(true);
  };

  // Handle deleting an event
  const handleDeleteEvent = async (eventId) => {
    setOpenMenuId(null); // Close menu
    if (window.confirm('¿Estás seguro de que quieres eliminar esta sala? Todas sus votaciones se borrarán.')) {
      // Note: Supabase cascade delete should handle related votes/assignments
      const { error } = await supabase.from('events').delete().eq('id', eventId);

      if (error) {
        alert('Error al eliminar la sala.');
        console.error("Delete Error:", error);
      } else {
        setEvents(events.filter(e => e.id !== eventId));
        if (selectedEvent?.id === eventId) {
          setSelectedEvent(null); // Deselect if it was the active room
          setVotes([]);
        }
      }
    }
  };

  // Handle selecting an event from the sidebar
  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    setLoading(true); // Show loading while fetching related data
    // Load votes for the selected event
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true }); // Order votes by creation time

    if(votesError) console.error("Error fetching votes:", votesError);
    setVotes(votesData || []);

    // Load judges associated with the admin (needed for the 'create vote' form)
    if(user){ // Ensure user state is set
        const { data: judgesData, error: judgesError } = await supabase
            .from('judges')
            .select('*')
            .eq('admin_id', user.id); // Only load judges created by this admin

        if(judgesError) console.error("Error fetching judges:", judgesError);
        setJudges(judgesData || []);
    }
    setLoading(false);
  };

  // Handle submitting the 'Create Vote' form
  const handleCreateVote = async (e) => {
    e.preventDefault();
    if (!selectedEvent) {
        alert("Selecciona una sala primero.");
        return;
    }
    if (selectedJudges.length !== 3) {
      alert('Debes seleccionar exactamente 3 jueces.');
      return;
    }

    // 1. Create the vote record
    const { data: voteData, error: voteError } = await supabase
      .from('votes')
      .insert({
        title: voteTitle,
        student_presenter: studentPresenter,
        duration_seconds: voteDuration,
        event_id: selectedEvent.id, // Link to the currently selected event
        status: 'pending', // Initial status
      })
      .select()
      .single();

    if (voteError) {
      alert('Error al crear la votación.');
      console.error('Create Vote Error:', voteError);
      return;
    }

    // 2. Create the judge assignment records
    const assignments = selectedJudges.map(judgeId => ({
      vote_id: voteData.id,
      judge_id: judgeId,
    }));

    const { error: assignmentError } = await supabase
      .from('vote_assignments')
      .insert(assignments);

    if (assignmentError) {
      // Attempt to delete the vote if assignments failed? Or just notify?
      alert('Error al asignar los jueces a la votación.');
      console.error('Assignment Error:', assignmentError);
      // Maybe delete the created vote: await supabase.from('votes').delete().eq('id', voteData.id);
    } else {
      alert('¡Votación creada con éxito!');
      setVotes(prevVotes => [voteData, ...prevVotes]); // Add to the beginning of the list
      setIsModalOpen(false); // Close the modal
      // Reset form fields
      setVoteTitle('');
      setStudentPresenter('');
      setVoteDuration(60);
      setSelectedJudges([]);
    }
  };

  // Handle submitting the 'Invite Judge' form
  const handleInviteJudge = async (e) => {
    e.preventDefault();
    if (!user) return; // Should not happen if logged in

    const inviteToken = crypto.randomUUID(); // Secure random token

    const { data, error } = await supabase
      .from('judges')
      .insert({
        name: judgeName,
        admin_id: user.id, // Link judge to the current admin
        invite_token: inviteToken,
        status: 'pending', // Initial status
      })
      .select()
      .single();

    if (error) {
      alert('Error al invitar al juez.');
      console.error('Invite Judge Error:', error);
    } else {
      const inviteLink = `${window.location.origin}/invitacion/${inviteToken}`;
      // Use prompt to easily copy the link
      prompt('Copia este link y envíalo al juez:', inviteLink);
      setJudges(prevJudges => [...prevJudges, data]); // Add new judge to the list
      setJudgeName(''); // Clear the input field
    }
  };

  // Handle editing a judge's name
  const handleEditJudge = async (judgeId, currentName) => {
    const newName = prompt('Edita el nombre del juez:', currentName);
    if (newName && newName.trim() && newName !== currentName) {
      const { data, error } = await supabase
        .from('judges')
        .update({ name: newName.trim() })
        .eq('id', judgeId)
        .select()
        .single();

      if (error) {
        alert('Error al actualizar el juez.');
        console.error('Edit Judge Error:', error);
      } else {
        // Update the judge's name in the local state
        setJudges(judges.map(j => (j.id === judgeId ? data : j)));
      }
    }
  };

  // Handle deleting a judge
  const handleDeleteJudge = async (judgeId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar a este juez? Si está asignado a votaciones, podría causar problemas.')) {
      // Note: Check Supabase policies/triggers if judge deletion should be restricted
      const { error } = await supabase.from('judges').delete().eq('id', judgeId);

      if (error) {
        alert('Error al eliminar el juez.');
        console.error('Delete Judge Error:', error);
      } else {
        // Remove the judge from the local state list
        setJudges(judges.filter(j => j.id !== judgeId));
        // Also remove from selectedJudges if present
        setSelectedJudges(prev => prev.filter(id => id !== judgeId));
      }
    }
  };

  // Handle checkbox changes for selecting judges in the 'Create Vote' form
  const handleJudgeSelection = (judgeId) => {
    setSelectedJudges(prevSelected => {
      if (prevSelected.includes(judgeId)) {
        // Deselect
        return prevSelected.filter(id => id !== judgeId);
      } else if (prevSelected.length < 3) {
        // Select if less than 3 are selected
        return [...prevSelected, judgeId];
      }
      // Do nothing if already 3 selected and trying to select another
      return prevSelected;
    });
  };

  // Handle user logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth'); // Redirect to login page after logout
  };

  // Handle creating a new event (room)
  const handleCreateEvent = async () => {
    const eventName = prompt('Ingresa el nombre de la nueva sala de votación:');
    if (eventName && eventName.trim() && user) {
      const { data, error } = await supabase
        .from('events')
        .insert({ name: eventName.trim(), created_by: user.id })
        .select()
        .single(); // Assuming insert returns the created row

      if (error) {
          console.error("Create Event Error:", error);
          alert("Error al crear la sala.");
      } else if (data) {
          setEvents(prevEvents => [data, ...prevEvents]); // Add to the start of the list
      }
    }
  };

  // Activate a specific vote
  const handleActivateVote = async (voteId, duration) => {
    // 1. Check if another vote is already active in THIS event
    const activeVoteInEvent = votes.find(v => v.event_id === selectedEvent?.id && v.status === 'active');
    if (activeVoteInEvent && activeVoteInEvent.id !== voteId) {
      alert('Ya hay otra votación activa en esta sala. Por favor, espera a que termine o finalízala manualmente.');
      return; // Prevent activating multiple votes in the same event
    }

    // 2. Update vote status to 'active' in the database
    const { data, error } = await supabase
      .from('votes')
      .update({ status: 'active' })
      .eq('id', voteId)
      .eq('status', 'pending') // Only activate if currently pending
      .select()
      .single();

    if (error) {
      alert('Error al activar la votación.');
      console.error("Activate Vote Error:", error);
      return;
    }

    if (data) {
      // 3. Update local state immediately
      setVotes(currentVotes =>
        currentVotes.map(vote => (vote.id === voteId ? data : vote))
      );

      // 4. Set a timer to automatically finish the vote
      console.log(`⏳ Vote ${voteId} activated. Will finish in ${duration} seconds.`);
      setTimeout(() => {
        handleFinishVote(voteId);
      }, duration * 1000); // Convert seconds to milliseconds
    } else {
        // Maybe the vote wasn't 'pending' anymore
        console.warn(`Vote ${voteId} could not be activated (maybe status was not 'pending'?)`);
    }
  };

  // Finish a specific vote (called by setTimeout or potentially manually)
  const handleFinishVote = async (voteId) => {
    console.log(`🏁 Attempting to finish vote ${voteId}`);
    const { data, error } = await supabase
      .from('votes')
      .update({ status: 'finished' })
      .eq('id', voteId)
      .eq('status', 'active') // IMPORTANT: Only finish if it's currently active
      .select()
      .single();

    if (error) {
      console.error('Error auto-finishing vote:', error);
      // Handle error (e.g., notify admin, retry?)
    } else if (data) {
      // Update local state if the update was successful
      console.log(`✅ Vote ${voteId} finished successfully.`);
      setVotes(currentVotes =>
        currentVotes.map(vote => (vote.id === voteId ? data : vote))
      );
    } else {
      // If data is null, it means the vote was likely already finished or wasn't active.
      console.log(`ℹ️ Vote ${voteId} was not 'active' when trying to finish.`);
    }
  };

  if (loading) return <div>Cargando panel...</div>;

  // --- JSX Rendering ---
  return (
    <div className={styles.dashboardContainer}>
      {/* Sidebar Navigation */}
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button onClick={handleCreateEvent} className={styles.newEventButton}>
            + Nueva Sala
          </button>
          {/* Potential search input could go here */}
        </div>

        {/* List of Events (Rooms) */}
        <ul className={styles.eventList}>
          {events.map(event => (
            <li
              key={event.id}
              className={styles.eventItem} // Combined styling for item hover
            >
              {/* Button to select the event */}
              <button
                onClick={() => handleSelectEvent(event)}
                className={`${styles.eventItemContent} ${selectedEvent?.id === event.id ? styles.active : ''}`}
              >
                {event.name}
              </button>
              {/* Options Button (3 dots) */}
              <button
                className={styles.optionsButton}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent event selection when clicking options
                  setOpenMenuId(openMenuId === event.id ? null : event.id);
                }}
              >
                ⋮
              </button>
              {/* Dropdown Menu */}
              {openMenuId === event.id && (
                <DropdownMenu>
                  <button onClick={() => handleRenameEvent(event.id, event.name)}>Renombrar</button>
                  <button onClick={() => handleShareEvent(event)}>Compartir</button>
                  <button onClick={() => handleDeleteEvent(event.id)} style={{ color: '#F87171' }}>Eliminar</button>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>

        {/* Sidebar Footer (Logout) */}
        <div className={styles.sidebarFooter}>
            <p style={{fontSize: '0.8rem', color: '#9CA3AF', textAlign: 'center', marginBottom: '0.5rem'}}>
                {user?.email}
            </p>
          <button onClick={handleLogout} className={styles.logoutButton}>
            Cerrar Sesión
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        {selectedEvent ? (
          <>
            <h2>{selectedEvent.name}</h2>
            {/* List of Votes within the selected event */}
            <ul className={styles.voteList}>
              {votes.length > 0 ? (
                votes.map(vote => (
                  <li key={vote.id} className={styles.voteItem}>
                    <h3>{vote.title}</h3>
                    <p>Presentado por: {vote.student_presenter || 'N/A'}</p>
                    <p>Estado: {vote.status}</p>
                    <p style={{fontSize: '0.8rem', color: 'gray'}}>Duración: {vote.duration_seconds}s</p>

                    {/* Activate Button - Only shown if vote is 'pending' */}
                    {vote.status === 'pending' && (
                      <button
                        onClick={() => handleActivateVote(vote.id, vote.duration_seconds)}
                        className={styles.activateButton}
                      >
                        ▶️ Activar Votación
                      </button>
                    )}
                     {/* OPTIONAL: Manual Finish Button - Only shown if vote is 'active' */}
                     {vote.status === 'active' && (
                        <button
                            onClick={() => handleFinishVote(vote.id)}
                            className={styles.finishButton} // Add style for this button
                        >
                            ⏹️ Finalizar Ahora
                        </button>
                    )}
                  </li>
                ))
              ) : (
                <p>No hay votaciones en esta sala. ¡Crea una!</p>
              )}
            </ul>
            {/* Floating Action Button to open the create/manage modal */}
            <button className={styles.fab} onClick={() => setIsModalOpen(true)}>+</button>
          </>
        ) : (
          // Placeholder when no event is selected
          <div className={styles.placeholder}>Selecciona o crea una sala para empezar</div>
        )}
      </main>

      {/* Modal for Creating Votes and Managing Judges */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setOpenMenuId(null); /* Close dropdown too */ }}>
        {/* Tabs inside the modal */}
        <div className={styles.modalTabs}>
          <button
            onClick={() => setActiveModalTab('createVote')}
            className={`${styles.modalTabButton} ${activeModalTab === 'createVote' ? styles.active : ''}`}
          >
            Crear Votación
          </button>
          <button
            onClick={() => setActiveModalTab('manageJudges')}
            className={`${styles.modalTabButton} ${activeModalTab === 'manageJudges' ? styles.active : ''}`}
          >
            Gestionar Jueces
          </button>
        </div>

        {/* Content for 'Create Vote' Tab */}
        {activeModalTab === 'createVote' && (
          <form onSubmit={handleCreateVote} className={styles.form}>
            <h3>Nueva Votación</h3>
            {/* Form Inputs */}
            <div className={styles.inputGroup}>
              <label>Título del Proyecto</label>
              <input type="text" value={voteTitle} onChange={e => setVoteTitle(e.target.value)} required />
            </div>
            <div className={styles.inputGroup}>
              <label>Estudiante que Presenta</label>
              <input type="text" value={studentPresenter} onChange={e => setStudentPresenter(e.target.value)} />
            </div>
            <div className={styles.inputGroup}>
              <label>Duración</label>
              <select value={voteDuration} onChange={e => setVoteDuration(Number(e.target.value))}>
                <option value={15}>15 segundos</option>
                <option value={30}>30 segundos</option>
                <option value={60}>1 minuto (Predeterminado)</option>
                <option value={180}>3 minutos</option>
              </select>
            </div>
            {/* Judge Selection Checkboxes */}
            <div className={styles.inputGroup}>
              <label>Asignar Jueces (Selecciona exactamente 3)</label>
              <div className={styles.judgeCheckboxGroup}>
                {judges.map(judge => (
                  <label key={judge.id}>
                    <input
                      type="checkbox"
                      checked={selectedJudges.includes(judge.id)}
                      onChange={() => handleJudgeSelection(judge.id)}
                      // Disable checkbox if 3 are already selected and this one isn't
                      disabled={selectedJudges.length >= 3 && !selectedJudges.includes(judge.id)}
                    />
                    {' '}{judge.name}
                  </label>
                ))}
                {judges.length === 0 && <p style={{fontSize: '0.8rem', color: 'gray'}}>Invita jueces en la otra pestaña.</p>}
              </div>
            </div>
            {/* Submit Button */}
            <button type="submit" className={styles.submitButton} disabled={selectedJudges.length !== 3}>
                Guardar Votación {selectedJudges.length !== 3 ? `(${selectedJudges.length}/3 jueces)`: ''}
            </button>
          </form>
        )}

        {/* Content for 'Manage Judges' Tab */}
        {activeModalTab === 'manageJudges' && (
          <div>
            {/* Invite Judge Form */}
            <form onSubmit={handleInviteJudge} className={styles.form}>
              <h3>Invitar Juez Nuevo</h3>
              <div className={styles.inputGroup}>
                <label>Nombre del Juez</label>
                <input type="text" value={judgeName} onChange={e => setJudgeName(e.target.value)} required />
              </div>
              <button type="submit" className={styles.submitButton}>Generar Link de Invitación</button>
            </form>
            <hr style={{borderColor: 'var(--border-color)', margin: '1.5rem 0'}}/>
            {/* List of Existing Judges */}
            <h4>Jueces Registrados</h4>
             <ul className={styles.judgeList}>
                {judges.map(j => (
                  <li key={j.id} className={styles.judgeListItem}>
                    <span>{j.name}</span>
                    <div className={styles.judgeActions}>
                      <button onClick={() => handleEditJudge(j.id, j.name)} title="Editar nombre">✏️</button>
                      <button onClick={() => handleDeleteJudge(j.id)} title="Eliminar juez">🗑️</button>
                    </div>
                  </li>
                ))}
                {judges.length === 0 && <p style={{fontSize: '0.8rem', color: 'gray', textAlign:'center'}}>No hay jueces registrados.</p>}
              </ul>
          </div>
        )}
      </Modal>

      {/* Modal for Sharing Event */}
      <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)}>
        {selectedEvent && (
          <div style={{ textAlign: 'center' }}>
            <h3>Compartir Sala: {selectedEvent.name}</h3>
            <p>Los participantes pueden escanear este código o usar el enlace.</p>
            {/* QR Code */}
            <div style={{ background: 'white', padding: '1rem', display: 'inline-block', margin: '1rem 0', borderRadius: '8px' }}>
              <QRCodeSVG value={`${window.location.origin}/sala/${selectedEvent.id}`} size={200} />
            </div>
            {/* Share Link */}
            <p>O comparte este enlace:</p>
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/sala/${selectedEvent.id}`}
              style={{ width: '100%', padding: '0.75rem', backgroundColor: 'var(--background-dark)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', textAlign: 'center' }}
              // Select text on click for easy copying
              onClick={(e) => e.target.select()}
            />
          </div>
        )}
      </Modal>

    </div>
  );
}