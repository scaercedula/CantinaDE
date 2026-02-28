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
  perfil: PerfilUsuario;
  senha?: string; // Em produção, isso nunca ficaria no frontend
  token?: string; // Simulando JToken
}

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  imagem: string;
  categoria: 'SALGADO' | 'BEBIDA' | 'DOCE';
}

export interface ItemCarrinho extends Produto {
  quantidade: number;
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
}

// Interface para respostas simuladas da API
export interface ApiResponse<T> {
  sucesso: boolean;
  dados?: T;
  mensagem?: string;
}