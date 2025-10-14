// src/DashboardPage.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardPage.module.css';
import Modal from './Modal';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [votes, setVotes] = useState([]);
  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados para el Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('createVote');
  
  // Estados para los formularios
  const [voteTitle, setVoteTitle] = useState('');
  const [studentPresenter, setStudentPresenter] = useState('');
  const [voteDuration, setVoteDuration] = useState(60);
  const [selectedJudges, setSelectedJudges] = useState([]);
  const [judgeName, setJudgeName] = useState('');

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
      else setEvents(eventsData);

      setLoading(false);
    };
    fetchInitialData();
  }, [navigate]);
  
  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    // Cargar votaciones
    const { data: votesData } = await supabase.from('votes').select('*').eq('event_id', event.id);
    setVotes(votesData || []);
    // Cargar jueces
    const { data: judgesData } = await supabase.from('judges').select('*').eq('admin_id', user.id);
    setJudges(judgesData || []);
  };

  const handleCreateVote = async (e) => {
    e.preventDefault();
    if (selectedJudges.length !== 3) {
      alert('Debes seleccionar exactamente 3 jueces.');
      return;
    }

    const { data: voteData, error: voteError } = await supabase
      .from('votes')
      .insert({
        title: voteTitle,
        student_presenter: studentPresenter,
        duration_seconds: voteDuration,
        event_id: selectedEvent.id,
      })
      .select()
      .single();

    if (voteError) {
      alert('Error al crear la votación.');
      console.error(voteError);
      return;
    }

    const assignments = selectedJudges.map(judgeId => ({
      vote_id: voteData.id,
      judge_id: judgeId,
    }));
    
    const { error: assignmentError } = await supabase.from('vote_assignments').insert(assignments);

    if (assignmentError) {
      alert('Error al asignar los jueces.');
    } else {
      alert('¡Votación creada con éxito!');
      setVotes([voteData, ...votes]);
      setIsModalOpen(false);
      // Limpiar formulario
      setVoteTitle('');
      setStudentPresenter('');
      setVoteDuration(60);
      setSelectedJudges([]);
    }
  };

  const handleInviteJudge = async (e) => {
    e.preventDefault();
    const inviteToken = crypto.randomUUID();
    
    const { data, error } = await supabase
      .from('judges')
      .insert({
        name: judgeName,
        admin_id: user.id,
        invite_token: inviteToken,
      })
      .select()
      .single();
      
    if (error) {
      alert('Error al invitar al juez.');
    } else {
      const inviteLink = `${window.location.origin}/invitacion/${inviteToken}`;
      prompt('Copia este link y envíalo al juez:', inviteLink);
      setJudges([...judges, data]);
      setJudgeName('');
    }
  };

const handleEditJudge = async (judgeId, currentName) => {
    const newName = prompt('Edita el nombre del juez:', currentName);
    if (newName && newName !== currentName) {
      const { data, error } = await supabase
        .from('judges')
        .update({ name: newName })
        .eq('id', judgeId)
        .select()
        .single();
      
      if (error) {
        alert('Error al actualizar el juez.');
      } else {
        // Actualizamos la lista de jueces en el estado local
        setJudges(judges.map(j => (j.id === judgeId ? data : j)));
      }
    }
};

const handleDeleteJudge = async (judgeId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar a este juez? Esta acción no se puede deshacer.')) {
      const { error } = await supabase.from('judges').delete().eq('id', judgeId);
      
      if (error) {
        alert('Error al eliminar el juez. Es posible que esté asignado a una votación.');
        console.error(error);
      } else {
        // Eliminamos al juez de la lista en el estado local
        setJudges(judges.filter(j => j.id !== judgeId));
      }
    }
};

  const handleJudgeSelection = (judgeId) => {
    setSelectedJudges(prev => {
      if (prev.includes(judgeId)) {
        return prev.filter(id => id !== judgeId);
      } else if (prev.length < 3) {
        return [...prev, judgeId];
      }
      return prev;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleCreateEvent = async () => {
    const eventName = prompt('Ingresa el nombre de la nueva sala de votación:');
    if (eventName && user) {
      const { data } = await supabase.from('events').insert({ name: eventName, created_by: user.id }).select();
      if (data) setEvents([data[0], ...events]);
    }
  };

  if (loading) return <div>Cargando panel...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button onClick={handleCreateEvent} className={styles.newEventButton}>
            Nueva Sala
          </button>
        </div>

        <ul className={styles.eventList}>
          {events.map(event => (
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
          <button onClick={handleLogout} className={styles.logoutButton}>
            Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className={styles.mainContent}>
        {selectedEvent ? (
          <>
            <h2>{selectedEvent.name}</h2>
            <ul className={styles.voteList}>
              {votes.length > 0 ? (
                votes.map(vote => (
                  <li key={vote.id} className={styles.voteItem}>
                    <h3>{vote.title}</h3>
                    <p>Presentado por: {vote.student_presenter || 'N/A'}</p>
                    <p>Estado: {vote.status}</p>
                  </li>
                ))
              ) : (
                <p>No hay votaciones en esta sala. ¡Crea una!</p>
              )}
            </ul>
            <button className={styles.fab} onClick={() => setIsModalOpen(true)}>+</button>
          </>
        ) : (
          <div className={styles.placeholder}>Selecciona o crea una sala para empezar</div>
        )}
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
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

        {activeModalTab === 'createVote' && (
          <form onSubmit={handleCreateVote} className={styles.form}>
            <h3>Nueva Votación</h3>
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
                <option value={60}>1 minuto</option>
                <option value={180}>3 minutos</option>
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>Asignar Jueces (Selecciona 3)</label>
              <div className={styles.judgeCheckboxGroup}>
                {judges.map(judge => (
                  <label key={judge.id}>
                    <input
                      type="checkbox"
                      checked={selectedJudges.includes(judge.id)}
                      onChange={() => handleJudgeSelection(judge.id)}
                      disabled={selectedJudges.length >= 3 && !selectedJudges.includes(judge.id)}
                    />
                    {' '}{judge.name}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className={styles.submitButton}>Guardar Votación</button>
          </form>
        )}

        {activeModalTab === 'manageJudges' && (
      <div>
        <form onSubmit={handleInviteJudge} className={styles.form}>
          <h3>Invitar Juez</h3>
          <div className={styles.inputGroup}>
            <label>Nombre del Juez</label>
            <input type="text" value={judgeName} onChange={e => setJudgeName(e.target.value)} required />
          </div>
          <button type="submit" className={styles.submitButton}>Generar Link de Invitación</button>
        </form>
        <hr style={{borderColor: 'var(--border-color)', margin: '1.5rem 0'}}/>
        <h4>Jueces en esta Sala</h4>
        <ul className={styles.judgeList}>
          {judges.map(j => (
            <li key={j.id} className={styles.judgeListItem}>
              <span>{j.name}</span>
              <div className={styles.judgeActions}>
                <button onClick={() => handleEditJudge(j.id, j.name)}>✏️ Editar</button>
                <button onClick={() => handleDeleteJudge(j.id)}>🗑️ Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}
      </Modal>
    </div>
  );
}