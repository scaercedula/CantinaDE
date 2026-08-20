import React, { useState, useEffect } from 'react';
import { Usuario, PerfilUsuario } from './types';
import { loginAPI } from './services/loginAPI';
import { Icons } from './components/Icons';
import { AuthPage } from './pages/AuthPage';
import { CadetePage } from './pages/CadetePage';
import { CantinaPage } from './pages/CantinaPage';
import { DiretoriaPage } from './pages/DiretoriaPage';

const App: React.FC = () => {
  const [user, setUser] = useState<Usuario | null>(null);

  useEffect(() => {
    const saved = loginAPI.getUsuarioAtual();
    if (saved) setUser(saved);
  }, []);

  const handleLogout = () => {
    loginAPI.logout();
    setUser(null);
  };

  if (!user) {
    return <AuthPage onLogin={setUser} />;
  }

  const numeroStr = String(user.numero || '').trim();
  const isBloqueado = user.perfil === PerfilUsuario.CADETE && (numeroStr.startsWith('24') || numeroStr.startsWith('25'));

  if (isBloqueado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100 font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center animate-slide-up">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Restrito</h2>
          <p className="text-gray-600 mb-6 font-medium">
            O sistema está temporariamente bloqueado para o seu esquadrão.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            <Icons.Logout />
            Sair
          </button>
        </div>
      </div>
    );
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
