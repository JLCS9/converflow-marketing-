// mjml ships no type declarations; we only use the default compile function.
declare module 'mjml' {
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip';
    [key: string]: unknown;
  }
  interface MjmlResult {
    html: string;
    errors: unknown[];
    json?: unknown;
  }
  export default function mjml2html(mjml: string, options?: MjmlOptions): MjmlResult;
}
