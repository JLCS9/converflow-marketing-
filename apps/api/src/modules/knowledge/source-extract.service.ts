import { Injectable, Logger } from '@nestjs/common';
import { BadRequestError } from '@converflow/shared';
import { htmlToText } from '../../common/utils/email-html.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const URL_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;

/**
 * E3 · Extracción de texto para el Conocimiento: PDF, DOCX, texto plano y
 * páginas web. Sin OCR a propósito: un PDF escaneado devuelve un error claro
 * en vez de conocimiento vacío silencioso.
 */
@Injectable()
export class SourceExtractService {
  private readonly logger = new Logger(SourceExtractService.name);

  async fromFile(file: { buffer: Buffer; filename: string; mimeType: string }): Promise<{
    title: string;
    text: string;
  }> {
    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      throw new BadRequestError('El fichero supera los 10 MB');
    }
    const name = file.filename.toLowerCase();
    const title = file.filename.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) || 'Documento';

    let text = '';
    if (name.endsWith('.pdf') || file.mimeType === 'application/pdf') {
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
        const parsed = await parser.getText();
        await parser.destroy().catch(() => undefined);
        text = parsed.text ?? '';
      } catch (err) {
        this.logger.warn({ err }, 'pdf-parse falló');
        throw new BadRequestError('No se pudo leer el PDF');
      }
    } else if (
      name.endsWith('.docx') ||
      file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = await import('mammoth');
      const parsed = await mammoth.extractRawText({ buffer: file.buffer }).catch((err: Error) => {
        this.logger.warn({ err }, 'mammoth falló');
        throw new BadRequestError('No se pudo leer el documento Word');
      });
      text = parsed.value ?? '';
    } else if (
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      file.mimeType.startsWith('text/')
    ) {
      text = file.buffer.toString('utf8');
    } else {
      throw new BadRequestError('Formato no soportado: sube PDF, Word (.docx), .txt o .md');
    }

    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) {
      // PDF escaneado (solo imágenes) o documento vacío.
      throw new BadRequestError(
        'No se pudo extraer texto del fichero. Si es un PDF escaneado, cópianos el contenido como texto.',
      );
    }
    return { title, text };
  }

  /** Página web pública → texto legible. Guardarraíles anti-SSRF. */
  async fromUrl(rawUrl: string): Promise<{ title: string; text: string }> {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new BadRequestError('URL inválida');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestError('Solo se admiten URLs http(s)');
    }
    const host = url.hostname.toLowerCase();
    if (
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      !host.includes('.')
    ) {
      throw new BadRequestError('Esa dirección no es una web pública');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'ConverflowBot/1.0 (+https://converflow.ai)' },
      });
    } catch {
      throw new BadRequestError('No se pudo cargar la página');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new BadRequestError(`La página respondió ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      throw new BadRequestError('La URL no es una página de texto');
    }
    const raw = (await res.text()).slice(0, MAX_HTML_BYTES);

    const titleMatch = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(raw);
    const title = (titleMatch?.[1]?.trim() || url.hostname).slice(0, 120);
    const text = (type.includes('text/html') ? htmlToText(raw) : raw)
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT_CHARS);
    if (text.length < 100) {
      throw new BadRequestError('La página no tiene texto suficiente que extraer');
    }
    return { title, text };
  }
}
