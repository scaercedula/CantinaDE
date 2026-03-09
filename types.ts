export enum PerfilUsuario {
  CADETE = 'CADETE',
  CANTINA = 'CANTINA',
  DIRETORIA = 'DIRETORIA'
}

export enum StatusPedido {
  PENDENTE = 'PENDENTE',
  CONCLUIDO = 'CONCLUIDO',
  CANCELADO = 'CANCELADO'
}

export interface Usuario {
  id: string;
  email: string;
  nomeCompleto: string;
  nomeDeGuerra: string;
  numero: string; // Número do cadete (5 dígitos)
  esquadrao?: string; // Esquadrão do cadete
  perfil: PerfilUsuario;
  senha?: string; // Em produção, isso nunca ficaria no frontend
  token?: string; // Simulando JToken
}

export type OrigemPedido = 'CANTINA' | 'CIDADE';

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  imagem: string;
  categoria: 'SALGADO' | 'BEBIDA' | 'DOCE';
  unidade?: 'UNIDADE' | 'CENTO';
  origem?: OrigemPedido;
}

export interface ItemCarrinho extends Produto {
  quantidade: number;
}

export interface EventoSalgadada {
  id: string;
  nome: string;
  responsavelId: string;
  responsavelNome: string;
  responsavelNumero?: string; // Adicionado para inferir esquadrão
  participantesIds: string[]; // IDs dos usuários participantes
  itens: ItemCarrinho[];
  valorTotal: number;
  observacoes: string;
  data: string;
  status: StatusPedido;
}

export interface Pedido {
  id: string;
  usuarioId: string;
  usuarioNome: string; // Desnormalizado para facilitar
  usuarioGuerra: string;
  itens: ItemCarrinho[];
  valorTotal: number;
  data: string; // ISO String
  status: StatusPedido;
  userAgent?: string;
  ip?: string;
  isEventoSalgadada?: boolean; // Flag para identificar se é um evento
  eventoNome?: string; // Nome do evento se for salgadada
  origem: OrigemPedido;
}

// Interface para respostas simuladas da API
export interface ApiResponse<T> {
  sucesso: boolean;
  dados?: T;
  mensagem?: string;
}