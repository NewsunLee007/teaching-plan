import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './lib/store';
import { Layout } from './components/Layout';
import { UnitPlanner } from './pages/UnitPlanner';
import { LessonPlanner } from './pages/LessonPlanner';
import { DetailedDesigner } from './pages/DetailedDesigner';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<UnitPlanner />} />
            <Route path="lesson-planner" element={<LessonPlanner />} />
            <Route path="design" element={<DetailedDesigner />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
