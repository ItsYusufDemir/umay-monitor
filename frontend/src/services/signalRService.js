// src/services/signalRService.js
import * as signalR from '@microsoft/signalr';

/**
 * Multi-hub SignalR service supporting three separate hubs:
 * - MonitoringHub: Server-specific metrics (requires subscription)
 * - NotificationHub: Backup/command notifications (broadcast)
 * - AlertHub: Alert notifications (broadcast)
 */
class SignalRService {
  /** @type {signalR.HubConnection | null} */
  monitoringConnection = null;
  /** @type {signalR.HubConnection | null} */
  notificationConnection = null;
  /** @type {signalR.HubConnection | null} */
  alertConnection = null;

  /** @type {string | null} */
  monitoringConnectionId = null;
  
  /** @type {Promise<void> | null} */
  _monitoringConnectingPromise = null;
  /** @type {Promise<void> | null} */
  _notificationConnectingPromise = null;
  /** @type {Promise<void> | null} */
  _alertConnectingPromise = null;

  _getBaseUrl() {
    return process.env.REACT_APP_API_BASE_URL || 'https://localhost:7287';
  }

  _hubUrl(hubName) {
    return `${this._getBaseUrl()}/${hubName}`;
  }

  _hubUrl(hubName) {
    return `${this._getBaseUrl()}/${hubName}`;
  }

  /**
   * Create a SignalR connection for a specific hub
   * @param {string} hubName - 'monitoring-hub', 'notification-hub', or 'alert-hub'
   * @param {string} jwtToken
   * @param {boolean} needsConnectionId - Whether this hub needs a connectionId (for subscription)
   * @returns {signalR.HubConnection}
   */
  _createConnection(hubName, jwtToken, needsConnectionId = false) {
    const config = {
      accessTokenFactory: () => jwtToken,
      transport: signalR.HttpTransportType.WebSockets
    };
    
    // Only skip negotiation for hubs that don't need connectionId
    if (!needsConnectionId) {
      config.skipNegotiation = true;
    }
    
    return new signalR.HubConnectionBuilder()
      .withUrl(this._hubUrl(hubName), config)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();
  }

  /**
   * Connect to MonitoringHub (server-specific metrics)
   * @param {string} jwtToken
   */
  async connectMonitoring(jwtToken) {
    if (!jwtToken) throw new Error('Missing JWT token for SignalR');

    // Already connected
    if (this.monitoringConnection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    // De-dupe concurrent connection attempts
    if (this._monitoringConnectingPromise) {
      await this._monitoringConnectingPromise;
      return;
    }

    // Clean up any old connection instance
    if (this.monitoringConnection) {
      try {
        this.monitoringConnection.off('MetricsUpdated');
        this.monitoringConnection.off('WatchlistMetricsUpdated');
        await this.monitoringConnection.stop();
      } catch {
        // ignore
      } finally {
        this.monitoringConnection = null;
        this.monitoringConnectionId = null;
      }
    }

    this.monitoringConnection = this._createConnection('monitoring-hub', jwtToken, true); // needs connectionId

    this.monitoringConnection.onreconnecting((err) => {
      console.warn('MonitoringHub reconnecting:', err);
      this.monitoringConnectionId = null;
    });

    this.monitoringConnection.onreconnected((cid) => {
      const next = cid || this.monitoringConnection?.connectionId || null;
      this.monitoringConnectionId = next;
      console.log('MonitoringHub reconnected. ConnectionId:', next);
    });

    this.monitoringConnection.onclose((err) => {
      console.warn('MonitoringHub closed:', err);
      this.monitoringConnectionId = null;
    });

    this._monitoringConnectingPromise = (async () => {
      try {
        await this.monitoringConnection.start();
        this.monitoringConnectionId = this.monitoringConnection.connectionId || null;
        console.log('✅ MonitoringHub connected. ConnectionId:', this.monitoringConnectionId);
      } finally {
        this._monitoringConnectingPromise = null;
      }
    })();

    await this._monitoringConnectingPromise;
  }

  /**
   * Connect to NotificationHub (backup/command notifications)
   * @param {string} jwtToken
   */
  async connectNotification(jwtToken) {
    if (!jwtToken) throw new Error('Missing JWT token for SignalR');

    if (this.notificationConnection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    if (this._notificationConnectingPromise) {
      await this._notificationConnectingPromise;
      return;
    }

    if (this.notificationConnection) {
      try {
        this.notificationConnection.off('BackupCompleted');
        this.notificationConnection.off('IntegrityCheckCompleted');
        this.notificationConnection.off('CommandSuccess');
        this.notificationConnection.off('CommandFailed');
        await this.notificationConnection.stop();
      } catch {
        // ignore
      } finally {
        this.notificationConnection = null;
      }
    }

    this.notificationConnection = this._createConnection('notification-hub', jwtToken, false); // no connectionId needed

    this.notificationConnection.onreconnecting((err) => {
      console.warn('NotificationHub reconnecting:', err);
    });

    this.notificationConnection.onreconnected(() => {
      console.log('NotificationHub reconnected');
    });

    this.notificationConnection.onclose((err) => {
      console.warn('NotificationHub closed:', err);
    });

    this._notificationConnectingPromise = (async () => {
      try {
        await this.notificationConnection.start();
        console.log('✅ NotificationHub connected');
      } finally {
        this._notificationConnectingPromise = null;
      }
    })();

    await this._notificationConnectingPromise;
  }

  /**
   * Connect to AlertHub (alert notifications)
   * @param {string} jwtToken
   */
  async connectAlert(jwtToken) {
    if (!jwtToken) throw new Error('Missing JWT token for SignalR');

    if (this.alertConnection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    if (this._alertConnectingPromise) {
      await this._alertConnectingPromise;
      return;
    }

    if (this.alertConnection) {
      try {
        this.alertConnection.off('AlertTriggered');
        this.alertConnection.off('ServiceRestartAttempted');
        await this.alertConnection.stop();
      } catch {
        // ignore
      } finally {
        this.alertConnection = null;
      }
    }

    this.alertConnection = this._createConnection('alert-hub', jwtToken, false); // no connectionId needed

    this.alertConnection.onreconnecting((err) => {
      console.warn('AlertHub reconnecting:', err);
    });

    this.alertConnection.onreconnected(() => {
      console.log('AlertHub reconnected');
    });

    this.alertConnection.onclose((err) => {
      console.warn('AlertHub closed:', err);
    });

    this._alertConnectingPromise = (async () => {
      try {
        await this.alertConnection.start();
        console.log('✅ AlertHub connected');
      } finally {
        this._alertConnectingPromise = null;
      }
    })();

    await this._alertConnectingPromise;
  }

  /**
   * Connect to all hubs
   * @param {string} jwtToken
   */
  async connect(jwtToken) {
    await Promise.all([
      this.connectMonitoring(jwtToken),
      this.connectNotification(jwtToken),
      this.connectAlert(jwtToken)
    ]);
  }

  async disconnectMonitoring() {
    if (!this.monitoringConnection) return;
    try {
      this.monitoringConnection.off('MetricsUpdated');
      this.monitoringConnection.off('WatchlistMetricsUpdated');
      await this.monitoringConnection.stop();
    } finally {
      this.monitoringConnection = null;
      this.monitoringConnectionId = null;
      this._monitoringConnectingPromise = null;
      console.log('MonitoringHub disconnected');
    }
  }

  async disconnectNotification() {
    if (!this.notificationConnection) return;
    try {
      this.notificationConnection.off('BackupCompleted');
      this.notificationConnection.off('IntegrityCheckCompleted');
      this.notificationConnection.off('CommandSuccess');
      this.notificationConnection.off('CommandFailed');
      await this.notificationConnection.stop();
    } finally {
      this.notificationConnection = null;
      this._notificationConnectingPromise = null;
      console.log('NotificationHub disconnected');
    }
  }

  async disconnectAlert() {
    if (!this.alertConnection) return;
    try {
      this.alertConnection.off('AlertTriggered');
      this.alertConnection.off('ServiceRestartAttempted');
      await this.alertConnection.stop();
    } finally {
      this.alertConnection = null;
      this._alertConnectingPromise = null;
      console.log('AlertHub disconnected');
    }
  }

  async disconnect() {
    await Promise.all([
      this.disconnectMonitoring(),
      this.disconnectNotification(),
      this.disconnectAlert()
    ]);
  }

  isConnected() {
    return this.monitoringConnection?.state === signalR.HubConnectionState.Connected ||
           this.notificationConnection?.state === signalR.HubConnectionState.Connected ||
           this.alertConnection?.state === signalR.HubConnectionState.Connected;
  }

  isMonitoringConnected() {
    return this.monitoringConnection?.state === signalR.HubConnectionState.Connected;
  }

  isNotificationConnected() {
    return this.notificationConnection?.state === signalR.HubConnectionState.Connected;
  }

  isAlertConnected() {
    return this.alertConnection?.state === signalR.HubConnectionState.Connected;
  }

  getMonitoringConnectionId() {
    return this.monitoringConnection?.connectionId || this.monitoringConnectionId || null;
  }

  getConnectionId() {
    // Backward compatibility - return monitoring connection ID
    return this.getMonitoringConnectionId();
  }

  getState() {
    return this.monitoringConnection?.state || null;
  }

  /** @private */
  _ensureMonitoringConnected() {
    if (!this.monitoringConnection) throw new Error('MonitoringHub not connected');
  }

  /** @private */
  _ensureNotificationConnected() {
    if (!this.notificationConnection) throw new Error('NotificationHub not connected');
  }

  /** @private */
  _ensureAlertConnected() {
    if (!this.alertConnection) throw new Error('AlertHub not connected');
  }

  // MonitoringHub events
  onMetricsUpdated(callback) {
    this._ensureMonitoringConnected();
    this.monitoringConnection.on('MetricsUpdated', callback);
  }
  offMetricsUpdated() {
    if (this.monitoringConnection) this.monitoringConnection.off('MetricsUpdated');
  }

  onWatchlistMetricsUpdated(callback) {
    this._ensureMonitoringConnected();
    this.monitoringConnection.on('WatchlistMetricsUpdated', callback);
  }
  offWatchlistMetricsUpdated() {
    if (this.monitoringConnection) this.monitoringConnection.off('WatchlistMetricsUpdated');
  }

  // NotificationHub events
  onBackupCompleted(callback) {
    this._ensureNotificationConnected();
    this.notificationConnection.on('BackupCompleted', callback);
  }
  offBackupCompleted() {
    if (this.notificationConnection) this.notificationConnection.off('BackupCompleted');
  }

  onIntegrityCheckCompleted(callback) {
    this._ensureNotificationConnected();
    this.notificationConnection.on('IntegrityCheckCompleted', callback);
  }
  offIntegrityCheckCompleted() {
    if (this.notificationConnection) this.notificationConnection.off('IntegrityCheckCompleted');
  }

  onCommandSuccess(callback) {
    this._ensureNotificationConnected();
    this.notificationConnection.on('CommandSuccess', callback);
  }
  offCommandSuccess() {
    if (this.notificationConnection) this.notificationConnection.off('CommandSuccess');
  }

  onCommandFailed(callback) {
    this._ensureNotificationConnected();
    this.notificationConnection.on('CommandFailed', callback);
  }
  offCommandFailed() {
    if (this.notificationConnection) this.notificationConnection.off('CommandFailed');
  }

  // AlertHub events
  onAlertTriggered(callback) {
    this._ensureAlertConnected();
    this.alertConnection.on('AlertTriggered', callback);
  }
  offAlertTriggered() {
    if (this.alertConnection) this.alertConnection.off('AlertTriggered');
  }

  onServiceRestartAttempted(callback) {
    this._ensureAlertConnected();
    this.alertConnection.on('ServiceRestartAttempted', callback);
  }
  offServiceRestartAttempted() {
    if (this.alertConnection) this.alertConnection.off('ServiceRestartAttempted');
  }
}

export default new SignalRService();
