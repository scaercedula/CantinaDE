import React, { useState, useEffect } from 'react';
import { Usuario, PerfilUsuario } from './types';
import { mockBackend } from './services/mockBackend';
import { Icons } from './components/Icons';
import { AuthPage } from './pages/AuthPage';
import { CadetePage } from './pages/CadetePage';
import { CantinaPage } from './pages/CantinaPage';
import { DiretoriaPage } from './pages/DiretoriaPage';

const App: React.FC = () => {
  const [user, setUser] = useState<Usuario | null>(null);

  useEffect(() => {
    const saved = mockBackend.getUsuarioAtual();
    if (saved) setUser(saved);
  }, []);

  const handleLogout = () => {
    mockBackend.logout();
    setUser(null);
  };

  if (!user) {
    return <AuthPage onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen pb-24 md:pb-12 bg-gray-50 text-gray-900 font-sans">
      <nav className="sticky top-0 z-40 w-full bg-white shadow-sm border-b border-gray-100 mb-8">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold leading-none text-gray-900">{user.nomeDeGuerra}</h1>
              <span className="text-[10px] uppercase tracking-wider font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                {user.perfil}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-600 hover:text-red-500">
            <Icons.Logout />
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 md:px-6 animate-fade-in">
        {user.perfil === PerfilUsuario.CADETE && <CadetePage usuario={user} />}
        {user.perfil === PerfilUsuario.CANTINA && <CantinaPage />}
        {user.perfil === PerfilUsuario.DIRETORIA && <DiretoriaPage />}
      </main>
    </div>
  );
};

export default App;
