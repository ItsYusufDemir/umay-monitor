// src/components/common/Toast.jsx
import React, { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';

const ToastItem = ({ toast, onRemove }) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const duration = toast.duration || 5000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.duration]);

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: '#10b981',
          border: '#059669',
          icon: '✓',
        };
      case 'error':
        return {
          bg: '#ef4444',
          border: '#dc2626',
          icon: '✕',
        };
      case 'warning':
        return {
          bg: '#f59e0b',
          border: '#d97706',
          icon: '⚠️',
        };
      case 'critical':
        return {
          bg: '#dc2626',
          border: '#b91c1c',
          icon: '🚨',
        };
      case 'info':
      default:
        return {
          bg: '#3b82f6',
          border: '#2563eb',
          icon: 'ℹ',
        };
    }
  };

  const styles = getStyles();
  const isAlert = toast.type === 'warning' || toast.type === 'critical';

  return (
    <div
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 8,
        padding: isAlert ? '14px 18px' : '12px 16px',
        marginBottom: 10,
        color: '#fff',
        minWidth: isAlert ? 350 : 300,
        maxWidth: 450,
        boxShadow: isAlert 
          ? '0 6px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(239, 68, 68, 0.3)' 
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        position: 'relative',
        overflow: 'hidden',
        animation: isAlert ? 'slideInRight 0.3s ease-out, pulse 2s infinite' : 'slideInRight 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 'bold' }}>{styles.icon}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{toast.message}</span>
        <button
          onClick={() => onRemove(toast.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
            opacity: 0.7,
          }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          width: `${progress}%`,
          background: 'rgba(255, 255, 255, 0.6)',
          transition: 'width 0.05s linear',
        }}
      />
    </div>
  );
};

const Toast = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <>
      <style>
        {`
          @keyframes slideInRight {
            from {
              transform: translateX(400px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.85;
            }
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </>
  );
};

export default Toast;
