/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
