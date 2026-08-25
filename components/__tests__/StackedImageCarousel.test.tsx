import { describe, test, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StackedImageCarousel } from '../StackedImageCarousel';
import { SkinType } from '../../types';

describe('StackedImageCarousel Component', () => {
  const singleImage = [
    {
      url: 'https://upload.wikimedia.org/zion1.jpg',
      caption: 'Zion Canyon Scenic Drive',
      attribution: 'National Park Service',
    },
  ];

  const twoImages = [
    {
      url: 'https://upload.wikimedia.org/zion1.jpg',
      caption: 'Zion Canyon Scenic Drive',
      attribution: 'National Park Service',
    },
    {
      url: 'https://upload.wikimedia.org/zion2.jpg',
      caption: 'The Narrows in Zion',
      attribution: 'Wikimedia Commons',
    },
  ];

  const multipleImages = [
    {
      url: 'https://upload.wikimedia.org/matterhorn1.jpg',
      caption: 'Matterhorn Peak',
      attribution: 'Wikimedia Commons, User XYZ',
    },
    {
      url: 'https://upload.wikimedia.org/matterhorn2.jpg',
      caption: 'North face of the Matterhorn',
      attribution: 'Photo: Alpine Club',
    },
    {
      url: 'https://upload.wikimedia.org/matterhorn3.jpg',
      caption: 'Matterhorn at sunrise',
      attribution: 'NASA Earth Observatory',
    },
    {
      url: 'https://upload.wikimedia.org/matterhorn4.jpg',
      caption: 'Matterhorn from Zermatt valley',
    },
  ];

  describe('Single image presentation', () => {
    it('renders only the active image without pile background layers or navigation controls', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={singleImage}
          locationName="Zion National Park"
          skin="modern"
        />
      );

      // Image is rendered
      expect(html).toContain('src="https://upload.wikimedia.org/zion1.jpg"');
      expect(html).toContain('Zion Canyon Scenic Drive');

      // No pile layers rendered
      expect(html).not.toContain('data-testid="pile-layer-1"');
      expect(html).not.toContain('data-testid="pile-layer-2"');

      // No navigation controls or counter rendered
      expect(html).not.toContain('data-testid="carousel-prev"');
      expect(html).not.toContain('data-testid="carousel-next"');
      expect(html).not.toContain('data-testid="carousel-counter"');
    });
  });

  describe('Multiple images stacked pile presentation & increased offsets', () => {
    it('renders 1 background pile layer for exactly two images with increased offset', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={twoImages}
          locationName="Zion National Park"
          skin="modern"
        />
      );

      // Active image
      expect(html).toContain('src="https://upload.wikimedia.org/zion1.jpg"');

      // 1 pile layer rendered with increased offset (-6px, 4px, -2deg)
      expect(html).toContain('data-testid="pile-layer-1"');
      expect(html).toContain('translate3d(-6px, 4px, 0)');
      expect(html).toContain('rotate(-2deg)');
      expect(html).toContain('src="https://upload.wikimedia.org/zion2.jpg"');
      expect(html).not.toContain('data-testid="pile-layer-2"');

      // Navigation controls and counter
      expect(html).toContain('data-testid="carousel-prev"');
      expect(html).toContain('data-testid="carousel-next"');
      expect(html).toContain('data-testid="carousel-counter"');
      expect(html).toContain('1 / 2');
    });

    it('renders 2 background pile layers for 3+ images with increased offsets and underlying photos', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
        />
      );

      // Active image
      expect(html).toContain('src="https://upload.wikimedia.org/matterhorn1.jpg"');

      // Both pile layers rendered with increased offsets and real image urls
      expect(html).toContain('data-testid="pile-layer-1"');
      expect(html).toContain('translate3d(-6px, 4px, 0)');
      expect(html).toContain('rotate(-2deg)');
      expect(html).toContain('src="https://upload.wikimedia.org/matterhorn2.jpg"');

      expect(html).toContain('data-testid="pile-layer-2"');
      expect(html).toContain('translate3d(7px, 6px, 0)');
      expect(html).toContain('rotate(2deg)');
      expect(html).toContain('src="https://upload.wikimedia.org/matterhorn3.jpg"');

      // Navigation controls and counter
      expect(html).toContain('data-testid="carousel-prev"');
      expect(html).toContain('data-testid="carousel-next"');
      expect(html).toContain('data-testid="carousel-counter"');
      expect(html).toContain('1 / 4');
    });
  });

  describe('Deduplication and empty array handling', () => {
    it('returns null when images array is empty', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={[]}
          locationName="Empty Location"
          skin="modern"
        />
      );

      expect(html).toBe('');
    });

    it('deduplicates duplicate image URLs deterministically', () => {
      const duplicatedImages = [
        { url: 'https://example.com/photo.jpg', caption: 'Photo 1' },
        { url: 'https://example.com/photo.jpg', caption: 'Duplicate Photo' },
        { url: 'https://example.com/photo2.jpg', caption: 'Photo 2' },
      ];

      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={duplicatedImages}
          locationName="Test Place"
          skin="modern"
        />
      );

      // Counter should show 1 / 2 (since duplicate url was pruned)
      expect(html).toContain('1 / 2');
      expect(html).not.toContain('1 / 3');
    });
  });

  describe('Theme compatibility & Cross-Theme Pile Consistency', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      it(`renders full stacked photograph pile with real rear image thumbnails for skin: ${skin}`, () => {
        const threeImages = [
          { url: 'https://upload.wikimedia.org/photo1.jpg', caption: 'Photo One' },
          { url: 'https://upload.wikimedia.org/photo2.jpg', caption: 'Photo Two' },
          { url: 'https://upload.wikimedia.org/photo3.jpg', caption: 'Photo Three' },
        ];

        const html = renderToStaticMarkup(
          <StackedImageCarousel
            images={threeImages}
            locationName="Matterhorn"
            skin={skin}
          />
        );

        // Core component attributes
        expect(html).toContain('data-testid="stacked-image-carousel"');
        expect(html).toContain('data-image-count="3"');
        expect(html).toContain('1 / 3');

        // Active front card with first image
        expect(html).toContain('src="https://upload.wikimedia.org/photo1.jpg"');

        // Middle rear layer (pile-layer-1) exists and contains second image
        expect(html).toContain('data-testid="pile-layer-1"');
        expect(html).toContain('translate3d(-6px, 4px, 0)');
        expect(html).toContain('rotate(-2deg)');
        expect(html).toContain('src="https://upload.wikimedia.org/photo2.jpg"');

        // Bottom rear layer (pile-layer-2) exists and contains third image
        expect(html).toContain('data-testid="pile-layer-2"');
        expect(html).toContain('translate3d(7px, 6px, 0)');
        expect(html).toContain('rotate(2deg)');
        expect(html).toContain('src="https://upload.wikimedia.org/photo3.jpg"');

        // Theme-specific styling & theme color image filtering checks
        if (skin === 'modern') {
          expect(html).toContain('rounded-lg');
          expect(html).toContain('border-white/20');
          expect(html).toContain('text-white/90');
          expect(html).not.toContain('hue-rotate');
        } else if (skin === 'retro-green') {
          expect(html).toContain('border-green-400');
          expect(html).toContain('font-retro');
          expect(html).toContain('text-green-300');
          expect(html).toContain('hue-rotate(88deg)');
        } else if (skin === 'retro-amber') {
          expect(html).toContain('border-amber-400');
          expect(html).toContain('font-retro');
          expect(html).toContain('text-amber-300');
          expect(html).toContain('hue-rotate(5deg)');
        } else if (skin === 'parchment') {
          expect(html).toContain('border-[#8b5a2b]');
          expect(html).toContain('font-serif');
          expect(html).toContain('text-amber-100/90');
          expect(html).not.toContain('hue-rotate');
        }
      });
    });

    it('renders enlarged lightbox images with retro theme colors and CRT scanlines in retro-green and retro-amber', () => {
      const greenLightbox = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-green"
          initialLightboxOpen={true}
        />
      );
      expect(greenLightbox).toContain('data-testid="lightbox-image"');
      expect(greenLightbox).toContain('hue-rotate(88deg)');
      expect(greenLightbox).toContain('data-testid="lightbox-crt-scanlines"');
      expect(greenLightbox).toContain('data-testid="lightbox-close"');
      expect(greenLightbox).toContain('text-green-300');
      expect(greenLightbox).toContain('border-green-400');
      expect(greenLightbox).toContain('data-testid="lightbox-prev"');
      expect(greenLightbox).toContain('data-testid="lightbox-next"');
      expect(greenLightbox).toContain('data-testid="lightbox-counter"');
      expect(greenLightbox).toContain('font-retro');

      const amberLightbox = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-amber"
          initialLightboxOpen={true}
        />
      );
      expect(amberLightbox).toContain('data-testid="lightbox-image"');
      expect(amberLightbox).toContain('hue-rotate(5deg)');
      expect(amberLightbox).toContain('data-testid="lightbox-crt-scanlines"');
      expect(amberLightbox).toContain('data-testid="lightbox-close"');
      expect(amberLightbox).toContain('text-amber-300');
      expect(amberLightbox).toContain('border-amber-400');
      expect(amberLightbox).toContain('data-testid="lightbox-prev"');
      expect(amberLightbox).toContain('data-testid="lightbox-next"');
      expect(amberLightbox).toContain('data-testid="lightbox-counter"');
      expect(amberLightbox).toContain('font-retro');

      const modernLightbox = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
          initialLightboxOpen={true}
        />
      );
      expect(modernLightbox).toContain('data-testid="lightbox-image"');
      expect(modernLightbox).not.toContain('hue-rotate');
      expect(modernLightbox).not.toContain('data-testid="lightbox-crt-scanlines"');
    });
  });

  describe('Accessibility and Interaction attributes', () => {
    it('provides accessible button controls and roles', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
        />
      );

      expect(html).toContain('aria-label="Previous image"');
      expect(html).toContain('aria-label="Next image"');
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-label="View enlarged image: Matterhorn Peak"');
    });
  });

  describe('Lightbox Image Caption Alignment and Theme Typography', () => {
    it('renders lightbox caption wrapper aligned with the image container', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
          initialLightboxOpen={true}
        />
      );

      expect(html).toContain('data-testid="lightbox-modal"');
      expect(html).toContain('data-testid="lightbox-image"');
      expect(html).toContain('data-testid="lightbox-caption"');
      expect(html).toContain('data-testid="lightbox-footer"');
      expect(html).toContain('w-0 min-w-full text-left px-1');
      expect(html).toContain('flex flex-col items-start justify-center');
    });

    it('renders Parchment theme lightbox caption with font-garamond, font-normal, and text-sm', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="parchment"
          initialLightboxOpen={true}
        />
      );

      // Extract the lightbox-caption div from html
      const captionMatch = html.match(/<div[^>]*data-testid="lightbox-caption"[^>]*>/);
      expect(captionMatch).toBeTruthy();
      const captionTag = captionMatch![0];

      expect(captionTag).toContain('font-garamond');
      expect(captionTag).toContain('font-normal');
      expect(captionTag).toContain('text-sm');
      expect(captionTag).toContain('text-amber-100/90');
      expect(captionTag).not.toContain('font-bold');
      expect(captionTag).not.toContain('font-medium');
      expect(captionTag).not.toContain('font-serif');
    });

    it('preserves other themes typography for lightbox caption', () => {
      const modernHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
          initialLightboxOpen={true}
        />
      );
      expect(modernHtml).toContain('font-sans');
      expect(modernHtml).not.toContain('font-garamond');

      const retroGreenHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-green"
          initialLightboxOpen={true}
        />
      );
      expect(retroGreenHtml).toContain('font-retro');
      expect(retroGreenHtml).toContain('text-green-300');
      expect(retroGreenHtml).not.toContain('font-garamond');

      const retroAmberHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-amber"
          initialLightboxOpen={true}
        />
      );
      expect(retroAmberHtml).toContain('font-retro');
      expect(retroAmberHtml).toContain('text-amber-300');
      expect(retroAmberHtml).not.toContain('font-garamond');
    });
  });

  describe('Lightbox Image Magnifier & Theme Styling', () => {
    it('renders magnifier button and hidden enlarged lens by default when lightbox is open', () => {
      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
          initialLightboxOpen={true}
        />
      );

      expect(html).toContain('data-testid="lightbox-magnifier-btn"');
      expect(html).toContain('title="Enable magnifier"');
      expect(html).toContain('aria-label="Enable magnifier"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('lucide-zoom-in');
      expect(html).not.toContain('Magnifier ON');
      expect(html).not.toContain('Magnify');
      expect(html).toContain('data-testid="lightbox-magnifier-lens"');
      expect(html).toContain('w-[226px]');
      expect(html).toContain('h-[226px]');
      expect(html).toContain('display:none');
      // Glass reflection is explicitly disabled
      expect(html).toContain('class="glass-reflection" style="display:none"');
    });

    it('renders theme-specific magnifier controls across Modern (black border), Retro Green, Retro Amber, and Parchment', () => {
      // Modern - black magnifier lens border
      const modernHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="modern"
          initialLightboxOpen={true}
        />
      );
      expect(modernHtml).toContain('border-black');

      // Retro Green - green phosphor border
      const greenHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-green"
          initialLightboxOpen={true}
        />
      );
      expect(greenHtml).toContain('border-green-400');
      expect(greenHtml).toContain('font-retro');

      // Retro Amber - amber phosphor border
      const amberHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="retro-amber"
          initialLightboxOpen={true}
        />
      );
      expect(amberHtml).toContain('border-amber-400');
      expect(amberHtml).toContain('font-retro');

      // Parchment - warm leather/brass border
      const parchmentHtml = renderToStaticMarkup(
        <StackedImageCarousel
          images={multipleImages}
          locationName="Matterhorn"
          skin="parchment"
          initialLightboxOpen={true}
        />
      );
      expect(parchmentHtml).toContain('border-[#8b5a2b]');
      expect(parchmentHtml).toContain('font-serif');
    });
  });
});

