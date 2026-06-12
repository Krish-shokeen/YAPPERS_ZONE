import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ProfileDashboard from './components/ProfileDashboard';
import ChatPage from './components/canvas/ChatPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Dashboard redirects straight to the Cosmic Canvas */}
      <Route path="/dashboard" element={<Navigate to="/chat" replace />} />
      <Route path="/profile" element={<ProfileDashboard />} />
      {/* Chat — Cosmic Canvas */}
      <Route path="/chat/*" element={<ChatPage />} />
    </Routes>
  );
}

export default App;
