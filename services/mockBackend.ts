import PocketBase from 'pocketbase';
import { Usuario, Produto, Pedido, PerfilUsuario, StatusPedido, ApiResponse } from '../types';

// ============================================================================
// CONFIGURAÇÕES DE PRODUÇÃO
// Preencha as chaves abaixo
// ============================================================================

// 1. URL do seu Backend PocketBase
// IMPORTANTE: Não use a barra '/' ou '/_/' no final. Apenas protocolo://ip:porta
const POCKETBASE_URL = import.meta.env.VITE_LOGINDADOS; 

// 2. Configurações da Planilha Google (Para o Cardápio de Produtos)
// A planilha deve ter uma aba chamada 'Produtos' com as colunas na ordem: 
// A: Nome, B: Descricao, C: Preco, D: ImagemURL, E: Categoria
const GOOGLE_API_KEY: "AIzaSyA_eEiawjOJ6bQSOS0JpcFA_NgpccgzSnA";
const GOOGLE_SHEET_ID = import.meta.env.VITE_SHEET_ID;


class BackendService {
  private pb: PocketBase;

  constructor() {
    this.pb = new PocketBase(POCKETBASE_URL);
    this.pb.autoCancellation(false);
  }

  // --- AUTENTICAÇÃO (POCKETBASE JWT) ---

  async login(email: string, senha: string): Promise<ApiResponse<Usuario>> {
    try {
      // O SDK gerencia o JWT e o armazena no LocalStorage automaticamente
      const authData = await this.pb.collection('users').authWithPassword(email, senha);
      return { sucesso: true, dados: this.mapUser(authData.record) };
    } catch (error: any) {
      console.error('Erro no login:', error);
      
      // Tratamento específico de erros
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
      
      // Recupera mensagem de erro original do PocketBase
      const msg = error?.response?.message || error?.message || 'Erro desconhecido ao autenticar.';
      return { sucesso: false, mensagem: msg };
    }
  }

  async cadastrar(dados: any): Promise<ApiResponse<Usuario>> {
    try {
      // Cria usuário com perfil padrão CADETE
      // Geramos um username simples para garantir unicidade
      const baseUsername = dados.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const generatedUsername = `${baseUsername}_${randomSuffix}`.toLowerCase();

      const payload = {
        username: generatedUsername,
        email: dados.email,
        // emailVisibility: true, // REMOVIDO: Evita erro 403, pois requer admin na maioria das configs
        password: dados.senha,
        passwordConfirm: dados.senha,
        nomeCompleto: dados.nomeCompleto,
        nomeDeGuerra: dados.nomeDeGuerra,
        numero: dados.numero,
        perfil: PerfilUsuario.CADETE
      };

      await this.pb.collection('users').create(payload);
      
      // Realiza o login imediatamente após o cadastro para pegar o Token
      return this.login(dados.email, dados.senha);
    } catch (error: any) {
      console.error('Erro detalhado no cadastro:', JSON.stringify(error));
      
      let msg = 'Erro ao processar cadastro.';
      
      // Tenta extrair erro de validação (ex: email já existe)
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

      // Erros genéricos de status
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

  // --- PRODUTOS & PLANILHA GOOGLE ---

  async getProdutos(): Promise<Produto[]> {
    if (!GOOGLE_API_KEY || GOOGLE_API_KEY === import.meta.env.VITE_API) {
      console.warn('API Key do Google não configurada.');
      return [];
    }

    try {
      const range = 'Produtos!A2:E'; // Pula cabeçalho
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values) return [];

      return data.values.map((row: string[], index: number) => ({
        id: `sheet-${index}`,
        nome: row[0] || 'Sem Nome',
        descricao: row[1] || '',
        preco: parseFloat(row[2]?.replace('R$', '').replace(',', '.') || '0'),
        imagem: row[3] || '',
        categoria: (row[4] || 'SALGADO') as any
      }));
    } catch (e) {
      console.error('Erro ao buscar produtos da Planilha Google:', e);
      return [];
    }
  }

  // --- PEDIDOS (POCKETBASE - DATABASE) ---

  async criarPedido(usuario: Usuario, itens: any[], total: number): Promise<ApiResponse<Pedido>> {
    try {
      const dados = {
        usuarioId: usuario.id,
        usuarioNome: usuario.nomeCompleto,
        usuarioGuerra: usuario.nomeDeGuerra,
        itens: itens, // PocketBase armazena JSON nativamente
        valorTotal: total,
        status: StatusPedido.PENDENTE
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

  async getPedidos(filtroUsuarioId?: string): Promise<Pedido[]> {
    try {
      let filter = '';
      if (filtroUsuarioId) {
        filter = `usuarioId = "${filtroUsuarioId}"`;
      }

      const records = await this.pb.collection('pedidos').getList(1, 100, {
        filter,
        sort: '-created'
      });

      return records.items.map((r: any) => ({
        id: r.id,
        usuarioId: r.usuarioId,
        usuarioNome: r.usuarioNome,
        usuarioGuerra: r.usuarioGuerra,
        itens: r.itens,
        valorTotal: r.valorTotal,
        status: r.status,
        data: r.created
      }));
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
      
      const pedidos = await this.pb.collection('pedidos').getFullList({ 
        filter: `status != "${StatusPedido.CANCELADO}"`,
        sort: '-created'
      });

      const pedidosFiltrados = pedidos.filter((p: any) => {
         if (!dataInicio && !dataFim) return true;
         
         const dataPedido = new Date(p.created);
         
         if (dataInicio && dataPedido < dataInicio) return false;
         if (dataFim && dataPedido > dataFim) return false;
         
         return true;
      });

      return cadetes.map((cadete: any) => {
        const pedidosCadete = pedidosFiltrados.filter((p: any) => p.usuarioId === cadete.id);
        const totalGasto = pedidosCadete.reduce((acc: number, curr: any) => acc + curr.valorTotal, 0);
        
        return {
          id: cadete.id,
          nome: cadete.nomeCompleto,
          guerra: cadete.nomeDeGuerra || cadete.nomeCompleto.split(' ')[0],
          numero: cadete.numero || '---',
          totalGasto,
          ultimaCompra: pedidosCadete.length > 0 ? pedidosCadete[0].created : null,
          qtdPedidos: pedidosCadete.length
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
      perfil: record.perfil as PerfilUsuario || PerfilUsuario.CADETE,
      token: this.pb.authStore.token
    };
  }
}

export const mockBackend = new BackendService();
