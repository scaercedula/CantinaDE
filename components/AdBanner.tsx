import React, { useEffect, useRef } from 'react';

interface AdBannerProps {
  slotId?: string;
  format?: 'auto' | 'horizontal' | 'rectangle';
  className?: string;
  minHeight?: string;
}

const ADSENSE_CLIENT = 'ca-pub-8745046588102355';

export const AdBanner: React.FC<AdBannerProps> = ({
  slotId,
  format = 'auto',
  className = '',
  minHeight = 'min-h-[90px]',
}) => {
  const adRef = useRef<HTMLModElement | null>(null);
  const isPushed = useRef(false);

  useEffect(() => {
    // Evita push duplicado no React StrictMode / re-renders
    if (isPushed.current) return;

    try {
      if (typeof window !== 'undefined') {
        const adsbygoogle = (window as any).adsbygoogle || [];
        adsbygoogle.push({});
        isPushed.current = true;
      }
    } catch (err) {
      // Ignora silenciosamente erros de bloqueador de anúncio ou duplo carregamento
      console.debug('AdSense push info:', err);
    }
  }, []);

  return (
    <aside
      aria-label="Publicidade"
      className={`w-full overflow-hidden my-4 bg-white/70 border border-gray-100 rounded-2xl p-2.5 sm:p-3 text-center transition-all shadow-xs ${minHeight} flex flex-col items-center justify-center ${className}`}
    >
      <div className="flex items-center justify-between w-full mb-1.5 px-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
        <span>Publicidade</span>
        <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Google AdSense</span>
      </div>

      <div className="w-full flex justify-center items-center overflow-hidden">
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', textAlign: 'center' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slotId || undefined}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
};
