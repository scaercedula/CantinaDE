/**
 * Serviço Unificado de Chat em Tempo Real com E2EE e Fallback Inteligente
 * - Conecta ao PocketBase (coleção 'mensagens_chat') com subscrição SSE e pooling resiliente
 * - Criptografa na saída e descriptografa na entrada (Web Crypto AES-GCM 256-bit)
 * - Emite notificações sonoras e de navegador
 * - Sincronização multi-aba via BroadcastChannel e fallback LocalStorage
 */

import { Usuario, PerfilUsuario, MensagemChatCifrada, MensagemChatDecifrada, ConversaPreview, PedidoVinculadoChat } from '../types';
import { loginAPI } from './loginAPI';
import { encryptPayload, decryptPayload } from './cryptoChat';
import { playMessageSound, showSystemNotification } from './soundNotification';

const LOCAL_STORAGE_KEY = 'cantina_chat_messages_v1';
const BROADCAST_CHANNEL_NAME = 'cantina_chat_sync_channel';

type MessageListener = (msg: MensagemChatDecifrada) => void;
type UnreadChangeListener = () => void;

class ChatService {
  private broadcastChannel: BroadcastChannel | null = null;
  private canalListeners: Map<string, Set<MessageListener>> = new Map();
  private globalListeners: Set<MessageListener> = new Set();
  private unreadListeners: Set<UnreadChangeListener> = new Set();
  private isSubscribedPb = false;
  private processedIds: Set<string> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = async (event) => {
          if (event.data?.type === 'NOVA_MENSAGEM') {
            await this.processarMensagemRecebida(event.data.payload);
          } else if (event.data?.type === 'MENSAGENS_LIDAS') {
            this.notificarMudancaNaoLidas();
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel não pôde ser iniciado:', e);
      }
    }

    // Tenta iniciar a subscrição SSE no PocketBase quando houver autenticação
    if (typeof window !== 'undefined') {
      setTimeout(() => this.iniciarInscricaoPocketBase(), 1000);
    }
  }

  /**
   * Identificador do canal entre o cadete e a cantina
   */
  getCanalId(cadeteId: string): string {
    return `chat_${cadeteId}`;
  }

  /**
   * Inicia a subscrição SSE do PocketBase para tempo real
   */
  async iniciarInscricaoPocketBase() {
    try {
      const pb = loginAPI.getPb();
      if (!pb.authStore.isValid) {
        return;
      }
      if (this.isSubscribedPb) {
        return;
      }

      await pb.collection('mensagens_chat').subscribe('*', async (e) => {
        if (e.action === 'create' || e.action === 'update') {
          const rec = e.record;
          if (e.action === 'create' && this.processedIds.has(rec.id)) {
            return;
          }
          this.processedIds.add(rec.id);

          const rawRecord: MensagemChatCifrada = {
            id: rec.id,
            canalId: rec.canalId,
            remetenteId: rec.remetenteId,
            remetenteNome: rec.remetenteNome,
            remetentePerfil: rec.remetentePerfil,
            destinatarioId: rec.destinatarioId,
            ciphertext: rec.ciphertext,
            iv: rec.iv,
            salt: rec.salt,
            lida: !!rec.lida,
            pedidoVinculado: rec.pedidoVinculado || undefined,
            created: rec.created
          };
          await this.processarMensagemRecebida(rawRecord);
        }
      });
      this.isSubscribedPb = true;
    } catch (err) {
      console.warn('PocketBase SSE subscription retry:', err);
    }
  }

  /**
   * Processa uma mensagem cifrada recebida (via SSE ou BroadcastChannel)
   */
  private async processarMensagemRecebida(cifrada: MensagemChatCifrada) {
    const usuarioAtual = loginAPI.getUsuarioAtual();
    const decifrada = await this.decifrarMensagem(cifrada, usuarioAtual?.id, usuarioAtual?.perfil);

    // Notifica canal específico
    const canalSet = this.canalListeners.get(cifrada.canalId);
    if (canalSet) {
      canalSet.forEach(cb => cb(decifrada));
    }

    // Notifica listeners globais
    this.globalListeners.forEach(cb => cb(decifrada));

    // Notifica contadores de não lidas
    this.notificarMudancaNaoLidas();

    // Toca som e exibe notificação caso o usuário atual seja o destinatário
    if (usuarioAtual) {
      const souDestinatario = usuarioAtual.perfil === PerfilUsuario.CANTINA
        ? cifrada.destinatarioId === 'cantina'
        : cifrada.destinatarioId === usuarioAtual.id;

      if (souDestinatario && cifrada.remetenteId !== usuarioAtual.id) {
        playMessageSound();
        showSystemNotification(
          `Mensagem de ${decifrada.remetenteNome}`,
          decifrada.texto.slice(0, 80)
        );
      }
    }
  }

  /**
   * Decifra uma mensagem usando o Web Crypto API
   */
  async decifrarMensagem(
    cifrada: MensagemChatCifrada, 
    currentUserId?: string, 
    currentUserPerfil?: PerfilUsuario | string
  ): Promise<MensagemChatDecifrada> {
    const texto = await decryptPayload(cifrada.ciphertext, cifrada.iv, cifrada.salt, cifrada.canalId);
    
    let isMinha = false;
    if (currentUserPerfil === PerfilUsuario.CANTINA) {
      isMinha = cifrada.remetentePerfil === PerfilUsuario.CANTINA || cifrada.remetenteId === 'cantina' || cifrada.remetenteId === currentUserId;
    } else if (currentUserPerfil === PerfilUsuario.CADETE) {
      isMinha = cifrada.remetentePerfil === PerfilUsuario.CADETE && (cifrada.remetenteId === currentUserId || !currentUserId);
    } else {
      isMinha = !!currentUserId && cifrada.remetenteId === currentUserId;
    }

    return {
      id: cifrada.id || `local_${Date.now()}_${Math.random()}`,
      canalId: cifrada.canalId,
      remetenteId: cifrada.remetenteId,
      remetenteNome: cifrada.remetenteNome,
      remetentePerfil: cifrada.remetentePerfil,
      destinatarioId: cifrada.destinatarioId,
      texto,
      lida: cifrada.lida,
      timestamp: cifrada.created || new Date().toISOString(),
      isMinha,
      pedidoVinculado: cifrada.pedidoVinculado
    };
  }

  /**
   * Carrega histórico bruto do LocalStorage
   */
  private getLocalMessages(): MensagemChatCifrada[] {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Salva mensagem no LocalStorage
   */
  private saveLocalMessage(msg: MensagemChatCifrada): MensagemChatCifrada {
    const messages = this.getLocalMessages();
    const nova: MensagemChatCifrada = {
      ...msg,
      id: msg.id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created: msg.created || new Date().toISOString()
    };
    messages.push(nova);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('Erro ao gravar no localStorage:', e);
    }
    return nova;
  }

  /**
   * Envia uma nova mensagem com criptografia E2EE
   */
  async enviarMensagem(
    remetente: Usuario,
    cadeteId: string,
    texto: string,
    pedidoVinculado?: PedidoVinculadoChat
  ): Promise<MensagemChatDecifrada> {
    const canalId = this.getCanalId(cadeteId);
    const isCadete = remetente.perfil === PerfilUsuario.CADETE;
    const destinatarioId = isCadete ? 'cantina' : cadeteId;
    const remetenteNome = isCadete
      ? (remetente.nomeDeGuerra || remetente.nomeCompleto)
      : 'Cantina da DE';

    // 1. Criptografa o conteúdo via AES-GCM (Web Crypto API)
    const { ciphertext, iv, salt } = await encryptPayload(texto.trim(), canalId);

    const payloadCifrado: MensagemChatCifrada = {
      canalId,
      remetenteId: remetente.id,
      remetenteNome,
      remetentePerfil: remetente.perfil,
      destinatarioId,
      ciphertext,
      iv,
      salt,
      lida: false,
      pedidoVinculado: pedidoVinculado || undefined,
      created: new Date().toISOString()
    };

    let savedMsg: MensagemChatCifrada = payloadCifrado;

    // 2. Tenta enviar para o PocketBase
    const pb = loginAPI.getPb();
    if (pb.authStore.isValid) {
      this.iniciarInscricaoPocketBase();
      try {
        const record = await pb.collection('mensagens_chat').create({
          canalId: payloadCifrado.canalId,
          remetenteId: payloadCifrado.remetenteId,
          remetenteNome: payloadCifrado.remetenteNome,
          remetentePerfil: payloadCifrado.remetentePerfil,
          destinatarioId: payloadCifrado.destinatarioId,
          ciphertext: payloadCifrado.ciphertext,
          iv: payloadCifrado.iv,
          salt: payloadCifrado.salt,
          lida: false,
          pedidoVinculado: payloadCifrado.pedidoVinculado || null
        });
        savedMsg = {
          ...payloadCifrado,
          id: record.id,
          created: record.created
        };
        this.processedIds.add(record.id);
      } catch (e) {
        console.warn('Erro ao salvar no PocketBase, usando fallback local:', e);
        savedMsg = this.saveLocalMessage(payloadCifrado);
      }
    } else {
      savedMsg = this.saveLocalMessage(payloadCifrado);
    }

    // 3. Sincroniza via BroadcastChannel para outras abas locais
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'NOVA_MENSAGEM',
        payload: savedMsg
      });
    }

    // 4. Notifica listeners na aba atual
    const decifrada = await this.decifrarMensagem(savedMsg, remetente.id, remetente.perfil);
    const canalSet = this.canalListeners.get(canalId);
    if (canalSet) {
      canalSet.forEach(cb => cb(decifrada));
    }
    this.globalListeners.forEach(cb => cb(decifrada));
    this.notificarMudancaNaoLidas();

    return decifrada;
  }

  /**
   * Busca mensagens decifradas de um canal específico
   */
  async buscarMensagens(cadeteId: string, usuarioAtual?: Usuario): Promise<MensagemChatDecifrada[]> {
    const canalId = this.getCanalId(cadeteId);
    let mensagensCifradas: MensagemChatCifrada[] = [];
    const pb = loginAPI.getPb();

    if (pb.authStore.isValid) {
      this.iniciarInscricaoPocketBase();
      try {
        const records = await pb.collection('mensagens_chat').getFullList({
          filter: `canalId = "${canalId}"`,
          sort: 'created'
        });
        mensagensCifradas = records.map((r: any) => ({
          id: r.id,
          canalId: r.canalId,
          remetenteId: r.remetenteId,
          remetenteNome: r.remetenteNome,
          remetentePerfil: r.remetentePerfil,
          destinatarioId: r.destinatarioId,
          ciphertext: r.ciphertext,
          iv: r.iv,
          salt: r.salt,
          lida: !!r.lida,
          pedidoVinculado: r.pedidoVinculado || undefined,
          created: r.created
        }));
      } catch (err) {
        console.warn('Falha ao consultar PocketBase, recorrendo ao localStorage:', err);
        mensagensCifradas = this.getLocalMessages().filter(m => m.canalId === canalId);
      }
    } else {
      mensagensCifradas = this.getLocalMessages().filter(m => m.canalId === canalId);
    }

    // Mescla com locais caso alguma mensagem offline ainda não esteja sincronizada
    const local = this.getLocalMessages().filter(m => m.canalId === canalId);
    for (const loc of local) {
      if (loc.id && !mensagensCifradas.some(m => m.id === loc.id)) {
        mensagensCifradas.push(loc);
      }
    }

    // Decifra todas em paralelo
    const decifradas = await Promise.all(
      mensagensCifradas.map(m => this.decifrarMensagem(m, usuarioAtual?.id, usuarioAtual?.perfil))
    );

    return decifradas.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Marca as mensagens destinadas ao usuário atual como lidas
   */
  async marcarComoLidas(cadeteId: string, usuarioAtual: Usuario): Promise<void> {
    const canalId = this.getCanalId(cadeteId);
    const isCadete = usuarioAtual.perfil === PerfilUsuario.CADETE;
    const pb = loginAPI.getPb();

    if (pb.authStore.isValid) {
      try {
        const destinatarioFiltro = isCadete ? `destinatarioId = "${usuarioAtual.id}"` : `destinatarioId = "cantina"`;
        const unreadRecords = await pb.collection('mensagens_chat').getFullList({
          filter: `canalId = "${canalId}" && ${destinatarioFiltro} && lida = false`
        });
        for (const rec of unreadRecords) {
          await pb.collection('mensagens_chat').update(rec.id, { lida: true });
        }
      } catch (e) {
        // Ignora erros não críticos
      }
    }

    // Atualiza também no LocalStorage
    const local = this.getLocalMessages();
    let updated = false;
    local.forEach(m => {
      if (m.canalId === canalId && !m.lida) {
        const souDestinatario = isCadete ? m.destinatarioId === usuarioAtual.id : m.destinatarioId === 'cantina';
        if (souDestinatario) {
          m.lida = true;
          updated = true;
        }
      }
    });
    if (updated) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));
      } catch {
        // Fallback
      }
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'MENSAGENS_LIDAS', canalId });
    }
    this.notificarMudancaNaoLidas();
  }

  /**
   * Retorna a contagem de mensagens não lidas para um cadete
   */
  async getQtdNaoLidasCadete(cadeteId: string): Promise<number> {
    const canalId = this.getCanalId(cadeteId);
    const pb = loginAPI.getPb();
    if (pb.authStore.isValid) {
      try {
        const records = await pb.collection('mensagens_chat').getList(1, 100, {
          filter: `canalId = "${canalId}" && destinatarioId = "${cadeteId}" && lida = false`
        });
        return records.totalItems;
      } catch {
        // Fallback local
      }
    }
    return this.getLocalMessages().filter(m => m.canalId === canalId && m.destinatarioId === cadeteId && !m.lida).length;
  }

  /**
   * Retorna a contagem total de mensagens não lidas para a Cantina
   */
  async getQtdNaoLidasCantina(): Promise<number> {
    const pb = loginAPI.getPb();
    if (pb.authStore.isValid) {
      try {
        const records = await pb.collection('mensagens_chat').getList(1, 200, {
          filter: `destinatarioId = "cantina" && lida = false`
        });
        return records.totalItems;
      } catch {
        // Fallback local
      }
    }
    return this.getLocalMessages().filter(m => m.destinatarioId === 'cantina' && !m.lida).length;
  }

  /**
   * Carrega a lista de conversas de todos os cadetes para a caixa de entrada da Cantina
   */
  async getConversasCantina(cadetes: Usuario[]): Promise<ConversaPreview[]> {
    let allMessages: MensagemChatCifrada[] = [];
    const pb = loginAPI.getPb();

    if (pb.authStore.isValid) {
      this.iniciarInscricaoPocketBase();
      try {
        const records = await pb.collection('mensagens_chat').getFullList({
          sort: '-created'
        });
        allMessages = records.map((r: any) => ({
          id: r.id,
          canalId: r.canalId,
          remetenteId: r.remetenteId,
          remetenteNome: r.remetenteNome,
          remetentePerfil: r.remetentePerfil,
          destinatarioId: r.destinatarioId,
          ciphertext: r.ciphertext,
          iv: r.iv,
          salt: r.salt,
          lida: !!r.lida,
          pedidoVinculado: r.pedidoVinculado || undefined,
          created: r.created
        }));
      } catch {
        allMessages = this.getLocalMessages();
      }
    } else {
      allMessages = this.getLocalMessages();
    }

    // Agrupa mensagens por canalId
    const messagesByCanal = new Map<string, MensagemChatCifrada[]>();
    for (const msg of allMessages) {
      if (!messagesByCanal.has(msg.canalId)) {
        messagesByCanal.set(msg.canalId, []);
      }
      messagesByCanal.get(msg.canalId)!.push(msg);
    }

    const cadeteMap = new Map<string, Usuario>();
    cadetes.forEach(c => cadeteMap.set(c.id, c));

    // Descobre cadetes a partir de mensagens existentes
    messagesByCanal.forEach((msgs, canalId) => {
      const cadeteId = canalId.replace(/^chat_/, '');
      if (!cadeteMap.has(cadeteId)) {
        const cadeteMsg = msgs.find(m => m.remetentePerfil === PerfilUsuario.CADETE);
        cadeteMap.set(cadeteId, {
          id: cadeteId,
          nomeCompleto: cadeteMsg ? cadeteMsg.remetenteNome : `Cadete ${cadeteId.slice(-4)}`,
          nomeDeGuerra: cadeteMsg ? cadeteMsg.remetenteNome : `Cadete`,
          numero: '',
          email: '',
          perfil: PerfilUsuario.CADETE
        });
      }
    });

    const conversas: ConversaPreview[] = [];

    for (const [cadeteId, cadete] of cadeteMap.entries()) {
      const canalId = this.getCanalId(cadeteId);
      const msgsDoCanal = messagesByCanal.get(canalId) || [];
      const naoLidas = msgsDoCanal.filter(m => m.destinatarioId === 'cantina' && !m.lida).length;

      let ultimaMensagem: MensagemChatDecifrada | undefined = undefined;
      let atualizadoEm = '1970-01-01T00:00:00.000Z';

      if (msgsDoCanal.length > 0) {
        const rawUltima = msgsDoCanal[0];
        atualizadoEm = rawUltima.created || atualizadoEm;
        ultimaMensagem = await this.decifrarMensagem(rawUltima, 'cantina', PerfilUsuario.CANTINA);
      }

      conversas.push({
        cadete,
        canalId,
        ultimaMensagem,
        naoLidas,
        atualizadoEm
      });
    }

    // Ordena: primeiro conversas ativas com mensagens recentes, depois ordem alfabética
    return conversas.sort((a, b) => {
      const timeA = new Date(a.atualizadoEm).getTime();
      const timeB = new Date(b.atualizadoEm).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return a.cadete.nomeDeGuerra.localeCompare(b.cadete.nomeDeGuerra);
    });
  }

  /**
   * Subscrição em tempo real para um canal específico (ex: conversa aberta)
   */
  subscreverCanal(cadeteId: string, callback: MessageListener): () => void {
    const canalId = this.getCanalId(cadeteId);
    if (!this.canalListeners.has(canalId)) {
      this.canalListeners.set(canalId, new Set());
    }
    this.canalListeners.get(canalId)!.add(callback);

    return () => {
      const set = this.canalListeners.get(canalId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.canalListeners.delete(canalId);
        }
      }
    };
  }

  /**
   * Subscrição global para novas mensagens (notificações, toasts)
   */
  subscreverNotificacoesGlobais(callback: MessageListener): () => void {
    this.globalListeners.add(callback);
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * Subscrição de alterações nas contagens de mensagens não lidas
   */
  subscreverMudancaNaoLidas(callback: UnreadChangeListener): () => void {
    this.unreadListeners.add(callback);
    return () => {
      this.unreadListeners.delete(callback);
    };
  }

  private notificarMudancaNaoLidas() {
    this.unreadListeners.forEach(cb => cb());
  }
}

export const chatService = new ChatService();
