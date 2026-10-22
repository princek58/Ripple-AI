export interface ParsedImport {
  specifier?: string; // Target path or package name
  line: number;
  isDynamic: boolean;
  isRequire: boolean;
  isExport: boolean;
  isExternal: boolean;
  isUnresolved?: boolean; // e.g. dynamic import with variable argument or require(variable)
}

export interface ParsedRoute {
  method: string; // 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ALL'
  path: string; // Route path e.g. '/notices' or '/'
  line: number;
}

export interface ParsedMount {
  prefix: string; // e.g. '/api/notices'
  routerIdentifier?: string; // e.g. 'noticesRouter'
  line: number;
}

export interface ParsedApiCall {
  method?: string; // 'GET', 'POST', etc.
  url?: string; // Static URL if literal e.g. '/api/notices'
  line: number;
  isRuntimeBuilt: boolean; // true if expression or non-literal template
}

export interface ParsedEnvVar {
  name: string;
  line: number;
}

export interface ParsedFileResult {
  path: string; // Relative path within project
  imports: ParsedImport[];
  routes: ParsedRoute[];
  mounts: ParsedMount[];
  apiCalls: ParsedApiCall[];
  envVars: ParsedEnvVar[];
  functions: string[];
  packages: string[];
  syntaxError?: string;
}
