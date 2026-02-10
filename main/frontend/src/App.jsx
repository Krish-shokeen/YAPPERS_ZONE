import { Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import DashboardPage from './components/DashboardPage';
import ProfileDashboard from './components/ProfileDashboard';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfileDashboard />} />
    </Routes>
  );
}

export default App;
