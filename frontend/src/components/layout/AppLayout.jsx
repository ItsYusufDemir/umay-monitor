// src/components/layout/AppLayout.jsx
import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import signalRService from '../../services/signalRService';
import api from '../../api/axiosConfig';
import alertSound from '../mixkit-classic-alarm-995.wav';
import sirenSound from '../siren-alert-96052.mp3';
import levelUpSound from '../level-up-191997.mp3';
import logo from '../logo.png';

// Use window object to ensure global access
if (!window.currentAlertAudio) {
  window.currentAlertAudio = null;
}

export const stopAlertSound = () => {
  if (window.currentAlertAudio) {
    try {
      const audio = window.currentAlertAudio;
      window.currentAlertAudio = null;
      audio.pause();
      audio.currentTime = 0;
    } catch (err) {
      // ignore
    }
  }
};

// Play success/level-up sound once
const playSuccessSound = () => {
  try {
    const audio = new Audio(levelUpSound);
    audio.volume = 0.5;
    // Clean up audio element after it finishes playing
    audio.onended = () => {
      audio.src = '';
      audio.onended = null;
    };
    audio.play().catch(() => {
      audio.src = '';
    });
  } catch (err) {
    // ignore
  }
};

// Play alert sound a fixed number of times
const playAlertForUnread = (isCritical) => {
  // Stop any existing sound first
  stopAlertSound();
  
  try {
    // Use siren for critical, regular alert for warning
    const soundFile = isCritical ? sirenSound : alertSound;
    const audio = new Audio(soundFile);
    audio.volume = isCritical ? 0.8 : 0.5;
    audio.loop = false;
    window.currentAlertAudio = audio;
    
    let playCount = 0;
    const maxPlays = 3;
    
    audio.onended = () => {
      playCount++;
      if (playCount < maxPlays && window.currentAlertAudio === audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        // Clean up
        if (window.currentAlertAudio === audio) {
          window.currentAlertAudio = null;
        }
        audio.src = '';
        audio.onended = null;
      }
    };
    
    audio.play().catch(() => {
      // Silently ignore - audio was likely blocked by browser autoplay policy
      window.currentAlertAudio = null;
      audio.src = '';
    });
  } catch (err) {
    // ignore
  }
};

const AppLayout = () => {
  const { user, logout, token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const hasCheckedUnread = useRef(false);
  const pendingAlertSound = useRef(null);

  // Check for unread notifications on mount
  useEffect(() => {
    if (!token || hasCheckedUnread.current) return;

    const checkUnreadNotifications = async () => {
      try {
        console.log('Checking for unread notifications...');
        const res = await api.get('/api/alerts', {
          params: { pageSize: 100 }
        });
        
        const alerts = Array.isArray(res.data) ? res.data : [];
        console.log('Total alerts:', alerts.length);
        
        const unreadAlerts = alerts.filter(a => !a.isAcknowledged);
        console.log('Unread alerts:', unreadAlerts.length);
        
        if (unreadAlerts.length > 0) {
          const hasCritical = unreadAlerts.some(a => String(a.severity || '').toLowerCase() === 'critical');
          console.log('Has critical unread:', hasCritical);
          pendingAlertSound.current = hasCritical;
          console.log('Set pending alert sound, will play on user interaction');
        } else {
          console.log('No unread alerts');
        }
        
        hasCheckedUnread.current = true;
      } catch (err) {
        console.warn('Failed to check unread notifications:', err);
      }
    };

    checkUnreadNotifications();
  }, [token]);

  // Play sound on first user interaction if there are pending unread alerts
  useEffect(() => {
    const playOnInteraction = () => {
      if (pendingAlertSound.current !== null) {
        console.log('User interacted, playing sound for unread alerts');
        playAlertForUnread(pendingAlertSound.current);
        pendingAlertSound.current = null; // Clear pending
      }
    };

    document.addEventListener('click', playOnInteraction);
    document.addEventListener('keydown', playOnInteraction);

    return () => {
      document.removeEventListener('click', playOnInteraction);
      document.removeEventListener('keydown', playOnInteraction);
    };
  }, []);

  // Global alert sound listener (AlertHub)
  useEffect(() => {
    if (!token) return;

    let mounted = true;

    const setupAlertHub = async () => {
      try {
        // Connect to AlertHub if not connected
        if (!signalRService.isAlertConnected()) {
          await signalRService.connectAlert(token);
        }
        if (!mounted) return;

        // AlertTriggered event
        signalRService.offAlertTriggered();
        signalRService.onAlertTriggered((evt) => {
          if (!mounted) return;

          // Play sound based on severity
          const severityLower = String(evt.severity || '').toLowerCase();
          if (severityLower === 'critical' || severityLower === 'warning') {
            const isCritical = severityLower === 'critical';
            playAlertForUnread(isCritical);
          } else {
            // Info alerts get level-up sound
            playSuccessSound();
          }

          // Show visual toast notification based on alert type
          const serverName = evt.serverName || `Server ${evt.serverId || ''}`;
          const severity = evt.severity || 'Info';
          
          // Use the message from the event, or build one based on type
          let message = evt.message;
          if (!message) {
            const alertType = evt.type || '';
            if (alertType === 'MetricThreshold') {
              message = `${evt.metricName}: ${evt.metricValue} ${evt.operator} ${evt.threshold}`;
            } else if (alertType === 'ServiceOffline') {
              message = `Service ${evt.serviceName} is offline`;
            } else if (alertType === 'ProcessOffline') {
              message = `Process ${evt.processName} is offline`;
            } else if (alertType === 'ServiceRecovered') {
              message = `Service ${evt.serviceName} recovered`;
            } else if (alertType === 'ProcessRecovered') {
              message = `Process ${evt.processName} recovered`;
            } else {
              message = 'Alert triggered';
            }
          }
          
          toast.alert(`🖥️ ${serverName}: ${message}`, severity);
        });

        // ServiceRestartAttempted event
        signalRService.offServiceRestartAttempted();
        signalRService.onServiceRestartAttempted((evt) => {
          if (!mounted) return;
          console.log('🔄 Service restart attempted:', evt);
          
          // Play info sound for service restart attempts
          playSuccessSound();
          
          const serverName = evt.serverName || `Server ${evt.serverId || ''}`;
          const serviceName = evt.serviceName || 'Unknown service';
          const attempt = evt.attemptNumber || 1;
          const maxAttempts = evt.maxAttempts || '?';
          toast.info(`🔄 ${serverName}: Restarting ${serviceName} (${attempt}/${maxAttempts})`);
        });
      } catch (err) {
        console.error('Failed to setup AlertHub:', err);
      }
    };

    setupAlertHub();

    return () => {
      mounted = false;
      // Don't stop alert sound on cleanup - it should persist until user acknowledges
      signalRService.offAlertTriggered();
      signalRService.offServiceRestartAttempted();
    };
  }, [token, toast]);

  // Global notification listener (NotificationHub)
  useEffect(() => {
    if (!token) return;

    let mounted = true;

    const setupNotificationHub = async () => {
      try {
        // Connect to NotificationHub if not connected
        if (!signalRService.isNotificationConnected()) {
          await signalRService.connectNotification(token);
        }
        if (!mounted) return;

        // BackupCompleted event
        signalRService.offBackupCompleted();
        signalRService.onBackupCompleted((evt) => {
          if (!mounted) return;
          // Fields from docs: serverId, jobId, taskId, status, message, snapshotId, filesNew, dataAdded, durationSeconds, errorMessage, timestamp
          const status = String(evt.status || '').toLowerCase();
          
          if (status === 'success') {
            // Play success sound
            playSuccessSound();
            // Use backend message if available, otherwise build our own
            if (evt.message) {
              toast.success(evt.message);
            } else {
              const snapshotInfo = evt.snapshotId ? ` (${evt.snapshotId})` : '';
              const filesInfo = evt.filesNew != null ? `, ${evt.filesNew} new files` : '';
              toast.success(`Backup completed${snapshotInfo}${filesInfo}`);
            }
          } else {
            const errorMsg = evt.errorMessage || evt.message || 'Backup failed';
            toast.error(errorMsg);
          }
        });

        // IntegrityCheckCompleted event
        signalRService.offIntegrityCheckCompleted();
        signalRService.onIntegrityCheckCompleted((evt) => {
          if (!mounted) return;
          // Fields from docs: serverId, jobId, taskId, status, message, errorMessage, timestamp
          const status = String(evt.status || '').toLowerCase();
          
          if (status === 'success') {
            // Play success sound
            playSuccessSound();
            const msg = evt.message || 'Integrity check passed';
            toast.success(msg);
          } else {
            const errorMsg = evt.errorMessage || evt.message || 'Integrity check failed';
            toast.warning(errorMsg);
          }
        });

        // CommandFailed event
        signalRService.offCommandFailed();
        signalRService.onCommandFailed((evt) => {
          if (!mounted) return;
          // Fields from docs: serverId, action, messageId, message, retryCount, timestamp
          const message = evt.message || 'Command failed';
          const retryInfo = evt.retryCount > 0 ? ` (retry ${evt.retryCount})` : '';
          toast.error(`${message}${retryInfo}`);
        });
      } catch (err) {
        console.error('Failed to setup NotificationHub:', err);
      }
    };

    setupNotificationHub();

    return () => {
      mounted = false;
      signalRService.offBackupCompleted();
      signalRService.offIntegrityCheckCompleted();
      signalRService.offCommandFailed();
    };
  }, [token, toast]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img 
            src={logo} 
            alt="Umay Monitor" 
            style={{ 
              width: '50px', 
              height: '50px', 
              objectFit: 'contain', 
              marginLeft: '30px',
              transform: 'scale(3)'
            }} 
          />
        </div>

        <nav className="app-nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/server-info">Server Info</NavLink>
          <NavLink to="/services">Services</NavLink>
          <NavLink to="/processes">Processes</NavLink>          <NavLink to="/agents">Agents</NavLink>

          <NavLink to="/notifications">Notifications</NavLink>
          <NavLink to="/alert-rules">Alert Rules</NavLink>

          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <div className="app-user">
          <span>{user?.fullName}</span>
          <button type="button" className="btn btn-danger" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
