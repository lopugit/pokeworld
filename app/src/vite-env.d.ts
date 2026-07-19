/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_THINGTIME_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ThingtimeLoginGrant {
  expiresAt: string;
  scopes: string[];
  sharedThings: number;
  token: string;
  tokenType: "Bearer" | string;
  user: {
    avatarUrl?: string;
    displayName?: string;
    id: string;
    username: string;
  };
}

interface ThingtimeSdk {
  login(options: {
    allowExtra?: boolean;
    clientId: string;
    optionalScopes?: string[];
    scopes?: string[];
  }): Promise<ThingtimeLoginGrant>;
  sdkVersion?: string;
}

interface Window {
  Thingtime?: ThingtimeSdk;
}
