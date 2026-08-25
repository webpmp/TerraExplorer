import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { SkinType } from '../types';
import { GalleryImage, cleanMetadataString, formatImageAttribution, isPlaceholderString } from './InfoPanel';
import { getImageFilter } from '../utils/osmPalettes';

export interface StackedImageCarouselProps {
  images: GalleryImage[];
  locationName: string;
  fallbackCaption?: string;
  fallbackAttribution?: string;
  skin: SkinType;
  theme?: any;
  className?: string;
  initialIndex?: number;
  initialLightboxOpen?: boolean;
  onIndexChange?: (index: number) => void;
}

export const StackedImageCarousel: React.FC<StackedImageCarouselProps> = ({
  images: rawImages,
  locationName,
  fallbackCaption,
  fallbackAttribution,
  skin,
  theme = {},
  className = '',
  initialIndex = 0,
  initialLightboxOpen = false,
  onIndexChange,
}) => {
  // Deduplicate and normalize images
  const images = React.useMemo(() => {
    if (!Array.isArray(rawImages)) return [];
    const seenUrls = new Set<string>();
    const result: GalleryImage[] = [];

    for (const item of rawImages) {
      if (!item) continue;
      const url = typeof item === 'string' ? item : item.url;
      if (!url || typeof url !== 'string') continue;
      const cleanUrl = url.trim();
      if (!cleanUrl) continue;

      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        result.push({
          url: cleanUrl,
          caption: cleanMetadataString(typeof item === 'object' ? item.caption : undefined),
          attribution: cleanMetadataString(typeof item === 'object' ? item.attribution : undefined),
        });
      }
    }
    return result;
  }, [rawImages]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex >= 0 && initialIndex < images.length) return initialIndex;
    return 0;
  });

  const [isLightboxOpen, setIsLightboxOpen] = useState(initialLightboxOpen);
  const [animDirection, setAnimDirection] = useState<'next' | 'prev' | null>(null);
  const animTimeoutRef = useRef<number | null>(null);

  // Lightbox Magnifier State
  const [isMagnifierActive, setIsMagnifierActive] = useState(false);
  const [isHoveringImage, setIsHoveringImage] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const magnifiedImgRef = useRef<HTMLImageElement>(null);

  // Reset magnifier mode on lightbox close or image navigation
  useEffect(() => {
    setIsMagnifierActive(false);
    setIsHoveringImage(false);
  }, [isLightboxOpen, currentIndex]);

  // Sync index if images change
  useEffect(() => {
    if (currentIndex >= images.length) {
      setCurrentIndex(0);
      onIndexChange?.(0);
    }
  }, [images.length, currentIndex, onIndexChange]);

  const totalImages = images.length;
  const isMulti = totalImages > 1;

  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  const isParchment = skin === 'parchment';

  const changeImage = useCallback((newIndex: number, direction: 'next' | 'prev') => {
    if (!isMulti) return;
    setIsMagnifierActive(false);
    setIsHoveringImage(false);
    setAnimDirection(direction);
    setCurrentIndex(newIndex);
    onIndexChange?.(newIndex);

    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current);
    }
    animTimeoutRef.current = window.setTimeout(() => {
      setAnimDirection(null);
    }, 350);
  }, [isMulti, onIndexChange]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isMulti) return;
    const nextIdx = (currentIndex + 1) % totalImages;
    changeImage(nextIdx, 'next');
  }, [isMulti, currentIndex, totalImages, changeImage]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isMulti) return;
    const prevIdx = (currentIndex - 1 + totalImages) % totalImages;
    changeImage(prevIdx, 'prev');
  }, [isMulti, currentIndex, totalImages, changeImage]);

  // Mouse move handler for magnifier lens inspection
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMagnifierActive || !imageRef.current || !imageContainerRef.current || !lensRef.current || !magnifiedImgRef.current) {
      return;
    }

    const imgRect = imageRef.current.getBoundingClientRect();
    const containerRect = imageContainerRef.current.getBoundingClientRect();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Check if mouse is strictly inside the rendered image bounds
    if (
      mouseX < imgRect.left ||
      mouseX > imgRect.right ||
      mouseY < imgRect.top ||
      mouseY > imgRect.bottom
    ) {
      if (isHoveringImage) setIsHoveringImage(false);
      return;
    }

    if (!isHoveringImage) setIsHoveringImage(true);

    const relX = mouseX - imgRect.left;
    const relY = mouseY - imgRect.top;

    const lensRadius = 113; // 226px diameter inspection lens (~33% increase from 85px radius)
    const zoomFactor = 2.75; // ~2.75x inspection magnification

    const lensX = mouseX - containerRect.left - lensRadius;
    const lensY = mouseY - containerRect.top - lensRadius;

    lensRef.current.style.left = `${lensX}px`;
    lensRef.current.style.top = `${lensY}px`;

    const magnifiedLeft = -(relX * zoomFactor - lensRadius);
    const magnifiedTop = -(relY * zoomFactor - lensRadius);

    magnifiedImgRef.current.style.left = `${magnifiedLeft}px`;
    magnifiedImgRef.current.style.top = `${magnifiedTop}px`;
    magnifiedImgRef.current.style.width = `${imgRect.width * zoomFactor}px`;
    magnifiedImgRef.current.style.height = `${imgRect.height * zoomFactor}px`;
  };

  // Keyboard navigation when Lightbox is active
  useEffect(() => {
    if (!isLightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsLightboxOpen(false);
      } else if (e.key === 'ArrowRight' && isMulti) {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      } else if (e.key === 'ArrowLeft' && isMulti) {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isLightboxOpen, isMulti, handleNext, handlePrev]);

  // Cleanup animation timeout
  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) {
        window.clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  if (totalImages === 0) return null;

  const currentImg = images[currentIndex] || images[0];
  const layer1Img = isMulti ? images[(currentIndex + 1) % totalImages] : null;
  const layer2Img = totalImages >= 3 ? images[(currentIndex + 2) % totalImages] : null;
  const activeCaption = cleanMetadataString(currentImg.caption) || cleanMetadataString(fallbackCaption);
  const activeAttribution = formatImageAttribution(currentImg.attribution || fallbackAttribution);

  // Theme-specific pile styling classes (geometry and structure remain identical across themes)
  let pileLayer1Style = "rounded-lg border border-white/20 bg-slate-800 shadow-md";
  let pileLayer2Style = "rounded-lg border border-white/15 bg-slate-900 shadow-sm";
  let frontCardStyle = "rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 shadow-lg";
  let counterClass = "bg-black/70 backdrop-blur-sm text-white/90 border border-white/10";
  let navBtnClass = "bg-black/60 hover:bg-black/85 text-white/90";
  let overlay1Class = "bg-black/10";
  let overlay2Class = "bg-black/20";

  if (skin === 'retro-green') {
    pileLayer1Style = "rounded-none border border-green-400/80 bg-black shadow-[0_0_8px_rgba(74,222,128,0.25)]";
    pileLayer2Style = "rounded-none border border-green-400/50 bg-black shadow-[0_0_6px_rgba(74,222,128,0.18)]";
    frontCardStyle = "rounded-none border border-green-400 bg-black hover:bg-green-900/20 shadow-[0_0_12px_rgba(74,222,128,0.25)]";
    counterClass = "bg-black text-green-300 border border-green-400 font-retro";
    navBtnClass = "bg-black hover:bg-green-400 hover:text-black text-green-300 border border-green-400";
    overlay1Class = "bg-green-950/20";
    overlay2Class = "bg-green-950/30";
  } else if (skin === 'retro-amber') {
    pileLayer1Style = "rounded-none border border-amber-400/80 bg-black shadow-[0_0_8px_rgba(251,191,36,0.25)]";
    pileLayer2Style = "rounded-none border border-amber-400/50 bg-black shadow-[0_0_6px_rgba(251,191,36,0.18)]";
    frontCardStyle = "rounded-none border border-amber-400 bg-black hover:bg-amber-900/20 shadow-[0_0_12px_rgba(251,191,36,0.25)]";
    counterClass = "bg-black text-amber-300 border border-amber-400 font-retro";
    navBtnClass = "bg-black hover:bg-amber-400 hover:text-black text-amber-300 border border-amber-400";
    overlay1Class = "bg-amber-950/20";
    overlay2Class = "bg-amber-950/30";
  } else if (skin === 'parchment') {
    pileLayer1Style = "rounded-sm border border-[#8b5a2b]/70 bg-[#ecdcc2] shadow-sm";
    pileLayer2Style = "rounded-sm border border-[#8b5a2b]/50 bg-[#e8d5b5] shadow-xs";
    frontCardStyle = "rounded-sm border border-[#8b5a2b]/80 bg-[#f4ead5] hover:bg-[#e8d5b5] shadow-md";
    counterClass = "bg-[#d2b48c] text-[#3e2723] border border-[#8b5a2b] font-serif";
    navBtnClass = "bg-[#d2b48c]/80 hover:bg-[#d2b48c] text-[#3e2723] border border-[#8b5a2b]";
    overlay1Class = "bg-[#8b5a2b]/5";
    overlay2Class = "bg-[#8b5a2b]/15";
  }

  // Theme color image filters for retro themes (restrained monochrome green and amber phosphor tints)
  const activeImageFilter = getImageFilter(skin, 'active');
  const layer1ImageFilter = getImageFilter(skin, 'pile1');
  const layer2ImageFilter = getImageFilter(skin, 'pile2');

  // Lightbox typography & button styles per skin
  let captionClass = "text-white/90 text-sm md:text-base font-normal font-sans";
  let attributionClass = "text-white/60 text-xs mt-1 font-sans";
  let lightboxCloseBtnClass = "bg-black text-white hover:bg-white/20 border-white/20 rounded-full";
  let lightboxNavBtnClass = "bg-black/75 hover:bg-black text-white border-white/10 rounded-full";
  let lightboxCounterClass = "text-white/50 font-mono";
  let lightboxMagnifierBtnClass = "bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border-white/20 rounded-md";
  let lightboxMagnifierActiveBtnClass = "bg-cyan-500 text-black border-cyan-400 font-bold rounded-md shadow-[0_0_12px_rgba(6,182,212,0.5)]";
  let lightboxLensClass = "border-2 border-black bg-black shadow-[0_0_20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.25)]";

  // Thumbnail caption styling per skin
  let thumbCaptionIconClass = "text-white/80 shrink-0";
  let thumbCaptionTextClass = "text-white/90 text-xs truncate font-medium font-sans";
  let thumbSubtextClass = "text-white/80 text-[11px] truncate font-medium font-sans";

  if (skin === 'retro-green') {
    captionClass = "text-green-300 font-retro text-sm md:text-base";
    attributionClass = "text-green-400/70 text-xs mt-1 font-retro";
    thumbCaptionIconClass = "text-green-300 shrink-0";
    thumbCaptionTextClass = "text-green-300 text-xs md:text-sm truncate font-medium font-retro";
    thumbSubtextClass = "text-green-300/80 text-[11px] md:text-xs truncate font-medium font-retro";
    lightboxCloseBtnClass = "bg-black text-green-300 hover:bg-green-400 hover:text-black border-green-400 rounded-none shadow-[0_0_10px_rgba(74,222,128,0.3)] font-retro";
    lightboxNavBtnClass = "bg-black/90 hover:bg-green-400 hover:text-black text-green-300 border-green-400 rounded-none shadow-[0_0_10px_rgba(74,222,128,0.25)]";
    lightboxCounterClass = "text-green-300/90 font-retro text-sm tracking-wider";
    lightboxMagnifierBtnClass = "bg-black text-green-300/80 hover:bg-green-900/30 hover:text-green-300 border-green-400/50 rounded-none font-retro";
    lightboxMagnifierActiveBtnClass = "bg-green-400 text-black border-green-400 font-bold rounded-none shadow-[0_0_10px_rgba(74,222,128,0.5)] font-retro";
    lightboxLensClass = "border-2 border-green-400 bg-black shadow-[0_0_15px_rgba(74,222,128,0.5)]";
  } else if (skin === 'retro-amber') {
    captionClass = "text-amber-300 font-retro text-sm md:text-base";
    attributionClass = "text-amber-400/70 text-xs mt-1 font-retro";
    thumbCaptionIconClass = "text-amber-300 shrink-0";
    thumbCaptionTextClass = "text-amber-300 text-xs md:text-sm truncate font-medium font-retro";
    thumbSubtextClass = "text-amber-300/80 text-[11px] md:text-xs truncate font-medium font-retro";
    lightboxCloseBtnClass = "bg-black text-amber-300 hover:bg-amber-400 hover:text-black border-amber-400 rounded-none shadow-[0_0_10px_rgba(251,191,36,0.3)] font-retro";
    lightboxNavBtnClass = "bg-black/90 hover:bg-amber-400 hover:text-black text-amber-300 border-amber-400 rounded-none shadow-[0_0_10px_rgba(251,191,36,0.25)]";
    lightboxCounterClass = "text-amber-300/90 font-retro text-sm tracking-wider";
    lightboxMagnifierBtnClass = "bg-black text-amber-300/80 hover:bg-amber-900/30 hover:text-amber-300 border-amber-400/50 rounded-none font-retro";
    lightboxMagnifierActiveBtnClass = "bg-amber-400 text-black border-amber-400 font-bold rounded-none shadow-[0_0_10px_rgba(251,191,36,0.5)] font-retro";
    lightboxLensClass = "border-2 border-amber-400 bg-black shadow-[0_0_15px_rgba(251,191,36,0.5)]";
  } else if (skin === 'parchment') {
    captionClass = "text-amber-100/90 font-garamond font-normal text-sm";
    attributionClass = "text-[#d2b48c]/75 text-xs mt-1 font-serif";
    thumbCaptionIconClass = "text-amber-100/90 shrink-0";
    thumbCaptionTextClass = "text-amber-100/90 text-xs truncate font-normal font-garamond";
    thumbSubtextClass = "text-amber-100/80 text-[11px] truncate font-normal font-garamond";
    lightboxCloseBtnClass = "bg-[#2c1d11] text-[#e8d5b5] hover:bg-[#8b5a2b] hover:text-[#f4ead5] border-[#8b5a2b] rounded-sm shadow-md font-serif";
    lightboxNavBtnClass = "bg-[#2c1d11]/85 hover:bg-[#8b5a2b] text-[#e8d5b5] hover:text-[#f4ead5] border-[#8b5a2b] rounded-sm shadow-md";
    lightboxCounterClass = "text-[#d2b48c]/80 font-serif";
    lightboxMagnifierBtnClass = "bg-[#2c1d11]/85 text-[#e8d5b5] hover:bg-[#8b5a2b] hover:text-[#f4ead5] border-[#8b5a2b] rounded-sm shadow-md font-serif";
    lightboxMagnifierActiveBtnClass = "bg-[#8b5a2b] text-[#f4ead5] border-[#5c3a21] font-bold rounded-sm shadow-md font-serif";
    lightboxLensClass = "border-2 border-[#8b5a2b] bg-[#f4ead5] shadow-[0_4px_15px_rgba(0,0,0,0.5)]";
  }

  const lightboxModal = isLightboxOpen ? (
    <div 
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4 md:p-8 pointer-events-auto select-none" 
      onClick={() => setIsLightboxOpen(false)}
      onWheel={(e) => { e.stopPropagation(); }}
      data-testid="lightbox-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged image view"
    >
      <div 
        className="relative max-w-5xl max-h-[92vh] flex flex-col items-start justify-center pointer-events-auto" 
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button 
          className={`absolute -top-4 -right-4 md:-top-5 md:-right-5 p-2 ${lightboxCloseBtnClass} shadow-lg z-20 transition-colors pointer-events-auto border`} 
          onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
          title="Close image"
          aria-label="Close enlarged image"
          data-testid="lightbox-close"
        >
          <X size={24} />
        </button>

        <div 
          ref={imageContainerRef}
          className="relative max-w-full max-h-[76vh] md:max-h-[80vh] flex items-center justify-center overflow-hidden rounded"
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleImageMouseMove}
          onMouseEnter={() => {
            if (isMagnifierActive) setIsHoveringImage(true);
          }}
          onMouseLeave={() => setIsHoveringImage(false)}
          style={{
            cursor: isMagnifierActive ? 'zoom-in' : 'default'
          }}
        >
          <img 
            ref={imageRef}
            src={currentImg.url} 
            alt={activeCaption || `${locationName} - ${currentIndex + 1}`} 
            className="max-w-[90vw] max-h-[74vh] md:max-h-[78vh] object-contain rounded shadow-2xl select-none"
            style={activeImageFilter ? { filter: activeImageFilter } : undefined}
            data-testid="lightbox-image"
          />

          {/* Magnifier Lens */}
          <div
            ref={lensRef}
            className={`absolute w-[226px] h-[226px] rounded-full overflow-hidden pointer-events-none z-30 ${lightboxLensClass}`}
            style={{
              display: isHoveringImage && isMagnifierActive ? 'block' : 'none',
              boxSizing: 'border-box'
            }}
            data-testid="lightbox-magnifier-lens"
            aria-hidden="true"
          >
            <img
              ref={magnifiedImgRef}
              src={currentImg.url}
              alt=""
              className="absolute max-w-none max-h-none pointer-events-none select-none"
              style={activeImageFilter ? { filter: activeImageFilter } : undefined}
            />
            {/* Explicitly disabled glass reflection */}
            <div className="glass-reflection" style={{ display: 'none' }} />
          </div>

          {/* CRT scanline overlay on lightbox image for retro themes */}
          {isRetro && (
            <div 
              className="absolute inset-0 pointer-events-none rounded z-10"
              style={{
                background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.3))',
                backgroundSize: '100% 4px',
              }}
              data-testid="lightbox-crt-scanlines"
              aria-hidden="true"
            />
          )}
          {isMulti && (
            <>
              <button 
                className={`absolute left-2.5 top-1/2 -translate-y-1/2 p-3 ${lightboxNavBtnClass} transition-colors shadow-lg z-10 pointer-events-auto border`}
                onClick={handlePrev}
                title="Previous image"
                aria-label="Previous image"
                data-testid="lightbox-prev"
              >
                <ChevronLeft size={24} />
              </button>
              <button 
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-3 ${lightboxNavBtnClass} transition-colors shadow-lg z-10 pointer-events-auto border`}
                onClick={handleNext}
                title="Next image"
                aria-label="Next image"
                data-testid="lightbox-next"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>

        {/* Row beneath image: Counter on left, Magnifier button on bottom-right */}
        <div className="mt-2 w-0 min-w-full flex items-center justify-between px-1">
          {isMulti ? (
            <div 
              className={`${lightboxCounterClass} text-xs`} 
              data-testid="lightbox-counter"
            >
              {currentIndex + 1} of {totalImages}
            </div>
          ) : <div />}

          {/* Magnifier Glass Toggle Button (Icon Only) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMagnifierActive(prev => !prev);
            }}
            className={`p-1.5 transition-colors shadow-sm pointer-events-auto border flex items-center justify-center ${
              isMagnifierActive ? lightboxMagnifierActiveBtnClass : lightboxMagnifierBtnClass
            }`}
            title={isMagnifierActive ? "Disable magnifier" : "Enable magnifier"}
            aria-label={isMagnifierActive ? "Disable magnifier" : "Enable magnifier"}
            aria-pressed={isMagnifierActive}
            data-testid="lightbox-magnifier-btn"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Lightbox Footer with Editorial Caption and Attribution */}
        {(activeCaption || activeAttribution) && (
          <div 
            className="mt-2.5 w-0 min-w-full text-left px-1"
            data-testid="lightbox-footer"
          >
            {activeCaption && (
              <div className={`leading-snug ${captionClass}`} data-testid="lightbox-caption">
                {activeCaption}
              </div>
            )}
            {activeAttribution && (
              <div className={`leading-normal ${attributionClass}`} data-testid="lightbox-attribution">
                {activeAttribution}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const renderedLightbox = typeof document !== 'undefined' && document.body
    ? createPortal(lightboxModal, document.body)
    : lightboxModal;

  return (
    <>
      <style>{`
        @keyframes stapleNext {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.85;
          }
          40% {
            transform: translate3d(8px, -3px, 0) rotate(1.8deg) scale(0.99);
            opacity: 0.92;
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 1;
          }
        }
        @keyframes staplePrev {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.85;
          }
          40% {
            transform: translate3d(-8px, -3px, 0) rotate(-1.8deg) scale(0.99);
            opacity: 0.92;
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .staple-anim-next, .staple-anim-prev {
            animation: none !important;
            transition: none !important;
          }
        }
        .staple-anim-next {
          animation: stapleNext 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .staple-anim-prev {
          animation: staplePrev 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
      `}</style>

      {/* Thumbnail / Stacked Pile Area */}
      <div 
        className={`relative w-full ${isMulti ? 'py-1.5 px-2' : ''} select-none ${className}`}
        data-testid="stacked-image-carousel"
        data-image-count={totalImages}
      >
        <div className="relative w-full h-32 md:h-34">
          {/* Pile Background Layer 2 (for 3+ images) */}
          {totalImages >= 3 && layer2Img && (
            <div 
              className={`absolute inset-0 overflow-hidden ${pileLayer2Style} pointer-events-none transition-transform duration-300`}
              style={{
                transform: 'translate3d(7px, 6px, 0) rotate(2deg) scale(0.975)',
                zIndex: 1,
              }}
              data-testid="pile-layer-2"
              aria-hidden="true"
            >
              <img 
                src={layer2Img.url} 
                alt="" 
                className="w-full h-full object-cover"
                style={layer2ImageFilter ? { filter: layer2ImageFilter } : { filter: 'brightness(0.7) contrast(0.9)' }}
                loading="lazy"
              />
              <div className={`absolute inset-0 pointer-events-none ${overlay2Class}`} />
            </div>
          )}

          {/* Pile Background Layer 1 (for 2+ images) */}
          {totalImages >= 2 && layer1Img && (
            <div 
              className={`absolute inset-0 overflow-hidden ${pileLayer1Style} pointer-events-none transition-transform duration-300`}
              style={{
                transform: 'translate3d(-6px, 4px, 0) rotate(-2deg) scale(0.988)',
                zIndex: 2,
              }}
              data-testid="pile-layer-1"
              aria-hidden="true"
            >
              <img 
                src={layer1Img.url} 
                alt="" 
                className="w-full h-full object-cover"
                style={layer1ImageFilter ? { filter: layer1ImageFilter } : { filter: 'brightness(0.85) contrast(0.95)' }}
                loading="lazy"
              />
              <div className={`absolute inset-0 pointer-events-none ${overlay1Class}`} />
            </div>
          )}

          {/* Active Front Card */}
          <div
            className={`relative w-full h-full overflow-hidden cursor-pointer group ${frontCardStyle} transition-colors ${
              animDirection === 'next' ? 'staple-anim-next' : animDirection === 'prev' ? 'staple-anim-prev' : ''
            }`}
            style={{ zIndex: 5 }}
            onClick={() => setIsLightboxOpen(true)}
            role="button"
            tabIndex={0}
            aria-label={`View enlarged image: ${activeCaption || locationName}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsLightboxOpen(true);
              }
            }}
          >
            <img 
              src={currentImg.url} 
              alt={`${locationName} - ${currentIndex + 1}`} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={activeImageFilter ? { filter: activeImageFilter } : undefined}
              loading="lazy"
            />

            {/* Navigation Controls for Multiple Images */}
            {isMulti && (
              <>
                <button 
                  onClick={handlePrev}
                  className={`absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full ${navBtnClass} transition-all opacity-80 group-hover:opacity-100 shadow-md z-10 pointer-events-auto`}
                  title="Previous image"
                  aria-label="Previous image"
                  data-testid="carousel-prev"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={handleNext}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full ${navBtnClass} transition-all opacity-80 group-hover:opacity-100 shadow-md z-10 pointer-events-auto`}
                  title="Next image"
                  aria-label="Next image"
                  data-testid="carousel-next"
                >
                  <ChevronRight size={16} />
                </button>
                <div 
                  className={`absolute top-2 right-2 ${counterClass} text-[10px] font-mono px-2 py-0.5 rounded-full shadow-sm pointer-events-none z-10`}
                  data-testid="carousel-counter"
                >
                  {currentIndex + 1} / {totalImages}
                </div>
              </>
            )}

            {/* Caption / Location Name Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-4 flex items-end gap-2 pointer-events-none z-10">
              <ImageIcon size={14} className={thumbCaptionIconClass} />
              {activeCaption && !isPlaceholderString(activeCaption) ? (
                <span className={thumbCaptionTextClass}>
                  {activeCaption}
                </span>
              ) : (
                <span className={thumbSubtextClass}>
                  {locationName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Render Portal Lightbox outside InfoPanel */}
      {renderedLightbox}
    </>
  );
};

export default StackedImageCarousel;
