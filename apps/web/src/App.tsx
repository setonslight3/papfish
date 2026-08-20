import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { EngineProvider } from '@/engine/EngineProvider';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { RepertoireProvider } from '@/repertoire/RepertoireProvider';
import { AppShell } from '@/components/AppShell';
import { PapfishLoader } from '@/components/brand';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ExplorePage } from '@/pages/ExplorePage';
import { RepertoiresPage } from '@/pages/RepertoiresPage';
import { TrainPage } from '@/pages/TrainPage';
import { GamesPage } from '@/pages/GamesPage';
import { EndgamesPage } from '@/pages/EndgamesPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { SettingsPage } from '@/pages/SettingsPage';

function FullPageSpinner(): React.JSX.Element {
  return <PapfishLoader label="Casting off…" />;
}

/** Routes that require an account. */
function ProtectedArea(): React.JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <RepertoireProvider>
      <AppShell />
    </RepertoireProvider>
  );
}

function PublicOnly({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <SettingsProvider>
        <EngineProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
            <Route element={<ProtectedArea />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/repertoires" element={<RepertoiresPage />} />
              <Route path="/train" element={<TrainPage />} />
              <Route path="/games" element={<GamesPage />} />
              <Route path="/endgames" element={<EndgamesPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </EngineProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
