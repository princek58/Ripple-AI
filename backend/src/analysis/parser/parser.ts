import { Project, SyntaxKind, type SourceFile, Node } from 'ts-morph';
import type { ScannedFile } from '../scanner/types.js';
import type {
  ParsedFileResult,
  ParsedImport,
  ParsedRoute,
  ParsedMount,
  ParsedApiCall,
  ParsedEnvVar,
} from './types.js';

/**
 * Creates a hermetic in-memory ts-morph Project.
 * Never touches real disks, never loads tsconfigs, never resolves dependencies.
 */
function createInMemoryProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
    },
  });
}

const PARSEABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function isParseableLanguage(filePath: string): boolean {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filePath.slice(dotIdx).toLowerCase();
  return PARSEABLE_EXTENSIONS.has(ext);
}

/**
 * Parses a single project file AST safely.
 * Will never throw or crash on syntax errors or timeout.
 */
export function parseFile(scannedFile: ScannedFile): ParsedFileResult {
  const result: ParsedFileResult = {
    path: scannedFile.path,
    imports: [],
    routes: [],
    mounts: [],
    apiCalls: [],
    envVars: [],
    functions: [],
    packages: [],
  };

  // If sensitive file or declared env file, parse env names line by line (never with AST)
  if (scannedFile.sensitive || scannedFile.path.endsWith('.env.example')) {
    if (scannedFile.content) {
      const lines = scannedFile.content.split(/\r?\n/);
      lines.forEach((line: string, idx: number) => {
        const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=/);
        if (match) {
          result.envVars.push({ name: match[1], line: idx + 1 });
        }
      });
    }
    return result;
  }

  // Non-code files (JSON, Markdown, CSS, images, etc.) are plain file nodes
  if (!isParseableLanguage(scannedFile.path) || !scannedFile.content) {
    return result;
  }

  const startTime = Date.now();
  const PARSE_TIMEOUT_MS = 3000; // 3 seconds per-file parse guard

  try {
    const project = createInMemoryProject();
    const virtualPath = `/project/${scannedFile.path}`;
    const sourceFile: SourceFile = project.createSourceFile(
      virtualPath,
      scannedFile.content,
      { overwrite: true }
    );

    // Check for syntax errors without running type checking
    const parseDiagnostics = (sourceFile.compilerNode as any).parseDiagnostics;
    if (parseDiagnostics && parseDiagnostics.length > 0) {
      const firstDiag = parseDiagnostics[0];
      const msg = typeof firstDiag.messageText === 'string'
        ? firstDiag.messageText
        : (firstDiag.messageText?.messageText || 'Syntax error');
      result.syntaxError = msg;
    }

    // 1. Static Imports & Exports
    for (const importDecl of sourceFile.getImportDeclarations()) {
      if (Date.now() - startTime > PARSE_TIMEOUT_MS) {
        result.syntaxError = 'Parse timeout exceeded';
        return result;
      }

      const specifier = importDecl.getModuleSpecifierValue();
      const line = importDecl.getStartLineNumber();
      const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

      if (isRelative) {
        result.imports.push({
          specifier,
          line,
          isDynamic: false,
          isRequire: false,
          isExport: false,
          isExternal: false,
        });
      } else {
        result.packages.push(specifier);
        result.imports.push({
          specifier,
          line,
          isDynamic: false,
          isRequire: false,
          isExport: false,
          isExternal: true,
        });
      }
    }

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      if (exportDecl.hasModuleSpecifier()) {
        const specifier = exportDecl.getModuleSpecifierValue();
        if (specifier) {
          const line = exportDecl.getStartLineNumber();
          const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
          result.imports.push({
            specifier,
            line,
            isDynamic: false,
            isRequire: false,
            isExport: true,
            isExternal: !isRelative,
          });
        }
      }
    }

    // 2. Call Expressions: require(), dynamic import(), Express routes/mounts, fetch(), axios
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const callExpr of callExpressions) {
      if (Date.now() - startTime > PARSE_TIMEOUT_MS) {
        result.syntaxError = 'Parse timeout exceeded';
        return result;
      }

      const expr = callExpr.getExpression();
      const exprText = expr.getText();
      const line = callExpr.getStartLineNumber();
      const args = callExpr.getArguments();

      // a) require("x")
      if (exprText === 'require') {
        if (args.length > 0) {
          const arg0 = args[0];
          if (Node.isStringLiteral(arg0)) {
            const specifier = arg0.getLiteralText();
            const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
            if (isRelative) {
              result.imports.push({
                specifier,
                line,
                isDynamic: false,
                isRequire: true,
                isExport: false,
                isExternal: false,
              });
            } else {
              result.packages.push(specifier);
              result.imports.push({
                specifier,
                line,
                isDynamic: false,
                isRequire: true,
                isExport: false,
                isExternal: true,
              });
            }
          } else {
            // require(variable) -> unresolved dynamic require
            result.imports.push({
              line,
              isDynamic: true,
              isRequire: true,
              isExport: false,
              isExternal: false,
              isUnresolved: true,
            });
          }
        }
        continue;
      }

      // b) dynamic import(x)
      if (expr.getKind() === SyntaxKind.ImportKeyword) {
        if (args.length > 0) {
          const arg0 = args[0];
          if (Node.isStringLiteral(arg0)) {
            const specifier = arg0.getLiteralText();
            const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
            result.imports.push({
              specifier,
              line,
              isDynamic: true,
              isRequire: false,
              isExport: false,
              isExternal: !isRelative,
            });
          } else {
            // import(variablePath) -> unresolved dynamic import
            result.imports.push({
              line,
              isDynamic: true,
              isRequire: false,
              isExport: false,
              isExternal: false,
              isUnresolved: true,
            });
          }
        }
        continue;
      }

      // c) Express routes & mounts: app.get/post/use or router.get/post/use
      if (Node.isPropertyAccessExpression(expr)) {
        const methodName = expr.getName().toLowerCase();
        const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'];

        if (HTTP_METHODS.includes(methodName)) {
          if (args.length >= 1) {
            const arg0 = args[0];
            if (Node.isStringLiteral(arg0)) {
              const routePath = arg0.getLiteralText();
              result.routes.push({
                method: methodName.toUpperCase(),
                path: routePath,
                line,
              });
            }
          }
        } else if (methodName === 'use') {
          // Mount check: app.use("/api/notices", router)
          if (args.length >= 2) {
            const arg0 = args[0];
            const arg1 = args[1];
            if (Node.isStringLiteral(arg0)) {
              const prefix = arg0.getLiteralText();
              const routerIdentifier = arg1.getText();
              result.mounts.push({
                prefix,
                routerIdentifier,
                line,
              });
            }
          }
        }
      }

      // d) fetch(url, [options])
      if (exprText === 'fetch') {
        if (args.length >= 1) {
          const arg0 = args[0];
          let method = 'GET';

          // Check if second arg specifies method
          if (args.length >= 2 && Node.isObjectLiteralExpression(args[1])) {
            const methodProp = args[1].getProperty('method');
            if (methodProp && Node.isPropertyAssignment(methodProp)) {
              const init = methodProp.getInitializer();
              if (init && Node.isStringLiteral(init)) {
                method = init.getLiteralText().toUpperCase();
              }
            }
          }

          if (Node.isStringLiteral(arg0)) {
            result.apiCalls.push({
              url: arg0.getLiteralText(),
              method,
              line,
              isRuntimeBuilt: false,
            });
          } else if (Node.isNoSubstitutionTemplateLiteral(arg0)) {
            result.apiCalls.push({
              url: arg0.getLiteralText(),
              method,
              line,
              isRuntimeBuilt: false,
            });
          } else {
            // fetch(baseUrl + id) -> runtime-built URL
            result.apiCalls.push({
              method,
              line,
              isRuntimeBuilt: true,
            });
          }
        }
        continue;
      }

      // e) axios.get/post/etc or axios(url)
      if (Node.isPropertyAccessExpression(expr)) {
        const callerText = expr.getExpression().getText();
        if (callerText === 'axios') {
          const verb = expr.getName().toLowerCase();
          const AXIOS_VERBS = ['get', 'post', 'put', 'patch', 'delete'];

          if (AXIOS_VERBS.includes(verb)) {
            if (args.length >= 1) {
              const arg0 = args[0];
              if (Node.isStringLiteral(arg0)) {
                result.apiCalls.push({
                  url: arg0.getLiteralText(),
                  method: verb.toUpperCase(),
                  line,
                  isRuntimeBuilt: false,
                });
              } else if (Node.isNoSubstitutionTemplateLiteral(arg0)) {
                result.apiCalls.push({
                  url: arg0.getLiteralText(),
                  method: verb.toUpperCase(),
                  line,
                  isRuntimeBuilt: false,
                });
              } else {
                result.apiCalls.push({
                  method: verb.toUpperCase(),
                  line,
                  isRuntimeBuilt: true,
                });
              }
            }
          }
        }
      }
    }

    // 3. Environment Variables: process.env.NAME & process.env["NAME"]
    const propAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    for (const pa of propAccesses) {
      if (pa.getExpression().getText() === 'process.env') {
        const name = pa.getName();
        if (name && name !== 'env') {
          result.envVars.push({ name, line: pa.getStartLineNumber() });
        }
      }
    }

    const elemAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression);
    for (const ea of elemAccesses) {
      if (ea.getExpression().getText() === 'process.env') {
        const arg = ea.getArgumentExpression();
        if (arg && Node.isStringLiteral(arg)) {
          result.envVars.push({ name: arg.getLiteralText(), line: ea.getStartLineNumber() });
        }
      }
    }

    // 4. Top-level function names (for meta)
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name) result.functions.push(name);
    }

    for (const varDecl of sourceFile.getVariableDeclarations()) {
      const init = varDecl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        result.functions.push(varDecl.getName());
      }
    }

    result.packages = Array.from(new Set(result.packages)).sort();
    result.functions = Array.from(new Set(result.functions)).sort();
  } catch (err: unknown) {
    // Record syntax error or crash cleanly, never crash the scan
    result.syntaxError = err instanceof Error ? err.message : String(err);
  }

  return result;
}
