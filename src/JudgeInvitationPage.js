// src/JudgeInvitationPage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import styles from './AuthPage.module.css'; // Reutilizamos los estilos de la página de login

export default function JudgeInvitationPage() {
  const { token } = useParams(); // Obtiene el token de la URL
  const navigate = useNavigate();
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [message, setMessage] = useState('Verificando invitación...');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setMessage('Token de invitación inválido.');
        setIsLoading(false);
        return;
      }

      // Buscamos al juez por su token y traemos el nombre de la universidad del admin
      const { data, error } = await supabase
        .from('judges')
        .select(`
          name,
          status,
          profiles ( university_name )
        `)
        .eq('invite_token', token)
        .single();

      if (error || !data) {
        setMessage('Invitación no encontrada o inválida.');
      } else if (data.status === 'claimed') {
        setMessage(`Ya has aceptado la invitación para ser juez en los eventos de ${data.profiles.university_name}.`);
      } else {
        setJudgeInfo(data);
        setMessage(`Has sido invitado como juez para los eventos de ${data.profiles.university_name}.`);
      }
      setIsLoading(false);
    };

    verifyToken();
  }, [token]);

  const handleAcceptInvitation = async () => {
    setIsLoading(true);
    const deviceVoterId = crypto.randomUUID(); // ID anónimo para votos normales
    
    // Actualizamos el estado del juez a 'claimed' y guardamos su ID de dispositivo
    const { error } = await supabase
      .from('judges')
      .update({ status: 'claimed', device_voter_id: deviceVoterId })
      .eq('invite_token', token);

    if (error) {
      setMessage('Ocurrió un error al aceptar la invitación. Inténtalo de nuevo.');
    } else {
      // Guardamos la identidad del juez y su ID anónimo en el localStorage
      localStorage.setItem('judge_token', token);
      localStorage.setItem('voterId', deviceVoterId);
      
      setMessage('¡Gracias! Tu acceso como juez ha sido activado. Ya puedes cerrar esta ventana.');
      setJudgeInfo(null); // Ocultamos el botón para que no se pueda presionar de nuevo
    }
    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Invitación de Juez</h1>
        <p className={styles.subtitle} style={{ padding: '1rem', background: '#2d3748', borderRadius: '8px' }}>
          {message}
        </p>
        
        {judgeInfo && (
          <button onClick={handleAcceptInvitation} className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Procesando...' : 'Aceptar Invitación'}
          </button>
        )}
      </div>
    </div>
  );
}