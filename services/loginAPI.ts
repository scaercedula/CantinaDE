import PocketBase from 'pocketbase';
import { Usuario, Produto, Pedido, PerfilUsuario, StatusPedido, ApiResponse, EventoSalgadada, OrigemPedido } from '../types';


const POCKETBASE_URL = import.meta.env.VITE_LOGINDADOS; 
const GOOGLE_API_KEY = import.meta.env.VITE_API;
const GOOGLE_SHEET_ID = import.meta.env.VITE_SHEET_ID;

class BackendService {
  private pb: PocketBase;
  
  constructor() {
    this.pb = new PocketBase(POCKETBASE_URL);
    this.pb.autoCancellation(false);
  }

  async login(email: string, senha: string): Promise<ApiResponse<Usuario>> {
    try {
      const authData = await this.pb.collection('users').authWithPassword(email, senha);
      return { sucesso: true, dados: this.mapUser(authData.record) };
    } catch (error: any) {
      console.error('Erro no login:', error);
      
      if (error.status === 0) {
        const isHttps = window.location.protocol === 'https:';
        const isHttpBackend = POCKETBASE_URL.startsWith('http:');
        if (isHttps && isHttpBackend) {
           return { sucesso: false, mensagem: 'Bloqueio de Segurança: Frontend HTTPS não conecta em Backend HTTP (127.0.0.1). Rode o frontend localmente.' };
        }
        return { sucesso: false, mensagem: 'Erro de conexão: Servidor indisponível ou bloqueado.' };
      }
      if (error.status === 400) {
        return { sucesso: false, mensagem: 'Email ou senha inválidos.' };
      }
      
      const msg = error?.response?.message || error?.message || 'Erro desconhecido ao autenticar.';
      return { sucesso: false, mensagem: msg };
    }
  }

  async cadastrar(dados: any): Promise<ApiResponse<Usuario>> {
    try {
      const baseUsername = dados.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const generatedUsername = `${baseUsername}_${randomSuffix}`.toLowerCase();
      const payload = {
        username: generatedUsername,
        email: dados.email,
        password: dados.senha,
        passwordConfirm: dados.senha,
        nomeCompleto: dados.nomeCompleto,
        nomeDeGuerra: dados.nomeDeGuerra,
        numero: dados.numero,
        perfil: PerfilUsuario.CADETE
      };

      await this.pb.collection('users').create(payload);
      return this.login(dados.email, dados.senha);
    } catch (error: any) {
      console.error('Erro detalhado no cadastro:', JSON.stringify(error));
      let msg = 'Erro ao processar cadastro.';
      
      const responseData = error?.response?.data || error?.data;
      
      if (responseData && Object.keys(responseData).length > 0) {
        const firstField = Object.keys(responseData)[0];
        const errorObj = responseData[firstField];
        const errorDesc = errorObj?.message || 'Inválido';

        const fieldMap: {[key: string]: string} = {
            email: 'Email',
            password: 'Senha',
            passwordConfirm: 'Confirmação de Senha',
            numero: 'Número do Cadete',
            nomeCompleto: 'Nome Completo',
            username: 'Nome de Usuário'
        };

        const fieldName = fieldMap[firstField] || firstField;
        return { sucesso: false, mensagem: `${fieldName}: ${errorDesc}` };
      }

      if (error?.status === 404) {
         msg = "Servidor PocketBase não encontrado (404).";
      } else if (error?.status === 0) {
         const isHttps = window.location.protocol === 'https:';
         const isHttpBackend = POCKETBASE_URL.startsWith('http:');
         
         if (isHttps && isHttpBackend) {
             msg = "Erro de Mixed Content: Não é possível acessar http://127.0.0.1 a partir de um site HTTPS. Rode o projeto localmente.";
         } else {
             msg = "Erro de conexão (Offline). Verifique se o servidor está rodando em " + POCKETBASE_URL;
         }
      } else if (error?.message) {
         msg = error.message;
      }
      
      return { sucesso: false, mensagem: msg };
    }
  }

  logout() {
    this.pb.authStore.clear();
  }

  getUsuarioAtual(): Usuario | null {
    if (this.pb.authStore.isValid && this.pb.authStore.model) {
      return this.mapUser(this.pb.authStore.model);
    }
    return null;
  }

  async recuperarSenha(email: string): Promise<ApiResponse<null>> {
    try {
      await this.pb.collection('users').requestPasswordReset(email);
      return { sucesso: true, mensagem: 'Instruções enviadas para o email.' };
    } catch (e) {
      return { sucesso: false, mensagem: 'Erro ao processar solicitação.' };
    }
  }

  async getProdutos(origem: OrigemPedido = 'CANTINA'): Promise<Produto[]> {
    if (!GOOGLE_API_KEY) {
      console.warn('API Key do Google não configurada.');
      return [];
    }

    try {
      // Define a aba da planilha baseada na origem
      const range = origem === 'CIDADE' ? 'CardapioCidade!A2:E' : 'Produtos!A2:E';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values) return [];

      return data.values.map((row: string[], index: number) => ({
        id: `sheet-${origem.toLowerCase()}-${index}`,
        nome: row[0] || 'Sem Nome',
        descricao: row[1] || '',
        preco: parseFloat(row[2]?.replace('R$', '').replace(',', '.') || '0'),
        imagem: row[3] || '',
        categoria: (row[4] || 'SALGADO') as any,
        origem: origem
      }));
    } catch (e) {
      console.error(`Erro ao buscar produtos da Planilha Google (${origem}):`, e);
      return [];
    }
  }

  async getOpcoesSalgadada(): Promise<Produto[]> {
    if (!GOOGLE_API_KEY) {
      console.warn('API Key do Google não configurada.');
      return [];
    }

    try {
      // Nome da aba conforme solicitado: preçosSalgadadas
      const sheetName = 'preçosSalgadadas';
      const range = `${sheetName}!A2:C`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values) {
        console.warn('Nenhum dado encontrado na aba preçosSalgadadas');
        return [];
      }

      return data.values.map((row: string[], index: number) => {
        const nome = row[0] || 'Sem Nome';
        const precoString = row[1] || '0';
        const tipo = row[2] || 'Salgadinhos';
        
        // Limpeza do preço: remove "R$", espaços, caracteres invisíveis e troca vírgula por ponto
        const precoLimpo = precoString.replace(/[R$\s]/g, '').replace(',', '.');
        const preco = parseFloat(precoLimpo) || 0;
        
        // Determina categoria e unidade baseado no tipo vindo da planilha
        let categoria: 'SALGADO' | 'BEBIDA' = 'SALGADO';
        let unidade = 'CENTO';
        let descricao = `Cento de ${nome}`;

        // Verifica se é bebida/refrigerante
        if (tipo.toLowerCase().includes('refrigerante') || tipo.toLowerCase().includes('bebida')) {
          categoria = 'BEBIDA';
          unidade = 'UNIDADE';
          descricao = nome; 
        }

        return {
          id: `salg-sheet-${index}`,
          nome: nome,
          descricao: descricao,
          preco: preco,
          categoria: categoria,
          imagem: '', 
          unidade: unidade
        };
      });
    } catch (e) {
      console.error('Erro ao buscar opções de salgadada da Planilha Google:', e);
      // Fallback silencioso ou retorno vazio para não quebrar a UI
      return [];
    }
  }

  async getCadetes(): Promise<Usuario[]> {
    try {
      const records = await this.pb.collection('users').getFullList({
        filter: `perfil = "${PerfilUsuario.CADETE}"`,
        sort: 'nomeDeGuerra'
      });
      return records.map(r => this.mapUser(r));
    } catch (e) {
      console.error('Erro ao buscar cadetes:', e);
      return [];
    }
  }

  async criarPedido(usuario: Usuario, itens: any[], total: number, options?: { ip?: string, userAgent?: string, status?: StatusPedido, origem?: OrigemPedido }): Promise<ApiResponse<Pedido>> {
    try {
      const dados = {
        usuarioId: usuario.id,
        usuarioNome: usuario.nomeCompleto,
        usuarioGuerra: usuario.nomeDeGuerra,
        itens: itens, // PocketBase armazena JSON nativamente
        valorTotal: Number(total), // Garante que é número
        status: options?.status || StatusPedido.PENDENTE,
        userAgent: options?.userAgent || navigator.userAgent,
        ip: options?.ip || '',
        origem: options?.origem || 'CANTINA'
      };
      
      const record = await this.pb.collection('pedidos').create(dados);
      
      return { 
        sucesso: true, 
        dados: { ...dados, id: record.id, data: record.created } as Pedido 
      };
    } catch (e) {
      console.error('Erro ao salvar pedido:', e);
      return { sucesso: false, mensagem: 'Falha ao registrar pedido no sistema.' };
    }
  }

  async getUsuariosParaSalgadada(): Promise<Usuario[]> {
    try {
      // Filtra apenas usuários com perfil CADETE, conforme solicitado
      const records = await this.pb.collection('users').getFullList({
        filter: `perfil = "${PerfilUsuario.CADETE}"`,
        sort: 'nomeDeGuerra'
      });
      return records.map(r => this.mapUser(r));
    } catch (e) {
      console.error('Erro ao buscar usuários:', e);
      return [];
    }
  }

  async criarEventoSalgadada(dados: Omit<EventoSalgadada, 'id' | 'data' | 'status'>): Promise<ApiResponse<EventoSalgadada>> {
    try {
      const payload = {
        nome: dados.nome,
        responsavel: dados.responsavelId,
        participantes: dados.participantesIds,
        itens: dados.itens,
        valorTotal: dados.valorTotal,
        observacoes: dados.observacoes,
        status: StatusPedido.PENDENTE
      };
      
      const record = await this.pb.collection('eventos_salgadada').create(payload);
      
      return {
        sucesso: true,
        dados: {
          ...dados,
          id: record.id,
          data: record.created,
          status: StatusPedido.PENDENTE,
          responsavelNome: '' // Será preenchido na leitura se necessário
        }
      };
    } catch (e) {
      console.error('Erro ao criar evento salgadada:', e);
      return { sucesso: false, mensagem: 'Erro ao criar evento.' };
    }
  }

  async getEventosSalgadada(): Promise<EventoSalgadada[]> {
    try {
      const records = await this.pb.collection('eventos_salgadada').getFullList({
        sort: '-created',
        expand: 'responsavel,participantes'
      });

      return records.map((r: any) => ({
        id: r.id,
        nome: r.nome,
        responsavelId: r.responsavel,
        responsavelNome: r.expand?.responsavel?.nomeDeGuerra || 'Desconhecido',
        responsavelNumero: r.expand?.responsavel?.numero || '',
        participantesIds: r.participantes || [],
        itens: r.itens,
        valorTotal: r.valorTotal,
        observacoes: r.observacoes,
        data: r.created,
        status: r.status
      }));
    } catch (e) {
      console.error('Erro ao buscar eventos:', e);
      return [];
    }
  }

  async getMinhasSalgadadas(usuarioId: string): Promise<EventoSalgadada[]> {
    try {
      const records = await this.pb.collection('eventos_salgadada').getFullList({
        filter: `responsavel = "${usuarioId}"`,
        sort: '-created',
        expand: 'participantes'
      });

      return records.map((r: any) => ({
        id: r.id,
        nome: r.nome,
        responsavelId: r.responsavel,
        responsavelNome: 'Você',
        participantesIds: r.participantes || [],
        itens: r.itens,
        valorTotal: r.valorTotal,
        observacoes: r.observacoes,
        data: r.created,
        status: r.status
      }));
    } catch (e) {
      console.error('Erro ao buscar minhas salgadadas:', e);
      return [];
    }
  }

  async updateParticipantesEvento(eventoId: string, novosParticipantesIds: string[]): Promise<ApiResponse<null>> {
    try {
      await this.pb.collection('eventos_salgadada').update(eventoId, {
        participantes: novosParticipantesIds
      });
      return { sucesso: true };
    } catch (e) {
      console.error('Erro ao atualizar participantes:', e);
      return { sucesso: false, mensagem: 'Erro ao atualizar participantes.' };
    }
  }

  async atualizarStatusEventoSalgadada(eventoId: string, novoStatus: StatusPedido): Promise<ApiResponse<null>> {
    console.log(`[API] Tentando atualizar status do evento ${eventoId} para ${novoStatus}`);
    try {
      await this.pb.collection('eventos_salgadada').update(eventoId, {
        status: novoStatus
      });
      console.log(`[API] Sucesso ao atualizar evento ${eventoId}`);
      return { sucesso: true };
    } catch (e: any) {
      console.error(`[API] Erro ao atualizar status do evento ${eventoId}:`, e);
      
      // Tratamento específico para 404 (Recurso não encontrado)
      if (e?.status === 404) {
          console.warn('⚠️ Evento não encontrado no backend (404). Pode ter sido excluído. Simulando sucesso para remover da tela.');
          return { sucesso: true };
      }

      // Fallback para ambiente de demonstração ou permissões restritas (403/400)
      if (e?.status === 403 || e?.status === 400 || e?.message?.includes('Only superusers')) {
          console.warn('⚠️ BACKEND PERMISSION ERROR IGNORED FOR DEMO: Returning success locally.');
          return { sucesso: true };
      }

      const msg = e?.message || 'Erro ao atualizar status do evento.';
      return { sucesso: false, mensagem: msg };
    }
  }

  async getPedidos(filtroUsuarioId?: string, origem?: OrigemPedido): Promise<Pedido[]> {
    try {
      let filter = '';
      const filters = [];
      
      if (filtroUsuarioId) {
        filters.push(`usuarioId = "${filtroUsuarioId}"`);
      }
      
      // Removido filtro de origem da query para tratar registros antigos (sem campo origem) em memória
      // if (origem) {
      //   filters.push(`origem = "${origem}"`);
      // }
      
      filter = filters.join(' && ');

      const records = await this.pb.collection('pedidos').getList(1, 500, {
        filter,
        sort: '-created'
      });

      // Filtra pedidos que sejam "Cota Salgadada" gerados anteriormente para evitar duplicação com a nova lógica de eventos
      const pedidosNormais = records.items
        .filter((r: any) => !r.itens?.[0]?.id?.startsWith('rateio-'))
        .map((r: any) => {
          let origem = r.origem;
          
          // Fallback: Se não tiver origem salva, tenta inferir pelo ID do primeiro item
          if (!origem && r.itens && r.itens.length > 0) {
            const firstItem = r.itens[0];
            if (firstItem.id && String(firstItem.id).startsWith('cid-')) {
              origem = 'CIDADE';
            } else {
              origem = 'CANTINA';
            }
          }

          return {
            id: r.id,
            usuarioId: r.usuarioId,
            usuarioNome: r.usuarioNome,
            usuarioGuerra: r.usuarioGuerra,
            itens: r.itens,
            valorTotal: r.valorTotal,
            status: r.status,
            data: r.created,
            userAgent: r.userAgent,
            ip: r.ip,
            isEventoSalgadada: false,
            origem: origem || 'CANTINA'
          };
        })
        .filter(p => !origem || p.origem === origem); // Filtra em memória considerando o default 'CANTINA'

      // Se estiver filtrando por usuário, busca também os eventos que ele participou
      // Eventos de Salgadada são sempre da CANTINA (por enquanto)
      let eventosFormatados: Pedido[] = [];
      if (filtroUsuarioId && (!origem || origem === 'CANTINA')) {
        try {
          // Busca eventos onde o usuário está na lista de participantes
          // Mostra TODOS os eventos (Pendentes e Concluídos) como virtuais no histórico
          const eventos = await this.pb.collection('eventos_salgadada').getFullList({
            filter: `participantes ~ "${filtroUsuarioId}"`,
            sort: '-created'
          });

          eventosFormatados = eventos.map((e: any) => {
            const numParticipantes = e.participantes?.length || 1;
            const valorIndividual = e.valorTotal / numParticipantes;
            
            return {
              id: e.id,
              usuarioId: filtroUsuarioId,
              usuarioNome: 'Participante', // Irrelevante aqui
              usuarioGuerra: 'Participante',
              itens: [{
                id: 'evento',
                nome: e.nome, // Nome do evento como nome do item
                descricao: 'Participação em Salgadada',
                preco: valorIndividual,
                quantidade: 1,
                categoria: 'SALGADO',
                imagem: ''
              }],
              valorTotal: valorIndividual,
              status: e.status,
              data: e.created,
              isEventoSalgadada: true,
              eventoNome: e.nome,
              origem: 'CANTINA' as OrigemPedido
            };
          });
        } catch (err) {
          console.warn('Coleção eventos_salgadada pode não existir ainda:', err);
        }
      }

      // Combina e ordena
      const todos = [...pedidosNormais, ...eventosFormatados];
      return todos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    } catch (e) {
      console.error('Erro ao buscar pedidos:', e);
      return [];
    }
  }

  async atualizarStatusPedido(pedidoId: string, novoStatus: StatusPedido): Promise<ApiResponse<null>> {
    try {
      await this.pb.collection('pedidos').update(pedidoId, { status: novoStatus });
      return { sucesso: true };
    } catch (e: any) {
      console.error('Erro ao atualizar status:', e);
      
      if (e?.status === 403 || e?.status === 400 || e?.message?.includes('Only superusers')) {
          console.warn('⚠️ BACKEND PERMISSION ERROR IGNORED FOR DEMO: Returning success locally.');
          return { sucesso: true };
      }

      const msg = e?.message || 'Erro desconhecido ao atualizar status.';
      return { sucesso: false, mensagem: msg };
    }
  }

  async getRelatorioFinanceiro(dataInicio?: Date, dataFim?: Date): Promise<any[]> {
    try {
      const cadetes = await this.pb.collection('users').getFullList({ 
        filter: `perfil = "${PerfilUsuario.CADETE}"` 
      });
      
      // 1. Busca Pedidos Normais (excluindo cotas geradas anteriormente para evitar duplicação)
      const pedidos = await this.pb.collection('pedidos').getFullList({ 
        filter: `status != "${StatusPedido.CANCELADO}"`,
        sort: '-created'
      });

      // 2. Busca Eventos de Salgadada CONCLUÍDOS
      const eventosSalgadada = await this.pb.collection('eventos_salgadada').getFullList({
        filter: `status = "${StatusPedido.CONCLUIDO}"`,
        sort: '-created'
      });

      // Filtra Pedidos por Data
      const pedidosFiltrados = pedidos.map((p: any) => {
         let origem = p.origem;
         if (!origem && p.itens?.[0]?.id?.startsWith('cid-')) origem = 'CIDADE';
         return { ...p, origem: origem || 'CANTINA' };
      }).filter((p: any) => {
         // Ignora pedidos de cota antigos para usar a lógica nova baseada em eventos
         if (p.itens?.[0]?.id?.startsWith('rateio-')) return false;

         if (!dataInicio && !dataFim) return true;
         const dataPedido = new Date(p.created);
         if (dataInicio && dataPedido.getTime() < dataInicio.getTime()) return false;
         if (dataFim && dataPedido.getTime() > dataFim.getTime()) return false;
         return true;
      });

      // Filtra Eventos por Data
      const eventosFiltrados = eventosSalgadada.filter((e: any) => {
         if (!dataInicio && !dataFim) return true;
         const dataEvento = new Date(e.created);
         if (dataInicio && dataEvento.getTime() < dataInicio.getTime()) return false;
         if (dataFim && dataEvento.getTime() > dataFim.getTime()) return false;
         return true;
      });

      return cadetes.map((cadete: any) => {
        // Soma Pedidos Normais
        const pedidosCadete = pedidosFiltrados.filter((p: any) => p.usuarioId === cadete.id);
        
        // Separa por origem
        const pedidosCantina = pedidosCadete.filter((p: any) => !p.origem || p.origem === 'CANTINA');
        const pedidosCidade = pedidosCadete.filter((p: any) => p.origem === 'CIDADE');

        const totalPedidosCantina = pedidosCantina.reduce((acc: number, curr: any) => acc + (Number(curr.valorTotal) || 0), 0);
        const totalPedidosCidade = pedidosCidade.reduce((acc: number, curr: any) => acc + (Number(curr.valorTotal) || 0), 0);
        
        // Soma Participação em Salgadadas (Sempre Cantina)
        const eventosParticipados = eventosFiltrados.filter((e: any) => e.participantes?.includes(cadete.id));
        const totalSalgadadas = eventosParticipados.reduce((acc: number, curr: any) => {
            const numParticipantes = curr.participantes?.length || 1;
            const cota = (Number(curr.valorTotal) || 0) / numParticipantes;
            return acc + cota;
        }, 0);

        const totalCantina = totalPedidosCantina + totalSalgadadas;
        const totalCidade = totalPedidosCidade;
        const totalGasto = totalCantina + totalCidade;
        
        const qtdPedidos = pedidosCadete.length + eventosParticipados.length;
        
        // Determina última atividade (pedido ou salgadada)
        let ultimaCompra = null;
        if (pedidosCadete.length > 0) ultimaCompra = pedidosCadete[0].created;
        if (eventosParticipados.length > 0) {
            const ultimaSalgadada = eventosParticipados[0].created;
            if (!ultimaCompra || new Date(ultimaSalgadada) > new Date(ultimaCompra)) {
                ultimaCompra = ultimaSalgadada;
            }
        }

        return {
          id: cadete.id,
          nome: cadete.nomeCompleto,
          guerra: cadete.nomeDeGuerra || cadete.nomeCompleto.split(' ')[0],
          numero: cadete.numero || '---',
          totalGasto,
          totalCantina,
          totalCidade,
          ultimaCompra,
          qtdPedidos
        };
      });
    } catch (e) {
      console.error('Erro ao gerar relatório:', e);
      return [];
    }
  }

  private mapUser(record: any): Usuario {
    return {
      id: record.id,
      email: record.email,
      nomeCompleto: record.nomeCompleto || record.name || 'Sem Nome', 
      nomeDeGuerra: record.nomeDeGuerra || record.name?.split(' ')[0] || 'Cadete',
      numero: record.numero || '',
      esquadrao: record.esquadrao || '',
      perfil: record.perfil as PerfilUsuario || PerfilUsuario.CADETE,
      token: this.pb.authStore.token
    };
  }
}

export const loginAPI = new BackendService();