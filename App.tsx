import React, { useState, useEffect } from 'react';
import { Usuario, PerfilUsuario } from './types';
import { loginAPI } from './services/loginAPI';
import { Icons } from './components/Icons';
import { AuthPage } from './pages/AuthPage';
import { CadetePage } from './pages/CadetePage';
import { CantinaPage } from './pages/CantinaPage';
import { DiretoriaPage } from './pages/DiretoriaPage';
import { ChatToastNotification } from './components/ChatToastNotification';
import { AdBanner } from './components/AdBanner';

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

  // O perfil CANTINA é 100% livre de anúncios. Cadete e Diretoria visualizam os espaços de anúncios.
  const canShowAds = user.perfil !== PerfilUsuario.CANTINA;
  const isCadete23 = user.perfil === PerfilUsuario.CADETE && numeroStr.startsWith('23');

  return (
    <div className="min-h-screen pb-24 md:pb-12 bg-gray-50 text-gray-900 font-sans">
      <nav className="sticky top-0 z-40 w-full bg-white shadow-sm border-b border-gray-100 mb-6">
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

      {/* Anúncio Superior (não exibido para perfil Cantina) */}
      {canShowAds && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-6">
          <AdBanner format="horizontal" minHeight="min-h-[90px]" />
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 md:px-6 animate-fade-in">
        {user.perfil === PerfilUsuario.CADETE && <CadetePage usuario={user} />}
        {user.perfil === PerfilUsuario.CANTINA && <CantinaPage />}
        {user.perfil === PerfilUsuario.DIRETORIA && <DiretoriaPage />}
      </main>

      {/* Anúncio Rodapé (não exibido para perfil Cantina) */}
      {canShowAds && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 mt-8 mb-6">
          <AdBanner format="horizontal" minHeight="min-h-[90px]" />
        </div>
      )}

      {/* Notificações flutuantes em tempo real do Chat (desativadas para cadetes 23) */}
      {!isCadete23 && <ChatToastNotification usuarioAtual={user} />}
    </div>
  );
};

export default App;
