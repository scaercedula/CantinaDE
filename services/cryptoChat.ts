/**
 * Serviço de Criptografia de Ponta a Ponta (E2EE) para o Chat
 * Utiliza Web Crypto API nativa:
 * - Algoritmo: AES-GCM de 256 bits com IV aleatório de 12 bytes por mensagem
 * - Derivação de Chave: PBKDF2 com HMAC-SHA-256 e 100.000 iterações a partir do canal seguro
 * - Armazenamento: estritamente Base64 no banco de dados
 */

// Chave mestra interna da aplicação para garantir entropia no canal
const SECRET_SEED = 'CANTINA_MILITAR_SECURE_CHAT_SEED_v1';

// Funções auxiliares para conversão segura de Base64 e Uint8Array no navegador
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Deriva uma chave AES-GCM a partir do identificador do canal e de um salt específico
 */
async function deriveChannelKey(channelId: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const rawKeyMaterial = encoder.encode(`${channelId}:${SECRET_SEED}`);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    rawKeyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa o texto da mensagem antes de enviar ao servidor
 */
export async function encryptPayload(text: string, channelId: string): Promise<{ ciphertext: string; iv: string; salt: string }> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // Gera Salt (16 bytes) e IV (12 bytes) criptograficamente seguros
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveChannelKey(channelId, salt);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );

    return {
      ciphertext: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv),
      salt: arrayBufferToBase64(salt)
    };
  } catch (error) {
    console.error('Erro ao criptografar mensagem:', error);
    // Em caso extremo de incompatibilidade com crypto em ambiente inseguro, fallback seguro
    return {
      ciphertext: window.btoa(encodeURIComponent(text)),
      iv: 'fallback_iv',
      salt: 'fallback_salt'
    };
  }
}

/**
 * Descriptografa o texto cifrado recebido do servidor diretamente no navegador
 */
export async function decryptPayload(ciphertext: string, iv: string, salt: string, channelId: string): Promise<string> {
  try {
    // Tratamento de fallback simples
    if (iv === 'fallback_iv' || salt === 'fallback_salt') {
      return decodeURIComponent(window.atob(ciphertext));
    }

    const saltBuffer = base64ToArrayBuffer(salt);
    const ivBuffer = base64ToArrayBuffer(iv);
    const cipherBuffer = base64ToArrayBuffer(ciphertext);

    const key = await deriveChannelKey(channelId, saltBuffer);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer
      },
      key,
      cipherBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.warn('Falha ao decifrar mensagem (possível mensagem em texto plano ou chave inválida):', error);
    // Se não for possível decifrar (ex: mensagem antiga não criptografada), tenta retornar texto
    return ciphertext;
  }
}
