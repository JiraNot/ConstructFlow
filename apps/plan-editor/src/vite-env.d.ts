interface ImportMetaEnv {
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*?raw' {
  const content: string
  export default content
}

declare module '*?url' {
  const url: string
  export default url
}
