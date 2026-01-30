import React, { useState } from 'react';
import { Usuario } from '../types';
import { mockBackend } from '../services/mockBackend';
import { GlassCard, GlassInput, GlassButton } from '../components/GlassUI';

interface AuthPageProps {
  onLogin: (u: Usuario) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RECOVER'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [nome, setNome] = useState('');
  const [guerra, setGuerra] = useState('');
  const [numero, setNumero] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMsg('');

    try {
      if (mode === 'LOGIN') {
        const res = await mockBackend.login(email, senha);
        if (res.sucesso && res.dados) onLogin(res.dados);
        else setError(res.mensagem || 'Login ou senha errados');
      } 
      else if (mode === 'REGISTER') {
        if (numero.length !== 5 || isNaN(Number(numero))) {
          setError('O número deve conter exatamente 5 dígitos.');
          setLoading(false);
          return;
        }
        
        if (senha.length < 8) {
          setError('A senha precisa ter no mínimo 8 caracteres para sua segurança.');
          setLoading(false);
          return;
        }

        if (senha !== confirmarSenha) {
          setError('As senhas não coincidem. Por favor, verifique.');
          setLoading(false);
          return;
        }

        const res = await mockBackend.cadastrar({ 
          email, 
          senha, 
          nomeCompleto: nome, 
          nomeDeGuerra: guerra,
          numero 
        });
        if (res.sucesso && res.dados) onLogin(res.dados);
        else setError(res.mensagem || 'Erro ao cadastrar.');
      }
      else if (mode === 'RECOVER') {
        const res = await mockBackend.recuperarSenha(email);
        setMsg(res.mensagem || 'Verifique seu email.');
        if (res.sucesso) {
            setTimeout(() => setMode('LOGIN'), 3000);
        }
      }
    } catch (err) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Cantina da Divisão de ensino
          </h1>
          <p className="text-gray-500 font-medium mt-2">Diretoria de Cédula</p>
        </div>

        <GlassCard className="border-t-4 border-t-brand-500 shadow-xl">
          <div className="mb-6 flex justify-center border-b border-gray-100 pb-4">
             <h2 className="text-xl font-bold text-gray-800">
                {mode === 'LOGIN' ? 'ACESSO' : mode === 'REGISTER' ? 'Novo Cadastro' : 'Recuperar Senha'}
             </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'REGISTER' && (
              <>
                <GlassInput label="Nome Completo" value={nome} onChange={e => setNome(e.target.value)} required />
                <div className="flex gap-4">
                  <GlassInput className="flex-1" label="Nome Guerra" value={guerra} onChange={e => setGuerra(e.target.value)} required />
                  <GlassInput 
                    className="w-32" 
                    label="Nº Cadete" 
                    value={numero} 
                    onChange={e => setNumero(e.target.value)} 
                    placeholder="00000"
                    maxLength={5}
                    required 
                  />
                </div>
              </>
            )}
            
            <GlassInput 
              label="Email" 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="seu.email@exemplo.com"
              required 
            />
            
            {mode !== 'RECOVER' && (
              <div>
                <GlassInput 
                  label="Senha" 
                  type="password" 
                  value={senha} 
                  onChange={e => setSenha(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
                
                {mode === 'REGISTER' && (
                  <>
                    <p className={`text-xs ml-1 -mt-2 mb-4 font-bold transition-colors flex items-center gap-1 ${
                      senha.length > 0 && senha.length < 8 ? 'text-brand-600' : 'text-gray-400'
                    }`}>
                      {senha.length > 0 && senha.length < 8 ? (
                        <>⚠️ Mínimo de 8 caracteres (atual: {senha.length})</>
                      ) : (
                        <>* Mínimo de 8 caracteres</>
                      )}
                    </p>

                    <GlassInput 
                      label="Confirmar Senha" 
                      type="password" 
                      value={confirmarSenha} 
                      onChange={e => setConfirmarSenha(e.target.value)} 
                      placeholder="Repita sua senha"
                      required 
                    />
                  </>
                )}
              </div>
            )}

            {error && <div className="text-red-600 bg-red-50 p-3 rounded-xl text-sm font-bold text-center border border-red-100 animate-fade-in">{error}</div>}
            {msg && <div className="text-emerald-600 bg-emerald-50 p-3 rounded-xl text-sm font-bold text-center border border-emerald-100 animate-fade-in">{msg}</div>}

            <GlassButton type="submit" disabled={loading} className="mt-4">
              {loading ? 'Processando...' : mode === 'LOGIN' ? 'ENTRAR' : mode === 'REGISTER' ? 'CRIAR CONTA' : 'ENVIAR LINK'}
            </GlassButton>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col gap-3 text-center">
            {mode === 'LOGIN' ? (
              <>
                <button onClick={() => setMode('REGISTER')} className="text-brand-600 font-bold hover:underline">Não tem conta? Cadastre-se</button>
                <button onClick={() => setMode('RECOVER')} className="text-gray-400 text-sm hover:text-gray-600">Esqueci minha senha</button>
              </>
            ) : (
              <button onClick={() => setMode('LOGIN')} className="text-gray-500 font-bold hover:text-gray-800">Voltar para Login</button>
            )}
          </div>
        </GlassCard>
        
        <p className="text-center text-gray-400 text-xs mt-8">© 2025 V.1.0 - Desenvolvido por Cad Felipe</p>
        <p className="text-center text-gray-400 text-xs mt-2">Powered by Google Ai Studio</p>
      </div>
    </div>
  );
};
