export const getEsquadrao = (numero: string, esquadrao?: string): string => {
  if (esquadrao) return esquadrao;
  if (!numero || numero.length < 2) return '';

  const anoAtual = new Date().getFullYear();
  const anoAtualShort = anoAtual % 100;
  
  // Tenta converter os dois primeiros dígitos para número
  const prefixo = numero.substring(0, 2);
  if (!/^\d+$/.test(prefixo)) return '';
  
  const anoEntrada = parseInt(prefixo, 10);
  
  // Lógica:
  // Ano Atual (26) - Ano Entrada (26) = 0 -> 1º Ano
  // Ano Atual (26) - Ano Entrada (25) = 1 -> 2º Ano
  // Ano Atual (26) - Ano Entrada (24) = 2 -> 3º Ano
  // Ano Atual (26) - Ano Entrada (23) = 3 -> 4º Ano
  
  const diff = anoAtualShort - anoEntrada;
  const anoEsquadrao = diff + 1;
  
  if (anoEsquadrao >= 1 && anoEsquadrao <= 4) {
    return `${anoEsquadrao}º Esquadrão`;
  }
  
  return '';
};
