
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Ensure worker is set globally for all consumers
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

const preprocessImage = (imageSource: CanvasImageSource, width: number, height: number): string | null => {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(imageSource, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // 1. Grayscale & Stats
        let min = 255, max = 0;
        // Sample pixels to find range (step 4 for speed)
        for (let i = 0; i < data.length; i += 16) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (avg < min) min = avg;
            if (avg > max) max = avg;
        }

        const range = max - min;
        // 2. Adaptive Thresholding Logic
        // If low contrast (range < 50), assume noisy background and clamp harder
        const contrastFactor = range < 50 ? 2 : 1; 
        const threshold = min + (range * 0.6); // Bias towards lighter background being white

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Luminance
            const avg = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Contrast Stretch
            let val = range > 10 ? ((avg - min) / range) * 255 : avg;
            
            // Binarize
            // Text is usually dark on light.
            val = val < threshold ? 0 : 255;

            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.warn("Image Preprocessing Failed", e);
        return null;
    }
};

const renderPdfToImages = async (file: File): Promise<Blob[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const images: Blob[] = [];
    const maxPages = Math.min(pdf.numPages, 5); // Limit pages for Max Mode to avoid browser crash

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        // Scale 3.0 for high quality (~200-250 DPI equivalent)
        const viewport = page.getViewport({ scale: 3.0 }); 
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        
        const processedDataUrl = preprocessImage(canvas, canvas.width, canvas.height);
        
        if (processedDataUrl) {
             const res = await fetch(processedDataUrl);
             images.push(await res.blob());
        } else {
             const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
             if (blob) images.push(blob);
        }
    }
    return images;
};

export const OCRService = {
  recognize: async (file: File | Blob, options: { psm?: number, scale?: number } | number = 6): Promise<string> => {
    try {
      const psm = typeof options === 'number' ? options : (options.psm || 6);
      
      const bitmap = await createImageBitmap(file);
      // Upscale if small image (BNPL screenshots often low res)
      let scale = 1;
      if (typeof options === 'object' && options.scale) {
          scale = options.scale;
      } else if (bitmap.width < 1000) {
          scale = 2;
      }
      
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      
      const processedDataUrl = preprocessImage(bitmap, width, height);
      
      const { data: { text } } = await Tesseract.recognize(
        processedDataUrl || file, 
        'eng',
        { 
            logger: () => {},
            tessedit_pageseg_mode: psm as any, // 6 = Assume a single uniform block of text.
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.:,-/₹$ '
        }
      );
      return text;
    } catch (e) {
      console.error("OCR Failed", e);
      throw new Error("OCR_FAILED");
    }
  },

  recognizePDF: async (file: File): Promise<{ text: string, pages: number }> => {
    try {
        const images = await renderPdfToImages(file);
        let fullText = "";
        
        for (let i = 0; i < images.length; i++) {
             // Use PSM 6 for list-like PDF statements
             const text = await OCRService.recognize(images[i], { psm: 6 });
             fullText += `\n--- Page ${i + 1} ---\n` + text;
        }
        return { text: fullText, pages: images.length };
    } catch (e) {
        console.error("PDF OCR Pipeline Failed", e);
        throw new Error("PDF_OCR_FAILED");
    }
  }
};
