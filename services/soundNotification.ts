/**
 * Serviço de Notificações Sonoras e do Navegador para o Chat
 * Sons sintetizados em tempo real via Web Audio API (zero dependências de arquivos de áudio)
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('Web Audio API não suportada ou bloqueada pelo navegador:', e);
    return null;
  }
}

/**
 * Toca um som suave e moderno de mensagem recebida (dois tons harmônicos)
 */
export function playMessageSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Primeiro tom (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Segundo tom (A5 - 880 Hz) com ligeiro delay para efeito "chime"
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.32);
  } catch (e) {
    console.warn('Erro ao reproduzir som de notificação:', e);
  }
}

/**
 * Solicita permissão para notificações do navegador
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

/**
 * Exibe notificação de sistema se a janela estiver minimizada ou em segundo plano
 */
export function showSystemNotification(titulo: string, corpo: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Exibe apenas se a aba não estiver visível para não incomodar
  if (document.hidden) {
    try {
      new Notification(titulo, {
        body: corpo,
        icon: '/favicon.ico'
      });
    } catch (e) {
      console.warn('Erro ao exibir notificação do navegador:', e);
    }
  }
}
