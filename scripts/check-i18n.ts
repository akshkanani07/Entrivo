import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../src/i18n/locale";

type JsonObject = { [key: string]: string | JsonObject };

const root = process.cwd();
const messageDirectory = path.join(root, "messages");
const sourceDirectories = [
  path.join(root, "src", "app"),
  path.join(root, "src", "components"),
];

function flattenMessages(
  value: JsonObject,
  prefix = "",
  result: Map<string, string> = new Map()
): Map<string, string> {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      result.set(fullKey, child);
    } else {
      flattenMessages(child, fullKey, result);
    }
  }
  return result;
}

function readCatalog(locale: string): Map<string, string> {
  const filePath = path.join(messageDirectory, `${locale}.json`);
  const contents: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!contents || typeof contents !== "object" || Array.isArray(contents)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }
  return flattenMessages(contents as JsonObject);
}

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [entryPath]
      : [];
  });
}

function getStringArgument(node: ts.CallExpression): string | undefined {
  const argument = node.arguments[0];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function getCallName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function collectUsedKeys(filePath: string): Set<string> {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const translatorNamespaces = new Map<string, string>();
  const usedKeys = new Set<string>();

  function collectTranslators(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = ts.isAwaitExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isCallExpression(initializer)) {
        const callName = getCallName(initializer.expression);
        if (callName === "useTranslations" || callName === "getTranslations") {
          translatorNamespaces.set(node.name.text, getStringArgument(initializer) ?? "");
        }
      }
    }
    ts.forEachChild(node, collectTranslators);
  }

  function collectCalls(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const namespace = translatorNamespaces.get(node.expression.text);
      const key = getStringArgument(node);
      if (namespace !== undefined && key) {
        usedKeys.add(namespace ? `${namespace}.${key}` : key);
      }
    }
    ts.forEachChild(node, collectCalls);
  }

  collectTranslators(source);
  collectCalls(source);
  return usedKeys;
}

function placeholders(message: string): string[] {
  return Array.from(message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g), (match) => match[1]).sort();
}

const errors: string[] = [];
const catalogs = new Map(SUPPORTED_LOCALES.map((locale) => [locale, readCatalog(locale)]));
const baseLocale = SUPPORTED_LOCALES[0];
const baseCatalog = catalogs.get(baseLocale)!;

for (const locale of SUPPORTED_LOCALES.slice(1)) {
  const catalog = catalogs.get(locale)!;
  for (const key of baseCatalog.keys()) {
    if (!catalog.has(key)) errors.push(`${locale}: missing message key "${key}".`);
  }
  for (const key of catalog.keys()) {
    if (!baseCatalog.has(key)) errors.push(`${locale}: extra message key "${key}".`);
  }
}

const referencedKeys = new Set<string>();
for (const directory of sourceDirectories) {
  for (const filePath of collectSourceFiles(directory)) {
    for (const key of collectUsedKeys(filePath)) referencedKeys.add(key);
  }
}

for (const key of referencedKeys) {
  for (const locale of SUPPORTED_LOCALES) {
    if (!catalogs.get(locale)!.has(key)) {
      errors.push(`${locale}: source references missing message key "${key}".`);
    }
  }
}

for (const key of baseCatalog.keys()) {
  if (!referencedKeys.has(key)) errors.push(`Unused message key "${key}".`);

  const expected = JSON.stringify(placeholders(baseCatalog.get(key)!));
  for (const locale of SUPPORTED_LOCALES.slice(1)) {
    const message = catalogs.get(locale)!.get(key);
    if (message !== undefined && JSON.stringify(placeholders(message)) !== expected) {
      errors.push(`${locale}: placeholder mismatch for message key "${key}".`);
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n:check failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `i18n:check passed (${SUPPORTED_LOCALES.length} locales, ${baseCatalog.size} message keys).`
  );
}
