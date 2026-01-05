// src/App.jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ServicesPage from './pages/ServicesPage';
import ProcessesPage from './pages/ProcessesPage';
import ServerInfoPage from './pages/ServerInfoPage';

import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import AlertRulesPage from './pages/AlertRulesPage';
import AgentsPage from './pages/AgentsPage';

import { AuthProvider } from './context/AuthContext';
import { MonitoringProvider } from './context/MonitoringContext';
import { ToastProvider } from './context/ToastContext';

import ProtectedRoute from './components/common/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Toast from './components/common/Toast';

import './styles.css';

const App = () => {
  return (
    <AuthProvider>
      <MonitoringProvider>
        <ToastProvider>
          <Toast />
          <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />

              {/* existing */}
              <Route path="/server-info" element={<ServerInfoPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/processes" element={<ProcessesPage />} />

              {/* monitoring */}{/* alerts */}
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/alert-rules" element={<AlertRulesPage />} />

              {/* settings */}
              <Route path="/settings" element={<SettingsPage />} />

              {/* agent management (NEW v2.1) */}
              <Route path="/agents" element={<AgentsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<LoginPage />} />
        </Routes>
        </ToastProvider>
      </MonitoringProvider>
    </AuthProvider>
  );
};

export default App;
